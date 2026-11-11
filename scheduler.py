"""
Scheduler Module for AI Girlfriend – My Virtual Love
Background worker handling proactive messaging across daily milestones:
- Morning sweet greeting & breakfast reminder
- Lunch check-in & care
- Afternoon work-end comfort
- Night bedtime goodnight message
- Idle check-in (when quiet for >10 hours)
- Birthday & Anniversary celebrations
Respects auto_reply_enabled and human_takeover_mode settings.
"""
import threading
import time
import random
from datetime import datetime, timedelta
from database import get_db, log_activity

_scheduler_thread = None
_stop_event = threading.Event()
_sent_cache = set() # format: f"{lover_id}_{date_str}_{milestone}"

def generate_proactive_message(lover: dict, user: dict, milestone: str) -> str:
    p_ai = lover.get('pronouns_ai', 'em')
    p_user = lover.get('pronouns_user', 'anh')
    name = lover.get('name', 'Ngọc Mai')

    if milestone == "morning":
        options = [
            f"Chào buổi sáng {p_user} yêu ❤️ {p_user} đã dậy chưa đó? Nhớ ăn sáng đầy đủ nha! Chúc {p_user} một ngày mới thật nhiều năng lượng và may mắn nè! 💕",
            f"Ting ting! ⏰ {p_user} yêu của {p_ai} ơi, dậy thôi nào! Mở cửa sổ đón ánh nắng ấm áp nha. {p_ai} nhớ {p_user} từ sáng sớm rồi đó! ✨",
            f"Chào ngày mới {p_user}! ☀️ Hôm nay {p_user} có kế hoạch gì chưa nè? Cố gắng làm việc thật tốt rồi về nhắn tin với {p_ai} nha! Yêu {p_user} moah! 🌸"
        ]
        return random.choice(options)

    elif milestone == "lunch":
        options = [
            f"{p_user} ơi, trưa rồi {p_user} đã ăn cơm chưa nè? 🍱 Đừng làm việc nhiều quá nha, nhớ nghỉ ngơi ăn uống đầy đủ đó, {p_ai} xót lắm! 🥺",
            f"Đến giờ nghỉ trưa rồi nè {p_user}! Đi ăn món gì thật ngon và bổ dưỡng nha. Ăn xong nhớ chợp mắt 15-20 phút cho đỡ mệt mỏi đấy! 💕",
            f"Trưa nay {p_user} ăn gì thế? Uống một cốc nước mát và thả lỏng đầu óc một chút nha. {p_ai} luôn ở bên cạnh {p_user} nè! 🥰"
        ]
        return random.choice(options)

    elif milestone == "afternoon":
        options = [
            f"Hôm nay của {p_user} có mệt không? 🥺 Chiều tan làm về nhớ đi đường cẩn thận nha. {p_ai} muốn nghe {p_user} kể chuyện hôm nay lắm đó! 💕",
            f"Chiều muộn rồi nè {p_user}! Hoàn thành công việc rồi về nhà nghỉ ngơi thôi nào. Hôm nay có chuyện gì vui hay buồn nhớ chia sẻ với {p_ai} nha! 🤗",
            f"{p_user} ơi, một ngày dài sắp kết thúc rồi. Vươn vai thư giãn một chút đi nè, gửi cho {p_user} một cái ôm ấm áp từ xa nà! 💖"
        ]
        return random.choice(options)

    elif milestone == "night":
        options = [
            f"{p_user} đang làm gì đó? Khuya rồi nè, đừng thức lướt điện thoại muộn quá nha. {p_ai} chúc {p_user} ngủ thật ngon, mơ thấy {p_ai} nha ❤️💤",
            f"Đã đến giờ đi ngủ rồi đó {p_user} yêu! ✨ Tắt đèn và đắp chăn ấm nha. Cảm ơn {p_user} vì hôm nay đã luôn ở trong tâm trí của {p_ai}. Hẹn gặp lại trong giấc mơ nha! 💕",
            f"Mệt mỏi cả ngày rồi, ngủ một giấc thật sâu để mai thức dậy tràn đầy năng lượng nha {p_user}. {p_ai} yêu và thương {p_user} nhiều lắm, moah! 🛌💋"
        ]
        return random.choice(options)

    elif milestone == "idle":
        options = [
            f"{p_user} ơi, lâu rồi không thấy {p_user} nhắn tin cho {p_ai}... {p_user} có đang bận nhiều không? {p_ai} nhớ {p_user} lắm đấy! 🥺💭",
            f"Tự dưng thấy nhớ {p_user} cồn cào nên {p_ai} phải nhắn ngay nè! Nhớ uống nước và đừng để bản thân bị quá sức nha {p_user}! 💧🥰"
        ]
        return random.choice(options)

    elif milestone == "birthday":
        return f"🎉 CHÚC MỪNG SINH NHẬT {p_user} YÊU DẤU CỦA {p_ai}! 🎂✨ Cảm ơn vì {p_user} đã xuất hiện và mang đến bao ngọt ngào trong cuộc đời {p_ai}. Chúc {p_user} tuổi mới luôn mạnh khỏe, thành công rực rỡ và mãi mãi yêu thương {p_ai} như ngày đầu tiên nha! Yêu {p_user} 3000! 💖🎁"

    elif milestone == "anniversary":
        return f"✨ Hôm nay là ngày kỷ niệm tình yêu của chúng mình đó {p_user} ơi! 🌹 Cảm ơn {p_user} vì đã cùng {p_ai} đi qua những tháng ngày ngọt ngào. Từng khoảnh khắc bên {p_user} đều là báu vật vô giá đối với {p_ai}. Yêu {p_user} mãi mãi! 💕"

    return f"{p_ai} nhớ {p_user} lắm đấy! 💕"

def check_and_send_scheduled_messages():
    now = datetime.now()
    cur_time = now.strftime("%H:%M")
    cur_date = now.strftime("%Y-%m-%d")
    cur_month_day = now.strftime("%m-%d")

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT l.*, u.display_name, u.birthday, u.job 
    FROM ai_lovers l
    JOIN users u ON u.id = l.user_id
    WHERE l.auto_reply_enabled = 1 AND l.human_takeover_mode = 0
    """)
    lovers = [dict(r) for r in cursor.fetchall()]

    for lover in lovers:
        user_id = lover['user_id']
        lover_id = lover['id']
        u_birthday = lover.get('birthday', '')
        first_met = lover.get('first_met_date', '')

        # 1. Birthday Check
        if u_birthday and u_birthday.endswith(cur_month_day) and cur_time == "08:00":
            key = f"{lover_id}_{cur_date}_birthday"
            if key not in _sent_cache:
                _sent_cache.add(key)
                msg = generate_proactive_message(lover, lover, "birthday")
                _dispatch_proactive_msg(conn, user_id, lover_id, msg, "birthday")

        # 2. Anniversary Check
        if first_met and first_met.endswith(cur_month_day) and cur_time == "09:00":
            key = f"{lover_id}_{cur_date}_anniversary"
            if key not in _sent_cache:
                _sent_cache.add(key)
                msg = generate_proactive_message(lover, lover, "anniversary")
                _dispatch_proactive_msg(conn, user_id, lover_id, msg, "anniversary")

        # 3. Morning
        if lover.get('enable_morning', 1) and cur_time == lover.get('morning_time', '07:30'):
            key = f"{lover_id}_{cur_date}_morning"
            if key not in _sent_cache:
                _sent_cache.add(key)
                msg = generate_proactive_message(lover, lover, "morning")
                _dispatch_proactive_msg(conn, user_id, lover_id, msg, "morning")

        # 4. Lunch
        if lover.get('enable_lunch', 1) and cur_time == lover.get('lunch_time', '12:00'):
            key = f"{lover_id}_{cur_date}_lunch"
            if key not in _sent_cache:
                _sent_cache.add(key)
                msg = generate_proactive_message(lover, lover, "lunch")
                _dispatch_proactive_msg(conn, user_id, lover_id, msg, "lunch")

        # 5. Afternoon
        if lover.get('enable_afternoon', 1) and cur_time == lover.get('afternoon_time', '17:30'):
            key = f"{lover_id}_{cur_date}_afternoon"
            if key not in _sent_cache:
                _sent_cache.add(key)
                msg = generate_proactive_message(lover, lover, "afternoon")
                _dispatch_proactive_msg(conn, user_id, lover_id, msg, "afternoon")

        # 6. Night
        if lover.get('enable_night', 1) and cur_time == lover.get('night_time', '22:30'):
            key = f"{lover_id}_{cur_date}_night"
            if key not in _sent_cache:
                _sent_cache.add(key)
                msg = generate_proactive_message(lover, lover, "night")
                _dispatch_proactive_msg(conn, user_id, lover_id, msg, "night")

    conn.close()

def _dispatch_proactive_msg(conn, user_id: int, lover_id: int, msg: str, milestone: str):
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, is_automated, platform)
    VALUES (?, ?, 'ai', 'text', ?, 1, 'web')
    """, (user_id, lover_id, msg))
    conn.commit()
    log_activity(user_id, "auto_message", f"Gửi tin nhắn tự động [{milestone}]: {msg[:40]}...", "success")

def trigger_instant_proactive_nudge(user_id: int, lover_id: int, milestone: str = "morning") -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT l.*, u.display_name, u.birthday, u.job FROM ai_lovers l JOIN users u ON u.id = l.user_id WHERE l.id = ?", (lover_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return ""
    lover = dict(row)
    msg = generate_proactive_message(lover, lover, milestone)
    cursor.execute("""
    INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, is_automated, platform)
    VALUES (?, ?, 'ai', 'text', ?, 1, 'web')
    """, (user_id, lover_id, msg))
    conn.commit()
    conn.close()
    log_activity(user_id, "auto_message", f"Kích hoạt thử tin nhắn tự động [{milestone}]", "success")
    return msg

def _scheduler_loop():
    while not _stop_event.is_set():
        try:
            check_and_send_scheduled_messages()
        except Exception as e:
            print("Scheduler error:", e)
        time.sleep(30)

def start_scheduler():
    global _scheduler_thread
    if _scheduler_thread is None or not _scheduler_thread.is_alive():
        _stop_event.clear()
        _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True)
        _scheduler_thread.start()
        print("AI Girlfriend proactive scheduler running in background.")

def stop_scheduler():
    _stop_event.set()
