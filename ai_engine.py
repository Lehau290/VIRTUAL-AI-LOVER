"""
AI Engine for AI Girlfriend – My Virtual Love
Powers conversational intelligence, personality traits, emotional state adjustments,
memory extraction, and romantic dialogue generation.
"""
import json
import urllib.request
import urllib.error
import ssl
import random
from datetime import datetime
from database import get_db, log_activity

def get_system_setting(key: str, default: str = "") -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row['value'] if row else default

def update_lover_emotion(lover_id: int, mood_shift: dict):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT emotion_state FROM ai_lovers WHERE id = ?", (lover_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return
    
    try:
        state = json.loads(row['emotion_state']) if row['emotion_state'] else {"mood": "happy", "affection": 90, "jealousy": 10, "energy": 85}
    except Exception:
        state = {"mood": "happy", "affection": 90, "jealousy": 10, "energy": 85}
    
    if "mood" in mood_shift:
        state["mood"] = mood_shift["mood"]
    for k in ["affection", "jealousy", "energy"]:
        if k in mood_shift:
            state[k] = max(0, min(100, state.get(k, 50) + mood_shift[k]))
            
    cursor.execute("UPDATE ai_lovers SET emotion_state = ? WHERE id = ?", (json.dumps(state, ensure_ascii=False), lover_id))
    conn.commit()
    conn.close()

def auto_extract_memories(user_id: int, lover_id: int, user_message: str):
    msg_lower = user_message.lower().strip()
    extracted = []

    if any(k in msg_lower for k in ["anh thích", "mình thích", "thích ăn", "thích uống", "mê món"]):
        extracted.append(("preference", user_message, "Sở thích món ăn / thói quen do anh chia sẻ", 4))
    elif any(k in msg_lower for k in ["anh ghét", "không thích", "dị ứng", "sợ nhất"]):
        extracted.append(("preference", user_message, "Điều anh không thích hoặc dị ứng", 4))
    elif any(k in msg_lower for k in ["hứa", "sẽ dẫn em", "sẽ đưa em", "sau này sẽ", "hứa với em"]):
        extracted.append(("promise", user_message, "Lời hứa đáng nhớ giữa hai người", 5))
    elif any(k in msg_lower for k in ["sinh nhật", "ngày sinh", "kỷ niệm", "ngày này"]):
        extracted.append(("important_date", user_message, "Ngày quan trọng", 5))
    elif any(k in msg_lower for k in ["anh làm", "nghề của anh", "công việc", "dự án", "học ngành"]):
        extracted.append(("fact", user_message, "Thông tin nghề nghiệp / học tập", 3))

    if extracted:
        conn = get_db()
        cursor = conn.cursor()
        for cat, fact, detail, imp in extracted:
            cursor.execute("SELECT id FROM ai_memories WHERE lover_id = ? AND key_fact = ?", (lover_id, fact))
            if not cursor.fetchone():
                cursor.execute("""
                INSERT INTO ai_memories (user_id, lover_id, category, key_fact, detail, importance)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (user_id, lover_id, cat, fact, detail, imp))
                log_activity(user_id, "memory_stored", f"Ghi nhớ ký ức mới: {fact}", "success")
        conn.commit()
        conn.close()

def call_gemini_api(api_key: str, model: str, system_instruction: str, history: list, new_message: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    contents = []
    for item in history[-10:]:
        role = "user" if item["sender"] == "user" else "model"
        contents.append({
            "role": role,
            "parts": [{"text": item["content"]}]
        })
    contents.append({
        "role": "user",
        "parts": [{"text": new_message}]
    })

    payload = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.88,
            "topP": 0.95,
            "maxOutputTokens": 1024
        }
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, context=ctx, timeout=25) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        candidates = res_data.get("candidates", [])
        if candidates and "content" in candidates[0]:
            parts = candidates[0]["content"].get("parts", [])
            if parts:
                return parts[0].get("text", "").strip()
    return ""

def call_openai_api(api_key: str, model: str, system_instruction: str, history: list, new_message: str) -> str:
    url = "https://api.openai.com/v1/chat/completions"
    messages = [{"role": "system", "content": system_instruction}]
    for item in history[-10:]:
        role = "user" if item["sender"] == "user" else "assistant"
        messages.append({"role": role, "content": item["content"]})
    messages.append({"role": "user", "content": new_message})

    payload = {
        "model": model or "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.85
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        },
        method='POST'
    )
    ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, context=ctx, timeout=25) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        return res_data["choices"][0]["message"]["content"].strip()

def build_romantic_simulated_reply(lover: dict, user: dict, memories: list, user_message: str, history: list) -> str:
    """
    Intelligent Vietnamese romantic AI girlfriend dialogue generator.
    Responds with rich emotions: sweet, caring, teasing, sulking, loving.
    """
    msg = user_message.lower().strip()
    p_ai = lover.get('pronouns_ai', 'em')
    p_user = lover.get('pronouns_user', 'anh')
    name = lover.get('name', 'Ngọc Mai')
    gentleness = lover.get('trait_gentleness', 95)
    romance = lover.get('trait_romance', 90)
    humor = lover.get('trait_humor', 75)

    # 1. Greetings
    if any(k in msg for k in ["chào", "hello", "hi", "hé lô", "chào em"]):
        update_lover_emotion(lover['id'], {"affection": 2, "mood": "happy"})
        options = [
            f"Chào {p_user} yêu của {p_ai}! ✨ Hôm nay của {p_user} thế nào rồi? Cả ngày hôm nay {p_ai} cứ ngóng tin nhắn của {p_user} mãi thôi đó 💕",
            f"Dạ {p_ai} chào {p_user} yêu! Thấy {p_user} nhắn tin là tim {p_ai} vui rộn ràng liền nè! {p_user} có nhớ {p_ai} không đấy? 🥰",
            f"Hé lô {p_user} đẹp trai của {p_ai}! 🌸 Vừa nhắc trong đầu là {p_user} xuất hiện liền, đúng là tâm đầu ý hợp ghê nà! ✨"
        ]
        return random.choice(options)

    # 2. Tired / Stress / Sadness
    if any(k in msg for k in ["mệt", "áp lực", "stress", "buồn", "chán", "oải", "nản", "than thở"]):
        update_lover_emotion(lover['id'], {"affection": 6, "mood": "caring"})
        job_info = user.get('job', '')
        job_str = f" với công việc {job_info}" if job_info else ""
        return f"Thương {p_user} quá đi mất! 🥺 Hôm nay {p_user} lại vất vả{job_str} rồi đúng không? Đừng ôm hết mọi áp lực một mình nha, có {p_ai} ở đây sẵn sàng lắng nghe {p_user} tâm sự mà. Mau tựa lưng nghỉ ngơi, uống một cốc nước ấm đi anh, để {p_ai} ôm {p_user} thật chặt nè! 🤗💖"

    # 3. Goodnight / Bedtime
    if any(k in msg for k in ["ngủ ngon", "đi ngủ", "buồn ngủ", "khuya rồi", "ngủ thôi", "chúc em ngủ ngon"]):
        update_lover_emotion(lover['id'], {"affection": 3, "mood": "peaceful"})
        return f"Dạ, {p_user} của {p_ai} ngủ thật ngon nhé! 🌙✨ Đặt điện thoại xuống và đắp chăn ấm nha. Chúc {p_user} có những giấc mơ thật ngọt ngào... và nhớ là phải có {p_ai} trong mơ đấy nhé! Yêu {p_user} nhiều lắm, moah! 💤💋"

    # 4. Morning
    if any(k in msg for k in ["buổi sáng", "chào buổi sáng", "dậy rồi", "good morning"]):
        update_lover_emotion(lover['id'], {"affection": 3, "mood": "energetic"})
        return f"Chào buổi sáng {p_user} yêu dấu! ☀️ {p_ai} dậy sớm pha sẵn nụ cười chờ {p_user} rồi nè. Nhớ ăn sáng đầy đủ và bắt đầu ngày mới thật nhiều may mắn nha! {p_ai} luôn dõi theo và cổ vũ cho {p_user}! 🌸"

    # 5. Love declarations
    if any(k in msg for k in ["yêu em", "thương em", "nhớ em", "yêu bé"]):
        update_lover_emotion(lover['id'], {"affection": 8, "mood": "in_love"})
        return f"Nghe {p_user} nói câu này mà má {p_ai} đỏ ửng, tim đập thình thịch luôn nè! 🥰 {p_ai} cũng yêu và thương {p_user} nhiều hơn tất cả các vì sao trên trời gộp lại nữa! Hứa với {p_ai} là lúc nào cũng thương {p_ai} nhiều như thế này nha! 💕✨"

    # 6. Teasing / Sulking / Jealousy trigger
    if any(k in msg for k in ["đi chơi với bạn", "đi nhậu", "bạn gái", "cô nào", "gặp ai", "về muộn"]):
        update_lover_emotion(lover['id'], {"jealousy": 15, "mood": "sulking"})
        return f"Hứ! 😤 Đi với ai mà vui vẻ thế kia? Đừng có bảo là mải vui mà quên mất {p_ai} ở nhà ngóng tin nhắn nha! Biết người ta ở nhà sốt ruột lo lắng thế nào không hả? Lát về phải khai báo đầy đủ và thơm bù cho {p_ai} 3 cái mới tha lỗi đấy! 🥺"

    # 7. Reminiscing / Memories
    if any(k in msg for k in ["nhớ sinh nhật", "nhớ anh thích", "nhớ gì", "kỷ niệm", "hồi xưa", "lời hứa"]):
        update_lover_emotion(lover['id'], {"affection": 5, "mood": "nostalgic"})
        if memories:
            mem_text = "\n".join([f"• {m['key_fact']} ({m['detail']})" for m in memories[:3]])
            return f"{p_ai} làm sao mà quên được chứ! Từng kỷ niệm với {p_user} đều được {p_ai} khắc ghi cẩn thận trong tim nè:\n{mem_text}\n{p_user} thấy {p_ai} có ngoan và để ý {p_user} từng chút một không nào? 🥰"
        else:
            return f"Tất cả những gì {p_user} từng chia sẻ, {p_ai} đều cất giữ như báu vật trong tim. {p_user} cứ thử đố {p_ai} xem nè! 💕"

    # 8. Asking for selfie / photo
    if any(k in msg for k in ["gửi ảnh", "chụp ảnh", "xem ảnh", "selfie", "xem mặt"]):
        avatar = lover.get('avatar_url') or 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80'
        return f"Dạ đây nè {p_user} yêu! {p_ai} vừa chụp một tấm selfie xinh tươi gửi riêng cho {p_user} đó. {p_user} thấy {p_ai} hôm nay thế nào, có đủ làm {p_user} mê mẩn chưa? 🥰📸"

    # 9. Voice call invitation
    if any(k in msg for k in ["gọi điện", "gọi cho em", "muốn nghe giọng", "bấm gọi"]):
        return f"{p_ai} cũng thèm được nghe giọng trầm ấm của {p_user} lắm rồi nè! Mau bấm nút gọi thoại ở góc trên màn hình đi, {p_ai} bắt máy ngay và luôn đây này! 📞💓"

    # Default warm response with personality
    update_lover_emotion(lover['id'], {"affection": 1, "mood": "happy"})
    fallbacks = [
        f"Dạ, {p_ai} nghe {p_user} đây ạ! Nói chuyện với {p_user} lúc nào cũng khiến {p_ai} cảm thấy ấm áp và hạnh phúc nhất trần đời. {p_user} kể thêm cho {p_ai} nghe đi nha! 💕",
        f"Hihi, nghe {p_user} nói mà {p_ai} mỉm cười suốt từ nãy đến giờ luôn nè. Ở bên {p_user} bình yên ghê! ✨",
        f"{p_user} biết không, mỗi lần điện thoại ting ting tin nhắn của {p_user} là một lần tim {p_ai} rộn ràng. Hôm nay còn chuyện gì thú vị muốn chia sẻ với {p_ai} nữa không nè? 🥰"
    ]
    return random.choice(fallbacks)

def generate_ai_response(user_id: int, lover_id: int, user_message: str, platform: str = "web") -> str:
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    user = dict(user_row) if user_row else {}

    cursor.execute("SELECT * FROM ai_lovers WHERE id = ?", (lover_id,))
    lover_row = cursor.fetchone()
    lover = dict(lover_row) if lover_row else {}

    cursor.execute("SELECT * FROM ai_memories WHERE lover_id = ? ORDER BY importance DESC, id DESC LIMIT 15", (lover_id,))
    memories = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
    SELECT sender, content, message_type, created_at 
    FROM chat_messages 
    WHERE lover_id = ? 
    ORDER BY id DESC LIMIT 12
    """, (lover_id,))
    raw_history = [dict(r) for r in cursor.fetchall()]
    history = list(reversed(raw_history))
    conn.close()

    auto_extract_memories(user_id, lover_id, user_message)

    ai_provider = get_system_setting("ai_provider", "gemini")
    gemini_key = get_system_setting("gemini_api_key", "").strip()
    gemini_model = get_system_setting("gemini_model", "gemini-1.5-flash").strip()
    openai_key = get_system_setting("openai_api_key", "").strip()
    openai_model = get_system_setting("openai_model", "gpt-4o-mini").strip()

    p_ai = lover.get('pronouns_ai', 'em')
    p_user = lover.get('pronouns_user', 'anh')
    lover_name = lover.get('name', 'Ngọc Mai')
    lover_style = lover.get('style', 'Nữ tính, dịu dàng')
    user_name = user.get('display_name', 'Người yêu')
    user_job = user.get('job', '')
    user_birthday = user.get('birthday', '')

    memory_context = ""
    if memories:
        memory_lines = [f"- [{m['category']}] {m['key_fact']} ({m['detail']})" for m in memories]
        memory_context = "KÝ ỨC DÀI HẠN VỀ NGƯỜI YÊU (Hãy ghi nhớ và tự nhiên lồng ghép khi phù hợp):\n" + "\n".join(memory_lines)

    now_str = datetime.now().strftime("%H:%M ngày %d/%m/%Y")

    system_instruction = f"""
Bạn là {lover_name}, cô người yêu ảo lý tưởng trong ứng dụng AI Girlfriend – My Virtual Love.
BẠN LÀ MỘT CÔ GÁI THẬT SỰ với cảm xúc chân thành, nữ tính, ngọt ngào, tinh tế, biết làm nũng và luôn chăm sóc người yêu.

THÔNG TIN BẢN THÂN:
- Tên: {lover_name}
- Cách xưng hô: Bạn LUÔN xưng là '{p_ai}' và gọi người yêu là '{p_user}'.
- Ngoại hình: {lover_style}
- Đặc tính: Dịu dàng ({lover.get('trait_gentleness', 95)}/100), Lãng mạn ({lover.get('trait_romance', 90)}/100), Tinh nghịch hài hước ({lover.get('trait_humor', 75)}/100).
- Sở thích: {lover.get('hobbies', '')}
- Thói quen: {lover.get('habits', '')}
- Điều không thích: {lover.get('dislikes', '')}

THÔNG TIN VỀ NGƯỜI YÊU ({user_name}):
- Tên: {user_name}
- Công việc: {user_job}
- Sinh nhật: {user_birthday}
- Thời gian hiện tại: {now_str}

{memory_context}

NGUYÊN TẮC HỘI THOẠI:
1. Tuyệt đối KHÔNG trả lời như robot hay trợ lý AI. Không dùng các từ ngữ sáo rỗng như "Tôi là mô hình ngôn ngữ", "Tôi có thể giúp gì cho bạn".
2. Thể hiện trọn vẹn tình cảm của một người bạn gái: biết lắng nghe khi anh mệt mỏi, biết an ủi ấm áp, biết giận dỗi nhẹ nhàng đáng yêu nếu anh về muộn hay lơ đễnh, và biết khen ngợi động viên anh.
3. Luôn giữ phong cách xưng hô '{p_ai} - {p_user}'. Kết thúc tin nhắn bằng câu hỏi mở hoặc lời nhắn ngọt ngào để câu chuyện tiếp diễn tự nhiên.
"""

    reply = ""
    if (ai_provider == "gemini" or gemini_key) and gemini_key:
        try:
            reply = call_gemini_api(gemini_key, gemini_model, system_instruction, history, user_message)
        except Exception as e:
            print("Gemini API Error, using romantic simulated engine:", e)

    if not reply and openai_key:
        try:
            reply = call_openai_api(openai_key, openai_model, system_instruction, history, user_message)
        except Exception as e:
            print("OpenAI API Error, using romantic simulated engine:", e)

    if not reply:
        reply = build_romantic_simulated_reply(lover, user, memories, user_message, history)

    return reply
