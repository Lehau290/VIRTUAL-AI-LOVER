"""
Facebook Messenger Platform Integration Module
Handles Meta webhook verification, message receipt, AI reply generation,
Meta Graph API outbound dispatch, and simulated Messenger sandbox.
"""
import hmac
import hashlib
import json
import urllib.request
import urllib.error
import ssl
from datetime import datetime
from database import get_db
from ai_engine import generate_ai_response, get_system_setting

def verify_meta_webhook(mode: str, token: str, challenge: str) -> tuple[bool, str]:
    """
    Verifies Meta Webhook challenge during app setup
    """
    system_verify_token = get_system_setting("messenger_webhook_verify_token", "virtual_ai_lover_verify_2026")
    if mode == "subscribe" and token == system_verify_token:
        return True, challenge
    return False, "Verification token mismatch"

def verify_meta_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    """
    Verifies X-Hub-Signature-256 for webhook security
    """
    if not app_secret or not signature_header:
        return True # Permissive if not strictly enforced in development
    try:
        parts = signature_header.split("=")
        if len(parts) != 2:
            return False
        expected_hash = hmac.new(app_secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(parts[1], expected_hash)
    except Exception:
        return False

def send_facebook_message(page_token: str, recipient_id: str, message_text: str) -> bool:
    """
    Dispatches outbound message via Meta Graph API v19.0
    """
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
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            return resp.status == 200
    except Exception as e:
        print("Meta Graph API outbound error:", e)
        return False

def handle_incoming_messenger_event(event_data: dict, is_simulated: bool = False) -> dict:
    """
    Processes incoming messaging event from Meta webhook or simulated tester
    """
    entry = event_data.get("entry", [])
    results = []

    for item in entry:
        messaging = item.get("messaging", [])
        for msg_event in messaging:
            sender_id = msg_event.get("sender", {}).get("id")
            recipient_id = msg_event.get("recipient", {}).get("id")
            message = msg_event.get("message", {})
            text = message.get("text", "")

            if not sender_id or not text:
                continue

            # Find matching user in database
            conn = get_db()
            cursor = conn.cursor()

            # Find integration mapped to this PSID or default user
            cursor.execute("""
            SELECT m.user_id, l.id as lover_id, m.page_access_token 
            FROM messenger_integrations m
            JOIN ai_lovers l ON l.user_id = m.user_id
            WHERE m.messenger_user_psid = ? OR m.is_active = 1
            LIMIT 1
            """, (str(sender_id),))
            mapping = cursor.fetchone()

            if not mapping:
                # Default to demo user if testing
                cursor.execute("SELECT u.id as user_id, l.id as lover_id FROM users u JOIN ai_lovers l ON l.user_id = u.id WHERE u.email = 'demo@lover.ai' LIMIT 1")
                mapping = cursor.fetchone()

            if mapping:
                user_id = mapping['user_id']
                lover_id = mapping['lover_id']

                # Save incoming user message
                cursor.execute("""
                INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
                VALUES (?, ?, 'user', 'text', ?, 'messenger')
                """, (user_id, lover_id, text))
                conn.commit()

                # Generate AI response
                ai_reply = generate_ai_response(user_id, lover_id, text, platform="messenger")

                # Save AI response
                cursor.execute("""
                INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
                VALUES (?, ?, 'ai', 'text', ?, 'messenger')
                """, (user_id, lover_id, ai_reply))
                conn.commit()

                # Dispatch outbound if real page token exists
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
