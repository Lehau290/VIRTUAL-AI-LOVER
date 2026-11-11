"""
Meta Messenger Platform Integration for AI Girlfriend
Handles official Webhooks, signature verification, automatic replies,
and Human Takeover (chuyển giao cho người thật can thiệp).
"""
import hmac
import hashlib
import json
import urllib.request
import ssl
from datetime import datetime
from database import get_db, log_activity
from ai_engine import generate_ai_response, get_system_setting

def verify_meta_webhook(mode: str, token: str, challenge: str) -> tuple[bool, str]:
    system_verify_token = get_system_setting("messenger_webhook_verify_token", "virtual_ai_lover_verify_2026")
    if mode == "subscribe" and token == system_verify_token:
        return True, challenge
    return False, "Verification token mismatch"

def verify_meta_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    if not app_secret or not signature_header:
        return True
    try:
        parts = signature_header.split("=")
        if len(parts) != 2:
            return False
        expected_hash = hmac.new(app_secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(parts[1], expected_hash)
    except Exception:
        return False

def send_facebook_message(page_token: str, recipient_id: str, message_text: str) -> bool:
    if not page_token or not recipient_id:
        return False
    url = f"https://graph.facebook.com/v19.0/me/messages?access_token={page_token}"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": message_text},
        "messaging_type": "RESPONSE"
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            return resp.status == 200
    except Exception as e:
        print("Meta Graph API outbound error:", e)
        return False

def handle_incoming_messenger_event(event_data: dict, is_simulated: bool = False) -> dict:
    entry = event_data.get("entry", [])
    results = []

    for item in entry:
        messaging = item.get("messaging", [])
        for msg_event in messaging:
            sender_id = msg_event.get("sender", {}).get("id")
            message = msg_event.get("message", {})
            text = message.get("text", "")

            if not sender_id or not text:
                continue

            conn = get_db()
            cursor = conn.cursor()

            # Find matching user & lover
            cursor.execute("""
            SELECT l.user_id, l.id as lover_id, l.auto_reply_enabled, l.human_takeover_mode, m.page_access_token 
            FROM ai_lovers l
            LEFT JOIN messenger_integrations m ON m.user_id = l.user_id
            LIMIT 1
            """)
            mapping = cursor.fetchone()

            if mapping:
                user_id = mapping['user_id']
                lover_id = mapping['lover_id']
                auto_reply = mapping['auto_reply_enabled']
                takeover = mapping['human_takeover_mode']

                # Save incoming user message
                cursor.execute("""
                INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
                VALUES (?, ?, 'user', 'text', ?, 'messenger')
                """, (user_id, lover_id, text))
                conn.commit()
                log_activity(user_id, "messenger_webhook", f"Nhận tin nhắn từ Messenger: {text[:35]}...", "success")

                # If Human Takeover is ON, do not generate AI response
                if takeover == 1:
                    log_activity(user_id, "takeover_active", "Đang ở chế độ Người thật can thiệp - AI tạm dừng trả lời", "info")
                    conn.close()
                    results.append({
                        "sender_id": sender_id,
                        "user_message": text,
                        "human_takeover": True,
                        "ai_reply": None
                    })
                    continue

                # If Auto Reply is OFF, skip reply
                if auto_reply == 0:
                    conn.close()
                    results.append({
                        "sender_id": sender_id,
                        "user_message": text,
                        "auto_reply_disabled": True,
                        "ai_reply": None
                    })
                    continue

                # Generate AI response
                ai_reply = generate_ai_response(user_id, lover_id, text, platform="messenger")

                # Save AI response
                cursor.execute("""
                INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
                VALUES (?, ?, 'ai', 'text', ?, 'messenger')
                """, (user_id, lover_id, ai_reply))
                conn.commit()

                # Dispatch outbound message to Meta if live token
                page_token = get_system_setting("messenger_page_token", "")
                sent_live = False
                if page_token and not is_simulated:
                    sent_live = send_facebook_message(page_token, sender_id, ai_reply)

                results.append({
                    "sender_id": sender_id,
                    "user_message": text,
                    "ai_reply": ai_reply,
                    "sent_to_meta": sent_live,
                    "simulated": is_simulated
                })
            conn.close()

    return {"status": "success", "processed": results}
