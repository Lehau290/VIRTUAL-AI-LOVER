"""
AI Girlfriend – My Virtual Love Server
REST API, Static SPA Server, Web Speech Turn Processing, Meta Webhook, and Realtime Dashboard.
"""
import http.server
import socketserver
import json
import urllib.parse
import os
import mimetypes
import uuid
from datetime import datetime
from database import (
    init_db, get_db, hash_password, verify_password, log_activity, DB_PATH
)
from ai_engine import (
    generate_ai_response, get_system_setting, update_lover_emotion
)
from messenger import (
    verify_meta_webhook, handle_incoming_messenger_event, verify_meta_signature
)
from scheduler import (
    start_scheduler, trigger_instant_proactive_nudge
)

PORT = 3000
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(ROOT_DIR, "static")

SESSIONS = {}

def get_current_user(headers: dict, query_params: dict):
    auth_header = headers.get('Authorization', '')
    token = None
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
    if not token and 'token' in query_params:
        token = query_params['token'][0]

    if token and token in SESSIONS:
        user_id = SESSIONS[token]['user_id']
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, display_name, role, birthday, job, bio FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return dict(row)
    return None

class LoverRequestHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len > 0:
            raw = self.rfile.read(content_len)
            try:
                return json.loads(raw.decode('utf-8'))
            except Exception:
                return {}
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Meta Webhook Challenge verification
        if path == "/api/messenger/webhook":
            mode = query.get("hub.mode", [""])[0]
            token = query.get("hub.verify_token", [""])[0]
            challenge = query.get("hub.challenge", [""])[0]
            valid, response_text = verify_meta_webhook(mode, token, challenge)
            self.send_response(200 if valid else 403)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(response_text.encode('utf-8'))
            return

        # API Routes
        if path.startswith("/api/"):
            user = get_current_user(self.headers, query)

            if path == "/api/auth/me":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM ai_lovers WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user['id'],))
                lover_row = cursor.fetchone()
                conn.close()
                return self.send_json({
                    "user": user,
                    "lover": dict(lover_row) if lover_row else None
                })

            # 1. Dashboard Overview
            if path == "/api/dashboard/overview":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
                lover = dict(cursor.fetchone() or {})
                
                cursor.execute("SELECT COUNT(*) as c FROM chat_messages WHERE user_id = ?", (user['id'],))
                total_messages = cursor.fetchone()['c']
                
                cursor.execute("SELECT COUNT(*) as c FROM chat_messages WHERE user_id = ? AND is_automated = 1", (user['id'],))
                auto_messages = cursor.fetchone()['c']

                cursor.execute("SELECT COUNT(*) as c FROM voice_calls WHERE user_id = ?", (user['id'],))
                total_calls = cursor.fetchone()['c']

                cursor.execute("SELECT is_connected FROM messenger_integrations WHERE user_id = ?", (user['id'],))
                m_row = cursor.fetchone()
                messenger_connected = bool(m_row and m_row['is_connected'])

                # Compute next scheduled message
                now_str = datetime.now().strftime("%H:%M")
                schedule_times = [
                    ("Sáng (Chào ngày mới)", lover.get('morning_time', '07:30')),
                    ("Trưa (Hỏi thăm ăn cơm)", lover.get('lunch_time', '12:00')),
                    ("Chiều (Tan làm nghỉ ngơi)", lover.get('afternoon_time', '17:30')),
                    ("Tối (Chúc ngủ ngon)", lover.get('night_time', '22:30'))
                ]
                next_msg = schedule_times[0]
                for label, t in schedule_times:
                    if t > now_str:
                        next_msg = (label, t)
                        break

                conn.close()
                return self.send_json({
                    "lover": lover,
                    "stats": {
                        "total_messages": total_messages,
                        "auto_messages": auto_messages,
                        "total_calls": total_calls,
                        "messenger_connected": messenger_connected,
                        "next_scheduled_label": next_msg[0],
                        "next_scheduled_time": next_msg[1]
                    }
                })

            # 2. Chat messages with filter & search
            if path == "/api/chat/messages":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                sender_filter = query.get('sender', ['all'])[0]
                search = query.get('search', [''])[0].strip()
                limit = int(query.get('limit', [80])[0])

                conn = get_db()
                cursor = conn.cursor()
                sql = "SELECT * FROM chat_messages WHERE user_id = ?"
                params = [user['id']]

                if sender_filter in ['ai', 'user', 'human_admin']:
                    sql += " AND sender = ?"
                    params.append(sender_filter)
                if search:
                    sql += " AND content LIKE ?"
                    params.append(f"%{search}%")

                sql += " ORDER BY id DESC LIMIT ?"
                params.append(limit)
                cursor.execute(sql, params)
                messages = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({"messages": list(reversed(messages))})

            # 3. Memories
            if path == "/api/memories":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM ai_memories WHERE user_id = ? ORDER BY importance DESC, id DESC", (user['id'],))
                memories = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({"memories": memories})

            # 4. Voice Calls
            if path == "/api/voice/history":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM voice_calls WHERE user_id = ? ORDER BY id DESC LIMIT 30", (user['id'],))
                calls = [dict(r) for r in cursor.fetchall()]
                cursor.execute("SELECT SUM(duration_seconds) as total_sec FROM voice_calls WHERE user_id = ?", (user['id'],))
                tot = cursor.fetchone()['total_sec'] or 0
                conn.close()
                return self.send_json({"calls": calls, "total_seconds": tot})

            # 5. Messenger Status
            if path == "/api/messenger/status":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM messenger_integrations WHERE user_id = ?", (user['id'],))
                m_row = cursor.fetchone()
                cursor.execute("SELECT auto_reply_enabled, human_takeover_mode FROM ai_lovers WHERE user_id = ?", (user['id'],))
                l_row = cursor.fetchone()
                conn.close()
                return self.send_json({
                    "integration": dict(m_row) if m_row else None,
                    "auto_reply_enabled": l_row['auto_reply_enabled'] if l_row else 1,
                    "human_takeover_mode": l_row['human_takeover_mode'] if l_row else 0,
                    "webhook_url": f"http://127.0.0.1:{PORT}/api/messenger/webhook",
                    "verify_token": get_system_setting("messenger_webhook_verify_token", "virtual_ai_lover_verify_2026")
                })

            # 6. Activity Logs
            if path == "/api/logs":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 50", (user['id'],))
                logs = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({"logs": logs})

            # Admin stats & settings
            if path == "/api/admin/stats":
                if not user or user.get('role') != 'admin':
                    return self.send_json({"error": "Forbidden"}, status=403)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) as c FROM users")
                u_cnt = cursor.fetchone()['c']
                cursor.execute("SELECT COUNT(*) as c FROM ai_lovers")
                l_cnt = cursor.fetchone()['c']
                cursor.execute("SELECT COUNT(*) as c FROM chat_messages")
                m_cnt = cursor.fetchone()['c']
                cursor.execute("SELECT COUNT(*) as c FROM voice_calls")
                v_cnt = cursor.fetchone()['c']
                cursor.execute("SELECT COUNT(*) as c FROM ai_memories")
                mem_cnt = cursor.fetchone()['c']
                cursor.execute("SELECT id, email, display_name, role, created_at FROM users ORDER BY id DESC LIMIT 20")
                users_list = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({
                    "stats": {"users": u_cnt, "lovers": l_cnt, "messages": m_cnt, "calls": v_cnt, "memories": mem_cnt},
                    "users": users_list
                })

            if path == "/api/admin/settings":
                if not user or user.get('role') != 'admin':
                    return self.send_json({"error": "Forbidden"}, status=403)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM system_settings")
                settings = {r['key']: r['value'] for r in cursor.fetchall()}
                conn.close()
                return self.send_json({"settings": settings})

            return self.send_json({"error": "Route not found"}, status=404)

        # Serve Frontend Assets
        if path == "/" or path == "":
            path = "/index.html"
        
        rel_path = path.lstrip("/")
        # Try ROOT_DIR first, then STATIC_DIR
        candidate1 = os.path.join(ROOT_DIR, rel_path)
        candidate2 = os.path.join(STATIC_DIR, rel_path)
        full_path = candidate1 if os.path.exists(candidate1) and os.path.isfile(candidate1) else candidate2

        if os.path.exists(full_path) and os.path.isfile(full_path):
            mime_type, _ = mimetypes.guess_type(full_path)
            mime_type = mime_type or "application/octet-stream"
            with open(full_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            fallback = os.path.join(ROOT_DIR, "index.html")
            if os.path.exists(fallback):
                with open(fallback, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_response(404)
                self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Meta Webhook POST
        if path == "/api/messenger/webhook":
            content_len = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_len)
            sig = self.headers.get('X-Hub-Signature-256', '')
            app_secret = get_system_setting("messenger_app_secret", "")
            if not verify_meta_signature(raw_body, sig, app_secret):
                return self.send_json({"error": "Invalid signature"}, status=403)
            try:
                event_data = json.loads(raw_body.decode('utf-8'))
                res = handle_incoming_messenger_event(event_data, is_simulated=False)
                return self.send_json(res)
            except Exception as e:
                return self.send_json({"error": str(e)}, status=500)

        # Auth
        if path == "/api/auth/register":
            body = self.read_json_body()
            email = body.get('email', '').strip().lower()
            password = body.get('password', '')
            name = body.get('display_name', '').strip() or 'Người thương'
            if not email or len(password) < 6:
                return self.send_json({"error": "Vui lòng nhập email và mật khẩu tối thiểu 6 ký tự"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            if cursor.fetchone():
                conn.close()
                return self.send_json({"error": "Email đã tồn tại"}, status=400)

            p_hash = hash_password(password)
            cursor.execute("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)", (email, p_hash, name))
            new_uid = cursor.lastrowid
            cursor.execute("""
            INSERT INTO ai_lovers (user_id, name, avatar_url, first_met_date)
            VALUES (?, 'Ngọc Mai', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80', CURRENT_DATE)
            """, (new_uid,))
            conn.commit()
            conn.close()

            token = str(uuid.uuid4())
            SESSIONS[token] = {"user_id": new_uid, "email": email, "role": "user"}
            return self.send_json({"token": token, "user": {"id": new_uid, "email": email, "display_name": name, "role": "user"}})

        if path == "/api/auth/login":
            body = self.read_json_body()
            email = body.get('email', '').strip().lower()
            password = body.get('password', '')
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
            user_row = cursor.fetchone()
            if not user_row or not verify_password(user_row['password_hash'], password):
                conn.close()
                return self.send_json({"error": "Sai email hoặc mật khẩu"}, status=400)

            token = str(uuid.uuid4())
            SESSIONS[token] = {"user_id": user_row['id'], "email": user_row['email'], "role": user_row['role']}
            cursor.execute("SELECT * FROM ai_lovers WHERE user_id = ? LIMIT 1", (user_row['id'],))
            lover_row = cursor.fetchone()
            conn.close()
            return self.send_json({
                "token": token,
                "user": dict(user_row),
                "lover": dict(lover_row) if lover_row else None
            })

        user = get_current_user(self.headers, query)
        if not user:
            return self.send_json({"error": "Unauthorized"}, status=401)

        # Chat send
        if path == "/api/chat/send":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            content = body.get('content', '').strip()
            sender = body.get('sender', 'user') # 'user' or 'human_admin' (takeover mode)

            if not content:
                return self.send_json({"error": "Nội dung tin nhắn không được để trống"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            if not lover_id:
                cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
                r = cursor.fetchone()
                lover_id = r['id'] if r else None

            # Insert message
            cursor.execute("""
            INSERT INTO chat_messages (user_id, lover_id, sender, content, platform)
            VALUES (?, ?, ?, ?, 'web')
            """, (user['id'], lover_id, sender, content))
            conn.commit()

            # If sender is human_admin (operator takeover), don't trigger AI response
            if sender == 'human_admin':
                cursor.execute("SELECT * FROM chat_messages WHERE id = ?", (cursor.lastrowid,))
                msg_row = dict(cursor.fetchone())
                conn.close()
                log_activity(user['id'], "takeover_message", f"Người thật gửi tin nhắn: {content[:35]}...", "success")
                return self.send_json({"message": msg_row, "ai_reply": None})

            # Check if takeover is active
            cursor.execute("SELECT human_takeover_mode, auto_reply_enabled FROM ai_lovers WHERE id = ?", (lover_id,))
            l_info = cursor.fetchone()
            takeover = l_info['human_takeover_mode'] if l_info else 0

            ai_reply_row = None
            if takeover == 0:
                reply_text = generate_ai_response(user['id'], lover_id, content)
                cursor.execute("""
                INSERT INTO chat_messages (user_id, lover_id, sender, content, platform)
                VALUES (?, ?, 'ai', ?, 'web')
                """, (user['id'], lover_id, reply_text))
                conn.commit()
                cursor.execute("SELECT * FROM chat_messages WHERE id = ?", (cursor.lastrowid,))
                ai_reply_row = dict(cursor.fetchone())

            cursor.execute("SELECT emotion_state FROM ai_lovers WHERE id = ?", (lover_id,))
            emo_row = cursor.fetchone()
            emo = json.loads(emo_row['emotion_state']) if emo_row and emo_row['emotion_state'] else {}
            conn.close()

            return self.send_json({
                "message": ai_reply_row,
                "emotion": emo,
                "takeover_active": bool(takeover)
            })

        # Toggle Auto Reply
        if path == "/api/chat/toggle-auto-reply":
            body = self.read_json_body()
            enabled = 1 if body.get('enabled', True) else 0
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE ai_lovers SET auto_reply_enabled = ? WHERE user_id = ?", (enabled, user['id']))
            cursor.execute("UPDATE messenger_integrations SET auto_reply_enabled = ? WHERE user_id = ?", (enabled, user['id']))
            conn.commit()
            conn.close()
            log_activity(user['id'], "setting_change", f"Đã {'BẬT' if enabled else 'TẮT'} chế độ trả lời tự động", "success")
            return self.send_json({"auto_reply_enabled": enabled})

        # Toggle Human Takeover
        if path == "/api/chat/toggle-takeover":
            body = self.read_json_body()
            takeover = 1 if body.get('takeover', False) else 0
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("UPDATE ai_lovers SET human_takeover_mode = ? WHERE user_id = ?", (takeover, user['id']))
            cursor.execute("UPDATE messenger_integrations SET human_takeover_mode = ? WHERE user_id = ?", (takeover, user['id']))
            conn.commit()
            conn.close()
            log_activity(user['id'], "takeover_toggle", f"Chuyển chế độ: {'Người thật can thiệp' if takeover else 'AI Girlfriend tự động'}", "info")
            return self.send_json({"human_takeover_mode": takeover})

        # Save Personality Sliders & Voice
        if path == "/api/personality":
            body = self.read_json_body()
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            UPDATE ai_lovers SET
                name = COALESCE(?, name),
                style = COALESCE(?, style),
                personality_summary = COALESCE(?, personality_summary),
                pronouns_ai = COALESCE(?, pronouns_ai),
                pronouns_user = COALESCE(?, pronouns_user),
                trait_gentleness = COALESCE(?, trait_gentleness),
                trait_romance = COALESCE(?, trait_romance),
                trait_humor = COALESCE(?, trait_humor),
                trait_proactiveness = COALESCE(?, trait_proactiveness),
                voice_style = COALESCE(?, voice_style),
                voice_rate = COALESCE(?, voice_rate),
                voice_pitch = COALESCE(?, voice_pitch)
            WHERE user_id = ?
            """, (
                body.get('name'), body.get('style'), body.get('personality_summary'),
                body.get('pronouns_ai'), body.get('pronouns_user'),
                body.get('trait_gentleness'), body.get('trait_romance'),
                body.get('trait_humor'), body.get('trait_proactiveness'),
                body.get('voice_style'), body.get('voice_rate'), body.get('voice_pitch'),
                user['id']
            ))
            conn.commit()
            cursor.execute("SELECT * FROM ai_lovers WHERE user_id = ?", (user['id'],))
            updated = dict(cursor.fetchone())
            conn.close()
            log_activity(user['id'], "setting_change", "Cập nhật tính cách & giọng nói cô người yêu AI", "success")
            return self.send_json({"lover": updated, "message": "Đã lưu cài đặt tính cách thành công!"})

        # Save Schedule Timings
        if path == "/api/schedule/settings":
            body = self.read_json_body()
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            UPDATE ai_lovers SET
                morning_time = COALESCE(?, morning_time),
                lunch_time = COALESCE(?, lunch_time),
                afternoon_time = COALESCE(?, afternoon_time),
                night_time = COALESCE(?, night_time),
                enable_morning = COALESCE(?, enable_morning),
                enable_lunch = COALESCE(?, enable_lunch),
                enable_afternoon = COALESCE(?, enable_afternoon),
                enable_night = COALESCE(?, enable_night),
                enable_idle_checkin = COALESCE(?, enable_idle_checkin)
            WHERE user_id = ?
            """, (
                body.get('morning_time'), body.get('lunch_time'), body.get('afternoon_time'), body.get('night_time'),
                body.get('enable_morning'), body.get('enable_lunch'), body.get('enable_afternoon'), body.get('enable_night'),
                body.get('enable_idle_checkin'), user['id']
            ))
            conn.commit()
            conn.close()
            log_activity(user['id'], "setting_change", "Cập nhật lịch trình nhắn tin chủ động", "success")
            return self.send_json({"message": "Đã lưu lịch trình nhắn tin thành công!"})

        # Test Schedule Trigger
        if path == "/api/schedule/test":
            body = self.read_json_body()
            milestone = body.get('milestone', 'morning')
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
            r = cursor.fetchone()
            lover_id = r['id'] if r else None
            conn.close()
            if lover_id:
                msg = trigger_instant_proactive_nudge(user['id'], lover_id, milestone)
                return self.send_json({"message": msg, "milestone": milestone})
            return self.send_json({"error": "Lover not found"}, status=400)

        # Voice Call Turn Processing
        if path == "/api/voice/process-turn":
            body = self.read_json_body()
            transcript = body.get('transcript', '').strip()
            lover_id = body.get('lover_id')
            if not lover_id:
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
                r = cursor.fetchone()
                lover_id = r['id'] if r else 1
                conn.close()
            reply = generate_ai_response(user['id'], lover_id, transcript, platform="voice")
            return self.send_json({"transcript": transcript, "reply": reply})

        # Voice Call End Log
        if path == "/api/voice/end":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            duration = int(body.get('duration_seconds', 0))
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO voice_calls (user_id, lover_id, duration_seconds, summary)
            VALUES (?, ?, ?, 'Cuộc gọi tâm sự cùng cô người yêu AI')
            """, (user['id'], lover_id, duration))
            conn.commit()
            conn.close()
            log_activity(user['id'], "call_session", f"Kết thúc cuộc gọi thoại ({duration}s)", "success")
            return self.send_json({"status": "logged"})

        # Messenger Configuration
        if path == "/api/messenger/config":
            body = self.read_json_body()
            page_token = body.get('page_access_token', '').strip()
            page_id = body.get('page_id', '').strip()
            page_name = body.get('page_name', 'My Virtual Love Page').strip()
            app_secret = body.get('app_secret', '').strip()
            verify_token = body.get('verify_token', '').strip()

            conn = get_db()
            cursor = conn.cursor()
            if verify_token:
                cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'messenger_webhook_verify_token'", (verify_token,))
            if page_token:
                cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'messenger_page_token'", (page_token,))
            if app_secret:
                cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'messenger_app_secret'", (app_secret,))

            is_connected = 1 if page_token else 0
            cursor.execute("""
            INSERT INTO messenger_integrations (user_id, page_id, page_name, page_access_token, verify_token, app_secret, is_connected)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                page_id=excluded.page_id, page_name=excluded.page_name, page_access_token=excluded.page_access_token,
                verify_token=excluded.verify_token, app_secret=excluded.app_secret, is_connected=excluded.is_connected
            """, (user['id'], page_id, page_name, page_token, verify_token, app_secret, is_connected))
            conn.commit()
            conn.close()
            log_activity(user['id'], "messenger_config", f"Cập nhật kết nối Fanpage Messenger [{page_name}]", "success")
            return self.send_json({"message": "Đã lưu cấu hình Messenger thành công!", "is_connected": is_connected})

        # Messenger Simulator
        if path == "/api/messenger/simulate":
            body = self.read_json_body()
            text = body.get('text', 'Chào em yêu!')
            sim_event = {
                "object": "page",
                "entry": [{"messaging": [{"sender": {"id": "sim_fb_user_88"}, "recipient": {"id": "sim_page"}, "message": {"text": text}}]}]
            }
            res = handle_incoming_messenger_event(sim_event, is_simulated=True)
            return self.send_json(res)

        # Admin Settings
        if path == "/api/admin/settings":
            if user.get('role') != 'admin':
                return self.send_json({"error": "Forbidden"}, status=403)
            body = self.read_json_body()
            conn = get_db()
            cursor = conn.cursor()
            for key, val in body.items():
                cursor.execute("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, str(val)))
            conn.commit()
            conn.close()
            return self.send_json({"message": "Đã lưu cài đặt quản trị thành công!"})

        return self.send_json({"error": "POST route not found"}, status=404)

def run_server():
    init_db()
    start_scheduler()
    socketserver.TCPServer.allow_reuse_address = True
    server_address = ('127.0.0.1', PORT)
    httpd = socketserver.ThreadingTCPServer(server_address, LoverRequestHandler)
    print(f"==================================================")
    print(f"✨ AI GIRLFRIEND – MY VIRTUAL LOVE ✨")
    print(f"URL: http://localhost:{PORT}")
    print(f"Webhook: http://localhost:{PORT}/api/messenger/webhook")
    print(f"Admin Account: admin@lover.ai / admin123456")
    print(f"Demo User:     demo@lover.ai / 123456")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == '__main__':
    run_server()
