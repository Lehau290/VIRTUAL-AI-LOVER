import json
from database import init_db, get_db, hash_password, verify_password
from ai_engine import generate_ai_response, build_romantic_simulated_reply
from messenger import verify_meta_webhook, handle_incoming_messenger_event
from scheduler import generate_proactive_message, trigger_instant_proactive_nudge

def run_unit_tests():
    print("Starting unit tests...")
    init_db()

    # 1. Test Password hashing
    pwd = "my_secret_pass"
    h = hash_password(pwd)
    assert verify_password(h, pwd) == True
    assert verify_password(h, "wrong_pass") == False
    print("✓ Password hashing & verification PASSED")

    # 2. Test DB Seed Data
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = 'demo@lover.ai'")
    demo_user = dict(cursor.fetchone())
    assert demo_user["email"] == "demo@lover.ai"

    cursor.execute("SELECT * FROM ai_lovers WHERE user_id = ?", (demo_user["id"],))
    lover = dict(cursor.fetchone())
    assert lover["name"] == "Mai Anh"
    assert lover["pronouns_ai"] == "em"
    assert lover["pronouns_user"] == "anh"

    cursor.execute("SELECT * FROM ai_memories WHERE user_id = ?", (demo_user["id"],))
    memories = [dict(r) for r in cursor.fetchall()]
    assert len(memories) >= 5
    conn.close()
    print(f"✓ Database schema & default seed PASSED (User: {demo_user['display_name']}, Lover: {lover['name']}, Memories: {len(memories)})")

    # 3. Test AI Romantic Engine (Context, Emotion, Vietnamese Persona)
    # Test tired message
    reply1 = generate_ai_response(demo_user["id"], lover["id"], "Hôm nay anh làm việc mệt quá em ơi")
    assert any(w in reply1.lower() for w in ["thương", "nghỉ", "anh", "em", "nước"])
    print(f"✓ AI Response to 'Mệt mỏi':\n  -> {reply1}\n")

    # Test love message
    reply2 = generate_ai_response(demo_user["id"], lover["id"], "Anh yêu em nhiều lắm Mai Anh ơi")
    assert any(w in reply2.lower() for w in ["yêu", "nhớ", "em", "anh", "tim"])
    print(f"✓ AI Response to 'Yêu em':\n  -> {reply2}\n")

    # Test goodnight message
    reply3 = generate_ai_response(demo_user["id"], lover["id"], "Khuya rồi anh đi ngủ đây, chúc em ngủ ngon nha")
    assert any(w in reply3.lower() for w in ["ngủ", "mơ", "chăn", "yêu"])
    print(f"✓ AI Response to 'Chúc ngủ ngon':\n  -> {reply3}\n")

    # Test memory extraction
    new_memory_msg = "Anh thích ăn phở bò tái lăn nhiều hành"
    generate_ai_response(demo_user["id"], lover["id"], new_memory_msg)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ai_memories WHERE lover_id = ? AND key_fact LIKE '%phở bò%'", (lover["id"],))
    extracted = cursor.fetchone()
    conn.close()
    assert extracted is not None
    print(f"✓ Auto Memory Extraction PASSED (Extracted: '{extracted['key_fact']}')\n")

    # 4. Test Meta Messenger Webhook Verification
    valid, ch = verify_meta_webhook("subscribe", "virtual_ai_lover_verify_2026", "challenge_12345")
    assert valid is True
    assert ch == "challenge_12345"
    print("✓ Meta Messenger Webhook Challenge verification PASSED")

    # 5. Test Incoming Messenger Webhook Event
    fb_event = {
        "object": "page",
        "entry": [{
            "messaging": [{
                "sender": {"id": "fb_user_123"},
                "recipient": {"id": "fb_page_456"},
                "message": {"text": "Chào em yêu! Anh đang nhắn từ Messenger nè"}
            }]
        }]
    }
    fb_result = handle_incoming_messenger_event(fb_event, is_simulated=True)
    assert fb_result["status"] == "success"
    assert len(fb_result["processed"]) == 1
    assert fb_result["processed"][0]["ai_reply"]
    print(f"✓ Meta Messenger Event Processing PASSED:\n  -> Reply: {fb_result['processed'][0]['ai_reply']}\n")

    # 6. Test Proactive Scheduler Messages
    morning_msg = generate_proactive_message(lover, demo_user, "morning")
    night_msg = generate_proactive_message(lover, demo_user, "night")
    bday_msg = generate_proactive_message(lover, demo_user, "birthday")
    assert "buổi sáng" in morning_msg.lower() or "dậy" in morning_msg.lower()
    assert "ngủ" in night_msg.lower() or "khuya" in night_msg.lower()
    assert "sinh nhật" in bday_msg.lower()
    print("✓ Proactive Scheduler Messages PASSED (Morning, Night, Birthday)")

    # 7. Test Instant Nudge
    nudge_msg = trigger_instant_proactive_nudge(demo_user["id"], lover["id"], "random_care")
    assert nudge_msg
    print(f"✓ Instant Loving Nudge PASSED: '{nudge_msg}'\n")

    print("🎉 ALL UNIT AND INTEGRATION TESTS PASSED 100%! 🎉")

if __name__ == '__main__':
    run_unit_tests()
