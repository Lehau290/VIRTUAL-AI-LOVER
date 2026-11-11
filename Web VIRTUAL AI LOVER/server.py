"""
Virtual AI Lover - Fullstack HTTP Server
Implements REST API, static asset serving, SSE, voice call processing,
Meta Messenger platform webhook, and admin management.
Zero external dependencies, running on Python's built-in libraries.
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
    init_db, get_db, hash_password, verify_password, DB_PATH
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

PORT = 8080
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# Active sessions: token -> {user_id, email, role, created_at}
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
        cursor.execute("SELECT id, email, display_name, role, avatar_url, phone, birthday, job, bio FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return dict(row)
    return None

class LoverRequestHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for local testing and secure headers
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

        # Meta Messenger Webhook verification
        if path == "/api/messenger/webhook":
            mode = query.get("hub.mode", [""])[0]
            token = query.get("hub.verify_token", [""])[0]
            challenge = query.get("hub.challenge", [""])[0]
            valid, response_text = verify_meta_webhook(mode, token, challenge)
            if valid:
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(response_text.encode('utf-8'))
            else:
                self.send_response(403)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(response_text.encode('utf-8'))
            return

        # API Routes
        if path.startswith("/api/"):
            user = get_current_user(self.headers, query)

            # Auth: Me
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

            # AI Lover profile
            if path == "/api/lover":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM ai_lovers WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user['id'],))
                lover_row = cursor.fetchone()
                conn.close()
                return self.send_json({"lover": dict(lover_row) if lover_row else None})

            # Chat Messages
            if path == "/api/chat/messages":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                lover_id = query.get('lover_id', [None])[0]
                search = query.get('search', [''])[0].strip()
                limit = int(query.get('limit', [60])[0])

                conn = get_db()
                cursor = conn.cursor()
                if search:
                    cursor.execute("""
                    SELECT * FROM chat_messages 
                    WHERE user_id = ? AND content LIKE ?
                    ORDER BY id DESC LIMIT ?
                    """, (user['id'], f"%{search}%", limit))
                else:
                    cursor.execute("""
                    SELECT * FROM chat_messages 
                    WHERE user_id = ?
                    ORDER BY id DESC LIMIT ?
                    """, (user['id'], limit))
                messages = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({"messages": list(reversed(messages))})

            # Memories
            if path == "/api/memories":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM ai_memories WHERE user_id = ? ORDER BY importance DESC, id DESC", (user['id'],))
                memories = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({"memories": memories})

            # Love Diaries
            if path == "/api/diary":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM love_diaries WHERE user_id = ? ORDER BY entry_date DESC, id DESC", (user['id'],))
                diaries = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({"diaries": diaries})

            # Photo Albums
            if path == "/api/album":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM photo_albums WHERE user_id = ? ORDER BY id DESC", (user['id'],))
                photos = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({"photos": photos})

            # Voice calls history
            if path == "/api/voice/history":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM voice_calls WHERE user_id = ? ORDER BY id DESC LIMIT 20", (user['id'],))
                calls = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({"calls": calls})

            # Messenger status & configs
            if path == "/api/messenger/status":
                if not user:
                    return self.send_json({"error": "Unauthorized"}, status=401)
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM messenger_integrations WHERE user_id = ?", (user['id'],))
                m_row = cursor.fetchone()
                conn.close()
                return self.send_json({
                    "integration": dict(m_row) if m_row else None,
                    "webhook_url": f"http://localhost:{PORT}/api/messenger/webhook",
                    "verify_token": get_system_setting("messenger_webhook_verify_token", "virtual_ai_lover_verify_2026")
                })

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
                cursor.execute("SELECT COUNT(*) as c FROM love_diaries")
                d_cnt = cursor.fetchone()['c']

                cursor.execute("SELECT id, email, display_name, role, created_at FROM users ORDER BY id DESC LIMIT 20")
                user_list = [dict(r) for r in cursor.fetchall()]
                conn.close()
                return self.send_json({
                    "stats": {
                        "users": u_cnt,
                        "lovers": l_cnt,
                        "messages": m_cnt,
                        "voice_calls": v_cnt,
                        "memories": mem_cnt,
                        "diaries": d_cnt
                    },
                    "users": user_list
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

            return self.send_json({"error": "API route not found"}, status=404)

        # Serve static frontend files
        if path == "/" or path == "":
            path = "/index.html"
        
        rel_path = path.lstrip("/")
        full_path = os.path.join(STATIC_DIR, rel_path)

        # Basic security check against directory traversal
        if not os.path.abspath(full_path).startswith(STATIC_DIR):
            self.send_response(403)
            self.end_headers()
            return

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
            # SPA Fallback to index.html
            index_path = os.path.join(STATIC_DIR, "index.html")
            if os.path.exists(index_path):
                with open(index_path, "rb") as f:
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

        # Meta Messenger incoming webhook POST
        if path == "/api/messenger/webhook":
            content_len = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_len)
            sig_header = self.headers.get('X-Hub-Signature-256', '')
            app_secret = get_system_setting("messenger_app_secret", "")
            
            if not verify_meta_signature(raw_body, sig_header, app_secret):
                return self.send_json({"error": "Invalid signature"}, status=403)
            
            try:
                event_data = json.loads(raw_body.decode('utf-8'))
                result = handle_incoming_messenger_event(event_data, is_simulated=False)
                return self.send_json(result)
            except Exception as e:
                return self.send_json({"error": str(e)}, status=500)

        # Register
        if path == "/api/auth/register":
            body = self.read_json_body()
            email = body.get('email', '').strip().lower()
            password = body.get('password', '')
            display_name = body.get('display_name', '').strip() or 'Người thương'

            if not email or not password or len(password) < 6:
                return self.send_json({"error": "Email và mật khẩu (tối thiểu 6 ký tự) là bắt buộc"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            if cursor.fetchone():
                conn.close()
                return self.send_json({"error": "Email đã được đăng ký trong hệ thống"}, status=400)

            pwd_hash = hash_password(password)
            cursor.execute("""
            INSERT INTO users (email, password_hash, display_name, role)
            VALUES (?, ?, ?, 'user')
            """, (email, pwd_hash, display_name))
            new_user_id = cursor.lastrowid

            # Create default lover for new user
            first_met = datetime.now().strftime("%Y-%m-%d")
            cursor.execute("""
            INSERT INTO ai_lovers (
                user_id, name, gender, age, avatar_url, style, personality,
                pronouns_ai, pronouns_user, voice_style, hobbies, habits, dislikes, first_met_date
            ) VALUES (
                ?, 'Mai Anh', 'female', 21,
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
                'Thanh lịch, dịu dàng',
                'Dịu dàng, biết lắng nghe, đôi khi làm nũng và ghen tuông đáng yêu',
                'em', 'anh', 'Nữ - Ngọt ngào nhẹ nhàng',
                'Nghe nhạc, làm bánh, chụp ảnh, đi dạo lúc hoàng hôn',
                'Thích chờ tin nhắn người yêu, hay nhắc anh uống nước',
                'Người yêu thức khuya bỏ bữa, im lặng quá lâu',
                ?
            )
            """, (new_user_id, first_met))
            new_lover_id = cursor.lastrowid

            # Seed initial greeting
            cursor.execute("""
            INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content)
            VALUES (?, ?, 'ai', 'text', 'Chào anh yêu! ✨ Em là Mai Anh đây, từ hôm nay em sẽ là người yêu và luôn đồng hành bên anh mỗi ngày nhé! 💕')
            """, (new_user_id, new_lover_id))

            conn.commit()
            conn.close()

            token = str(uuid.uuid4())
            SESSIONS[token] = {"user_id": new_user_id, "email": email, "role": "user", "created_at": datetime.now().isoformat()}

            return self.send_json({
                "token": token,
                "user": {"id": new_user_id, "email": email, "display_name": display_name, "role": "user"},
                "message": "Đăng ký thành công!"
            })

        # Login
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
            SESSIONS[token] = {
                "user_id": user_row['id'],
                "email": user_row['email'],
                "role": user_row['role'],
                "created_at": datetime.now().isoformat()
            }

            cursor.execute("SELECT * FROM ai_lovers WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_row['id'],))
            lover_row = cursor.fetchone()
            conn.close()

            return self.send_json({
                "token": token,
                "user": {
                    "id": user_row['id'],
                    "email": user_row['email'],
                    "display_name": user_row['display_name'],
                    "role": user_row['role'],
                    "avatar_url": user_row['avatar_url'],
                    "birthday": user_row['birthday'],
                    "job": user_row['job'],
                    "bio": user_row['bio']
                },
                "lover": dict(lover_row) if lover_row else None
            })

        # Forgot password
        if path == "/api/auth/forgot-password":
            body = self.read_json_body()
            email = body.get('email', '').strip().lower()
            return self.send_json({
                "message": f"Yêu cầu đặt lại mật khẩu đã được xử lý cho email {email}. Trong môi trường demo, mật khẩu mặc định của tài khoản là '123456'."
            })

        # Authenticated APIs
        user = get_current_user(self.headers, query)
        if not user:
            return self.send_json({"error": "Unauthorized"}, status=401)

        # Update or Create Lover
        if path == "/api/lover":
            body = self.read_json_body()
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ?", (user['id'],))
            existing = cursor.fetchone()

            name = body.get('name', 'Mai Anh')
            gender = body.get('gender', 'female')
            age = int(body.get('age', 21))
            avatar_url = body.get('avatar_url', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80')
            style = body.get('style', 'Thanh lịch, dịu dàng')
            personality = body.get('personality', 'Dịu dàng, chu đáo')
            p_ai = body.get('pronouns_ai', 'em')
            p_user = body.get('pronouns_user', 'anh')
            voice_style = body.get('voice_style', 'Nữ - Ngọt ngào nhẹ nhàng')
            voice_rate = float(body.get('voice_rate', 1.0))
            voice_pitch = float(body.get('voice_pitch', 1.1))
            hobbies = body.get('hobbies', '')
            habits = body.get('habits', '')
            dislikes = body.get('dislikes', '')
            first_met = body.get('first_met_date', datetime.now().strftime("%Y-%m-%d"))
            proactive_mode = body.get('proactive_mode', 'medium')
            morning_time = body.get('morning_greeting_time', '07:30')
            night_time = body.get('night_greeting_time', '22:30')
            enable_morning = 1 if body.get('enable_morning_msg', True) else 0
            enable_night = 1 if body.get('enable_night_msg', True) else 0
            enable_random = 1 if body.get('enable_random_care', True) else 0

            if existing:
                cursor.execute("""
                UPDATE ai_lovers SET
                    name = ?, gender = ?, age = ?, avatar_url = ?, style = ?,
                    personality = ?, pronouns_ai = ?, pronouns_user = ?, voice_style = ?,
                    voice_rate = ?, voice_pitch = ?, hobbies = ?, habits = ?, dislikes = ?,
                    first_met_date = ?, proactive_mode = ?, morning_greeting_time = ?,
                    night_greeting_time = ?, enable_morning_msg = ?, enable_night_msg = ?,
                    enable_random_care = ?
                WHERE id = ?
                """, (
                    name, gender, age, avatar_url, style,
                    personality, p_ai, p_user, voice_style,
                    voice_rate, voice_pitch, hobbies, habits, dislikes,
                    first_met, proactive_mode, morning_time,
                    night_time, enable_morning, enable_night,
                    enable_random, existing['id']
                ))
                lover_id = existing['id']
            else:
                cursor.execute("""
                INSERT INTO ai_lovers (
                    user_id, name, gender, age, avatar_url, style,
                    personality, pronouns_ai, pronouns_user, voice_style,
                    voice_rate, voice_pitch, hobbies, habits, dislikes,
                    first_met_date, proactive_mode, morning_greeting_time,
                    night_greeting_time, enable_morning_msg, enable_night_msg,
                    enable_random_care
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user['id'], name, gender, age, avatar_url, style,
                    personality, p_ai, p_user, voice_style,
                    voice_rate, voice_pitch, hobbies, habits, dislikes,
                    first_met, proactive_mode, morning_time,
                    night_time, enable_morning, enable_night,
                    enable_random
                ))
                lover_id = cursor.lastrowid

            # Also update user profile info if provided
            u_name = body.get('user_display_name')
            u_bday = body.get('user_birthday')
            u_job = body.get('user_job')
            if u_name or u_bday or u_job:
                cursor.execute("""
                UPDATE users SET 
                    display_name = COALESCE(?, display_name),
                    birthday = COALESCE(?, birthday),
                    job = COALESCE(?, job)
                WHERE id = ?
                """, (u_name, u_bday, u_job, user['id']))

            conn.commit()
            cursor.execute("SELECT * FROM ai_lovers WHERE id = ?", (lover_id,))
            updated_lover = dict(cursor.fetchone())
            conn.close()

            return self.send_json({"lover": updated_lover, "message": "Đã lưu thông tin người yêu thành công!"})

        # Send Chat Message
        if path == "/api/chat/send":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            content = body.get('content', '').strip()
            message_type = body.get('message_type', 'text')
            media_url = body.get('media_url', '')

            if not content and not media_url:
                return self.send_json({"error": "Nội dung tin nhắn không được để trống"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            if not lover_id:
                cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
                l_row = cursor.fetchone()
                lover_id = l_row['id'] if l_row else None

            if not lover_id:
                conn.close()
                return self.send_json({"error": "Chưa khởi tạo nhân vật người yêu"}, status=400)

            # 1. Save user message
            cursor.execute("""
            INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, media_url, platform)
            VALUES (?, ?, 'user', ?, ?, ?, 'web')
            """, (user['id'], lover_id, message_type, content, media_url))
            user_msg_id = cursor.lastrowid
            conn.commit()
            conn.close()

            # 2. Generate AI response
            ai_reply = generate_ai_response(user['id'], lover_id, content or "Em ơi xem tấm ảnh này nè 💕")

            # 3. Save AI message
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
            VALUES (?, ?, 'ai', 'text', ?, 'web')
            """, (user['id'], lover_id, ai_reply))
            ai_msg_id = cursor.lastrowid
            cursor.execute("SELECT * FROM chat_messages WHERE id = ?", (ai_msg_id,))
            ai_msg_row = dict(cursor.fetchone())

            # Get current lover emotion state
            cursor.execute("SELECT emotion_state FROM ai_lovers WHERE id = ?", (lover_id,))
            emo_row = cursor.fetchone()
            emo = json.loads(emo_row['emotion_state']) if emo_row and emo_row['emotion_state'] else {}

            conn.commit()
            conn.close()

            return self.send_json({
                "message": ai_msg_row,
                "emotion": emo
            })

        # Clear Chat History
        if path == "/api/chat/clear":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM chat_messages WHERE user_id = ?", (user['id'],))
            conn.commit()
            conn.close()
            return self.send_json({"message": "Đã xóa toàn bộ lịch sử trò chuyện"})

        # Trigger Proactive Nudge
        if path == "/api/chat/trigger-nudge":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            nudge_type = body.get('nudge_type', 'random_care')
            conn = get_db()
            cursor = conn.cursor()
            if not lover_id:
                cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
                row = cursor.fetchone()
                lover_id = row['id'] if row else None
            conn.close()

            if lover_id:
                msg = trigger_instant_proactive_nudge(user['id'], lover_id, nudge_type)
                return self.send_json({"message": msg, "status": "success"})
            return self.send_json({"error": "Lover not found"}, status=400)

        # Memories CRUD
        if path == "/api/memories":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            category = body.get('category', 'fact')
            key_fact = body.get('key_fact', '').strip()
            detail = body.get('detail', '').strip()
            importance = int(body.get('importance', 3))

            if not key_fact:
                return self.send_json({"error": "Thông tin ký ức không được để trống"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            if not lover_id:
                cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
                r = cursor.fetchone()
                lover_id = r['id'] if r else None

            cursor.execute("""
            INSERT INTO ai_memories (user_id, lover_id, category, key_fact, detail, importance)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (user['id'], lover_id, category, key_fact, detail, importance))
            mem_id = cursor.lastrowid
            cursor.execute("SELECT * FROM ai_memories WHERE id = ?", (mem_id,))
            mem_row = dict(cursor.fetchone())
            conn.commit()
            conn.close()
            return self.send_json({"memory": mem_row})

        # Voice Call Turn Processing
        if path == "/api/voice/process-turn":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            transcript = body.get('transcript', '').strip()
            if not transcript:
                return self.send_json({"error": "Không có giọng nói nhận diện"}, status=400)

            reply = generate_ai_response(user['id'], lover_id, transcript, platform="voice")
            return self.send_json({
                "transcript": transcript,
                "reply": reply
            })

        # Voice Call Session log
        if path == "/api/voice/end":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            duration = int(body.get('duration_seconds', 0))
            summary = body.get('summary', 'Cuộc gọi tâm sự cùng người yêu')
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO voice_calls (user_id, lover_id, call_direction, duration_seconds, summary)
            VALUES (?, ?, 'outgoing', ?, ?)
            """, (user['id'], lover_id, duration, summary))
            conn.commit()
            conn.close()
            return self.send_json({"status": "logged"})

        # Love Diary CRUD
        if path == "/api/diary":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            title = body.get('title', 'Kỷ niệm yêu thương').strip()
            content = body.get('content', '').strip()
            entry_date = body.get('entry_date', datetime.now().strftime("%Y-%m-%d"))
            mood = body.get('mood', 'Hạnh phúc')
            photo_url = body.get('photo_url', '')

            if not content:
                return self.send_json({"error": "Nội dung nhật ký không được để trống"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            if not lover_id:
                cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
                r = cursor.fetchone()
                lover_id = r['id'] if r else None

            cursor.execute("""
            INSERT INTO love_diaries (user_id, lover_id, title, content, entry_date, mood, photo_url, written_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'both')
            """, (user['id'], lover_id, title, content, entry_date, mood, photo_url))
            d_id = cursor.lastrowid
            cursor.execute("SELECT * FROM love_diaries WHERE id = ?", (d_id,))
            diary_row = dict(cursor.fetchone())
            conn.commit()
            conn.close()
            return self.send_json({"diary": diary_row})

        # Photo Album CRUD
        if path == "/api/album":
            body = self.read_json_body()
            lover_id = body.get('lover_id')
            caption = body.get('caption', 'Khoảnh khắc đáng nhớ').strip()
            image_url = body.get('image_url', '').strip()
            captured_date = body.get('captured_date', datetime.now().strftime("%Y-%m-%d"))

            if not image_url:
                return self.send_json({"error": "Link ảnh không được để trống"}, status=400)

            conn = get_db()
            cursor = conn.cursor()
            if not lover_id:
                cursor.execute("SELECT id FROM ai_lovers WHERE user_id = ? LIMIT 1", (user['id'],))
                r = cursor.fetchone()
                lover_id = r['id'] if r else None

            cursor.execute("""
            INSERT INTO photo_albums (user_id, lover_id, caption, image_url, captured_date)
            VALUES (?, ?, ?, ?, ?)
            """, (user['id'], lover_id, caption, image_url, captured_date))
            conn.commit()
            conn.close()
            return self.send_json({"status": "added"})

        # Messenger Simulated incoming message tester
        if path == "/api/messenger/simulate":
            body = self.read_json_body()
            text = body.get('text', 'Chào em yêu!')
            sender_id = body.get('sender_id', 'simulated_user_123')

            sim_event = {
                "object": "page",
                "entry": [{
                    "messaging": [{
                        "sender": {"id": sender_id},
                        "recipient": {"id": "page_id_test"},
                        "message": {"text": text}
                    }]
                }]
            }
            res = handle_incoming_messenger_event(sim_event, is_simulated=True)
            return self.send_json(res)

        # Messenger Configuration
        if path == "/api/messenger/config":
            body = self.read_json_body()
            page_token = body.get('page_access_token', '').strip()
            verify_token = body.get('verify_token', '').strip()
            app_secret = body.get('app_secret', '').strip()

            conn = get_db()
            cursor = conn.cursor()
            if verify_token:
                cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'messenger_webhook_verify_token'", (verify_token,))
            if page_token:
                cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'messenger_page_token'", (page_token,))
            if app_secret:
                cursor.execute("UPDATE system_settings SET value = ? WHERE key = 'messenger_app_secret'", (app_secret,))

            # Update user's integration row
            cursor.execute("""
            INSERT INTO messenger_integrations (user_id, page_access_token, verify_token, app_secret, is_active)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
                page_access_token=excluded.page_access_token,
                verify_token=excluded.verify_token,
                app_secret=excluded.app_secret,
                is_active=1
            """, (user['id'], page_token, verify_token, app_secret))

            conn.commit()
            conn.close()
            return self.send_json({"message": "Đã lưu cấu hình Messenger thành công!"})

        # Admin Settings Update
        if path == "/api/admin/settings":
            if user.get('role') != 'admin':
                return self.send_json({"error": "Forbidden"}, status=403)
            body = self.read_json_body()
            conn = get_db()
            cursor = conn.cursor()
            for key, val in body.items():
                cursor.execute("""
                INSERT INTO system_settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                """, (key, str(val)))
            conn.commit()
            conn.close()
            return self.send_json({"message": "Đã cập nhật cấu hình hệ thống thành công!"})

        return self.send_json({"error": "POST route not found"}, status=404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        user = get_current_user(self.headers, query)
        if not user:
            return self.send_json({"error": "Unauthorized"}, status=401)

        conn = get_db()
        cursor = conn.cursor()

        # Delete Memory
        if path.startswith("/api/memories/"):
            mem_id = int(path.split("/")[-1])
            cursor.execute("DELETE FROM ai_memories WHERE id = ? AND user_id = ?", (mem_id, user['id']))
            conn.commit()
            conn.close()
            return self.send_json({"status": "deleted"})

        # Delete Diary
        if path.startswith("/api/diary/"):
            diary_id = int(path.split("/")[-1])
            cursor.execute("DELETE FROM love_diaries WHERE id = ? AND user_id = ?", (diary_id, user['id']))
            conn.commit()
            conn.close()
            return self.send_json({"status": "deleted"})

        # Delete Photo
        if path.startswith("/api/album/"):
            photo_id = int(path.split("/")[-1])
            cursor.execute("DELETE FROM photo_albums WHERE id = ? AND user_id = ?", (photo_id, user['id']))
            conn.commit()
            conn.close()
            return self.send_json({"status": "deleted"})

        conn.close()
        return self.send_json({"error": "DELETE route not found"}, status=404)

def run_server():
    init_db()
    start_scheduler()
    server_address = ('', PORT)
    httpd = socketserver.ThreadingTCPServer(server_address, LoverRequestHandler)
    print(f"==================================================")
    print(f"✨ VIRTUAL AI LOVER - SERVER IS RUNNING ✨")
    print(f"Web App URL: http://localhost:{PORT}")
    print(f"Messenger Webhook: http://localhost:{PORT}/api/messenger/webhook")
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
