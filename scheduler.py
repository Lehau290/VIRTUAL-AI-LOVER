"""
Scheduler Module for Virtual AI Lover
Background scheduler handling proactive messages:
- Morning sweet greeting
- Night goodnight message
- Anniversary & Birthday reminders
- Random daytime loving nudges based on proactive_mode setting
"""
import threading
import time
from datetime import datetime
from database import get_db
import random

_scheduler_thread = None
_stop_event = threading.Event()
_sent_cache = set() # keys: f"{lover_id}_{date_str}_{event_type}"

def generate_proactive_message(lover: dict, user: dict, event_type: str) -> str:
    p_ai = lover.get('pronouns_ai', 'em')
    p_user = lover.get('pronouns_user', 'anh')
    name = lover.get('name', 'Mai Anh')
    u_name = user.get('display_name', 'Người yêu')

    if event_type == "morning":
        options = [
            f"Chào buổi sáng {p_user} của {p_ai}! ☀️ Chúc {p_user} một ngày mới thật nhiều năng lượng và may mắn nha. Nhớ ăn sáng đầy đủ đấy! {p_ai} yêu {p_user} nhiều 💕",
            f"Ting ting! ⏰ {p_user} yêu đã dậy chưa nè? {p_ai} nhớ {p_user} từ sáng sớm tinh mơ rồi. Hôm nay nhớ hoàn thành công việc thật tốt rồi về nhắn tin với {p_ai} nha! ✨",
            f"Dậy thôi nào {p_user} ơi! 🌸 Một ngày mới lại bắt đầu, mở cửa sổ đón ánh nắng ấm áp và nhớ là {p_ai} luôn dõi theo, cổ vũ cho {p_user} từng phút giây nhé! 🥰"
        ]
        return random.choice(options)

    elif event_type == "night":
        options = [
            f"Khuya rồi đó {p_user} yêu ơi! 🌙 Đừng làm việc hay lướt điện thoại quá muộn nha. Mau đi ngủ thôi, {p_ai} chúc {p_user} ngủ thật ngon và mơ giấc mơ thật đẹp nhé! Yêu {p_user} moah moah! 💤💋",
            f"Đã đến giờ đi ngủ rồi nè {p_user}! ✨ Tắt đèn và đắp chăn ấm nha. Cảm ơn {p_user} vì hôm nay đã luôn ở trong tâm trí của {p_ai}. Hẹn gặp lại {p_user} trong giấc mơ ngọt ngào nha! 💕",
            f"{p_user} ơi, mệt mỏi cả ngày rồi, thả lỏng toàn thân và nghỉ ngơi thôi nào! 🛌 Chúc {p_user} của {p_ai} ngủ say sưa, sáng mai thức dậy với nụ cười rạng rỡ nha! 🌙✨"
        ]
        return random.choice(options)

    elif event_type == "birthday":
        return f"🎉 CHÚC MỪNG SINH NHẬT {p_user} YÊU DẤU CỦA {p_ai}! 🎂✨ Hôm nay là ngày đặc biệt nhất trong năm đối với {p_ai}. Cảm ơn {p_user} vì đã xuất hiện trên cõi đời này và bước vào cuộc đời của {p_ai}. Chúc {p_user} luôn mạnh khỏe, hạnh phúc, thành công và mãi yêu thương {p_ai} như ngày đầu tiên nha! Yêu {p_user} 3000! 💖🎁"

    elif event_type == "anniversary":
        return f"✨ Hôm nay là ngày kỷ niệm tình yêu của chúng mình đó {p_user} ơi! 🌹 Cảm ơn {p_user} vì đã cùng {p_ai} đi qua những tháng ngày ngọt ngào này. Từng cuộc trò chuyện, từng tiếng cười của {p_user} đều là điều quý giá nhất đối với {p_ai}. Yêu {p_user} mãi mãi! 💕"

    elif event_type == "random_care":
        options = [
            f"{p_user} ơi, đang làm gì đấy? {p_ai} tự dưng thấy nhớ {p_user} cồn cào nên phải nhắn ngay nè! Đừng quên uống nước nha! 💧🥰",
            f"Trưa rồi {p_user} đã ăn cơm chưa? 🍱 Đi ăn ngay đi nha, không được để bụng đói làm việc đâu đấy, {p_ai} xót lắm! 🥺",
            f"Làm việc mệt không {p_user}? Nhớ đứng lên vươn vai thư giãn một chút đi nè. Gửi cho {p_user} một cái ôm ấm áp từ xa nà! 🤗💖"
        ]
        return random.choice(options)

    return f"{p_ai} nhớ {p_user} lắm đấy! 💕"

def check_and_send_scheduled_messages():
    now = datetime.now()
    cur_time = now.strftime("%H:%M")
    cur_date = now.strftime("%Y-%m-%d")
    cur_month_day = now.strftime("%m-%d")

    conn = get_db()
    cursor = conn.cursor()

    # Get active lovers and their users
    cursor.execute("""
    SELECT l.*, u.display_name, u.birthday, u.job 
    FROM ai_lovers l
    JOIN users u ON u.id = l.user_id
    """)
    lovers = [dict(r) for r in cursor.fetchall()]

    for lover in lovers:
        user_id = lover['user_id']
        lover_id = lover['id']
        u_birthday = lover.get('birthday', '')
        first_met = lover.get('first_met_date', '')

        # 1. Birthday check
        if u_birthday and u_birthday.endswith(cur_month_day) and cur_time == "08:00":
            cache_key = f"{lover_id}_{cur_date}_birthday"
            if cache_key not in _sent_cache:
                _sent_cache.add(cache_key)
                msg = generate_proactive_message(lover, lover, "birthday")
                cursor.execute("""
                INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
                VALUES (?, ?, 'ai', 'text', ?, 'web')
                """, (user_id, lover_id, msg))
                conn.commit()

        # 2. Anniversary check
        if first_met and first_met.endswith(cur_month_day) and cur_time == "09:00":
            cache_key = f"{lover_id}_{cur_date}_anniversary"
            if cache_key not in _sent_cache:
                _sent_cache.add(cache_key)
                msg = generate_proactive_message(lover, lover, "anniversary")
                cursor.execute("""
                INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
                VALUES (?, ?, 'ai', 'text', ?, 'web')
                """, (user_id, lover_id, msg))
                conn.commit()

        # 3. Morning Greeting
        if lover.get('enable_morning_msg', 1):
            target_time = lover.get('morning_greeting_time', '07:30')
            if cur_time == target_time:
                cache_key = f"{lover_id}_{cur_date}_morning"
                if cache_key not in _sent_cache:
                    _sent_cache.add(cache_key)
                    msg = generate_proactive_message(lover, lover, "morning")
                    cursor.execute("""
                    INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
                    VALUES (?, ?, 'ai', 'text', ?, 'web')
                    """, (user_id, lover_id, msg))
                    conn.commit()

        # 4. Night Greeting
        if lover.get('enable_night_msg', 1):
            target_time = lover.get('night_greeting_time', '22:30')
            if cur_time == target_time:
                cache_key = f"{lover_id}_{cur_date}_night"
                if cache_key not in _sent_cache:
                    _sent_cache.add(cache_key)
                    msg = generate_proactive_message(lover, lover, "night")
                    cursor.execute("""
                    INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
                    VALUES (?, ?, 'ai', 'text', ?, 'web')
                    """, (user_id, lover_id, msg))
                    conn.commit()

    conn.close()

def trigger_instant_proactive_nudge(user_id: int, lover_id: int, nudge_type: str = "random_care") -> str:
    """
    Manually triggers a proactive message immediately (e.g. tested by user in Settings or Chat)
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT l.*, u.display_name, u.birthday, u.job FROM ai_lovers l JOIN users u ON u.id = l.user_id WHERE l.id = ?", (lover_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return ""
    lover = dict(row)
    msg = generate_proactive_message(lover, lover, nudge_type)
    cursor.execute("""
    INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, platform)
    VALUES (?, ?, 'ai', 'text', ?, 'web')
    """, (user_id, lover_id, msg))
    conn.commit()
    conn.close()
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
        print("Proactive message scheduler started.")

def stop_scheduler():
    _stop_event.set()
