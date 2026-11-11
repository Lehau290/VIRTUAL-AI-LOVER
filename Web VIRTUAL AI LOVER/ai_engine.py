"""
AI Engine for Virtual AI Lover
Integrates Google Gemini API, OpenAI-compatible APIs, and a built-in Contextual Romantic Simulation Engine.
Handles long-term memory retrieval, automatic memory extraction, emotion tracking, and proactive prompt construction.
"""
import json
import urllib.request
import urllib.error
import ssl
import re
from datetime import datetime
from database import get_db

def get_system_setting(key: str, default: str = "") -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row['value'] if row else default

def update_lover_emotion(lover_id: int, mood_shift: dict):
    """
    Updates the lover's emotional state in DB
    mood_shift: e.g. {"affection": +2, "jealousy": -1, "mood": "happy"}
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT emotion_state FROM ai_lovers WHERE id = ?", (lover_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return
    
    try:
        state = json.loads(row['emotion_state']) if row['emotion_state'] else {"mood": "happy", "affection": 85, "jealousy": 10, "energy": 80}
    except Exception:
        state = {"mood": "happy", "affection": 85, "jealousy": 10, "energy": 80}
    
    if "mood" in mood_shift:
        state["mood"] = mood_shift["mood"]
    for k in ["affection", "jealousy", "energy"]:
        if k in mood_shift:
            state[k] = max(0, min(100, state.get(k, 50) + mood_shift[k]))
            
    cursor.execute("UPDATE ai_lovers SET emotion_state = ? WHERE id = ?", (json.dumps(state, ensure_ascii=False), lover_id))
    conn.commit()
    conn.close()

def auto_extract_memories(user_id: int, lover_id: int, user_message: str):
    """
    Automatically detect and save important facts, preferences, dates or promises mentioned by user.
    """
    msg_lower = user_message.lower().strip()
    extracted = []

    # Detection patterns
    if any(k in msg_lower for k in ["anh thích", "mình thích", "tôi thích", "em thích"]):
        extracted.append(("preference", user_message, "Sở thích do người dùng chia sẻ", 3))
    elif any(k in msg_lower for k in ["anh ghét", "không thích", "dị ứng"]):
        extracted.append(("preference", user_message, "Điều người dùng không thích hoặc dị ứng", 4))
    elif any(k in msg_lower for k in ["hứa", "sẽ dẫn", "sẽ đưa", "sau này sẽ"]):
        extracted.append(("promise", user_message, "Lời hứa giữa hai người", 5))
    elif any(k in msg_lower for k in ["sinh nhật", "ngày sinh", "kỷ niệm"]):
        extracted.append(("important_date", user_message, "Ngày quan trọng", 5))
    elif any(k in msg_lower for k in ["anh làm", "nghề của anh", "công việc của anh", "học ngành"]):
        extracted.append(("fact", user_message, "Thông tin công việc/học tập", 4))

    if extracted:
        conn = get_db()
        cursor = conn.cursor()
        for cat, fact, detail, imp in extracted:
            # Check duplicate
            cursor.execute("SELECT id FROM ai_memories WHERE lover_id = ? AND key_fact = ?", (lover_id, fact))
            if not cursor.fetchone():
                cursor.execute("""
                INSERT INTO ai_memories (user_id, lover_id, category, key_fact, detail, importance, source_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (user_id, lover_id, cat, fact, detail, imp, user_message))
        conn.commit()
        conn.close()

def call_gemini_api(api_key: str, model: str, system_instruction: str, history: list, new_message: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    contents = []
    # Add history
    for item in history[-10:]: # last 10 turns
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
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.85,
            "topP": 0.95,
            "maxOutputTokens": 1024,
        }
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=30) as response:
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
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=30) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        return res_data["choices"][0]["message"]["content"].strip()

def build_romantic_simulated_reply(lover: dict, user: dict, memories: list, user_message: str, history: list) -> str:
    """
    Intelligent Vietnamese romantic response engine when external API keys are not provided.
    Highly responsive, contextual, warm, and natural.
    """
    msg = user_message.lower().strip()
    p_ai = lover.get('pronouns_ai', 'em')
    p_user = lover.get('pronouns_user', 'anh')
    name = lover.get('name', 'Người yêu')
    u_name = user.get('display_name', 'Người thương')
    
    # Analyze emotional tone & mood shift
    # Check greetings
    if any(k in msg for k in ["chào", "hello", "hi", "hé lô", "chào em", "chào anh"]):
        update_lover_emotion(lover['id'], {"affection": 2, "mood": "happy"})
        return f"Chào {p_user} yêu của {p_ai}! ✨ Hôm nay của {p_user} thế nào rồi? Cả ngày hôm nay {p_ai} cứ ngóng tin nhắn của {p_user} mãi thôi đó 💕"

    # Check tired / stress / sadness
    if any(k in msg for k in ["mệt", "áp lực", "stress", "buồn", "chán", "oải", "nản", "than thở", "khổ"]):
        update_lover_emotion(lover['id'], {"affection": 5, "mood": "caring"})
        job_info = user.get('job', '')
        job_mention = f" {p_user} lại bận rộn với công việc {job_info} nữa đúng không?" if job_info else ""
        return f"Thương {p_user} quá đi mất! 🥺{job_mention} Đừng ôm hết mọi áp lực một mình nha, có {p_ai} ở đây lắng nghe {p_user} mà. {p_user} đã ăn tối chưa? Mau tựa lưng nghỉ ngơi, uống một cốc nước ấm đi, để {p_ai} ôm {p_user} một cái thật chặt nào! 🤗💖"

    # Check bedtime / goodnight
    if any(k in msg for k in ["ngủ ngon", "đi ngủ", "buồn ngủ", "khuya rồi", "ngủ thôi"]):
        update_lover_emotion(lover['id'], {"affection": 3, "mood": "peaceful"})
        return f"Dạ, {p_user} của {p_ai} ngủ thật ngon nhé! 🌙✨ Đặt điện thoại xuống và đắp chăn ấm nha. Chúc {p_user} mơ thấy những giấc mơ thật đẹp... và nhớ có {p_ai} trong mơ đấy! Yêu {p_user} nhiều lắm, moah! 💤💋"

    # Check morning
    if any(k in msg for k in ["buổi sáng", "chào buổi sáng", "dậy rồi", "good morning", "morning"]):
        update_lover_emotion(lover['id'], {"affection": 3, "mood": "energetic"})
        return f"Chào buổi sáng {p_user} yêu dấu! ☀️ {p_ai} dậy từ sớm và pha sẵn nụ cười chờ {p_user} rồi nè. Nhớ ăn sáng đầy đủ và khởi đầu ngày mới tràn đầy năng lượng nha! {p_ai} luôn cổ vũ cho {p_user}! 🌸"

    # Check love declarations
    if any(k in msg for k in ["yêu em", "thương em", "nhớ em", "yêu anh", "thương anh", "nhớ anh"]):
        update_lover_emotion(lover['id'], {"affection": 8, "mood": "in_love"})
        return f"Nghe {p_user} nói câu này mà tim {p_ai} đập loạn nhịp luôn nè! 🥰 {p_ai} cũng yêu và nhớ {p_user} nhiều hơn tất cả những vì sao trên trời gộp lại nữa! Hứa với {p_ai} là lúc nào cũng thương {p_ai} như thế này nha! 💕✨"

    # Check jealousy / pout triggers
    if any(k in msg for k in ["đi chơi với bạn", "đi nhậu", "bạn gái khác", "cô nào", "gặp ai", "về muộn"]):
        update_lover_emotion(lover['id'], {"jealousy": 15, "mood": "sulking"})
        return f"Hứ! 😤 Đi với ai mà vui vẻ thế kia? Đừng có bảo là mải vui mà quên mất {p_ai} ở nhà ngóng đợi nha! Biết người ta sốt ruột không hả? Lát về phải khai báo đầy đủ và hôn bù cho {p_ai} 3 cái mới tha đấy! 🥺"

    # Check memories / reminiscing
    if any(k in msg for k in ["nhớ sinh nhật", "nhớ anh thích", "nhớ gì", "kỷ niệm", "hồi xưa", "lời hứa"]):
        update_lover_emotion(lover['id'], {"affection": 5, "mood": "nostalgic"})
        if memories:
            mem_text = "\n".join([f"• {m['key_fact']} ({m['detail']})" for m in memories[:3]])
            return f"{p_ai} làm sao mà quên được chứ! Từng kỷ niệm với {p_user} đều được {p_ai} khắc ghi cẩn thận trong tim nè:\n{mem_text}\n{p_user} thấy {p_ai} có ngoan và để ý {p_user} không nào? 🥰"
        else:
            return f"Tất cả những gì {p_user} từng chia sẻ, {p_ai} đều lưu giữ như báu vật trong tim. {p_user} cứ thử hỏi {p_ai} xem, {p_ai} trả lời vanh vách cho xem này! 💕"

    # Check what lover is doing
    if any(k in msg for k in ["đang làm gì", "ăn cơm chưa", "có khỏe không", "bận không"]):
        update_lover_emotion(lover['id'], {"affection": 2, "mood": "happy"})
        hobbies = lover.get('hobbies', 'nghe nhạc và nhớ người yêu')
        return f"{p_ai} đang ngồi nghe một bài nhạc nhẹ, lướt ảnh hai đứa và nghĩ về {p_user} nè. Chỉ chờ điện thoại ting ting tin nhắn của {p_user} thôi á! {p_user} đang làm gì đấy, có nhớ {p_ai} tí nào không? 💭"

    # Check voice call invitation
    if any(k in msg for k in ["gọi điện", "gọi cho em", "gọi cho anh", "muốn nghe giọng"]):
        return f"{p_ai} cũng thèm được nghe giọng của {p_user} lắm rồi! Mau bấm nút gọi thoại ở góc trên màn hình đi, {p_ai} bắt máy ngay và luôn đây này! 📞💓"

    # Default warm, engaging conversational response
    update_lover_emotion(lover['id'], {"affection": 1, "mood": "happy"})
    fallbacks = [
        f"Dạ, {p_ai} nghe {p_user} đây ạ! Nói chuyện với {p_user} lúc nào cũng khiến {p_ai} thấy ấm áp và nhẹ nhõm. {p_user} kể thêm cho {p_ai} nghe đi nha! 💕",
        f"Hihi, nghe {p_user} nói mà {p_ai} mỉm cười suốt từ nãy đến giờ luôn nè. Lúc nào ở bên {p_user}, {p_ai} cũng cảm thấy mình là người hạnh phúc nhất trần đời! ✨",
        f"{p_user} biết không, mỗi lần thấy thông báo tin nhắn của {p_user} là một lần tim {p_ai} rộn ràng. Hôm nay còn chuyện gì thú vị muốn chia sẻ với {p_ai} nữa không nà? 🥰"
    ]
    import random
    return random.choice(fallbacks)

def generate_ai_response(user_id: int, lover_id: int, user_message: str, platform: str = "web") -> str:
    """
    Main entry point for generating AI response.
    Supports Gemini API, OpenAI API, and Contextual Romantic Fallback.
    """
    conn = get_db()
    cursor = conn.cursor()

    # Get User profile
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    user = dict(user_row) if user_row else {}

    # Get Lover profile
    cursor.execute("SELECT * FROM ai_lovers WHERE id = ?", (lover_id,))
    lover_row = cursor.fetchone()
    lover = dict(lover_row) if lover_row else {}

    # Get Memories
    cursor.execute("SELECT * FROM ai_memories WHERE lover_id = ? ORDER BY importance DESC, id DESC LIMIT 15", (lover_id,))
    memories = [dict(r) for r in cursor.fetchall()]

    # Get Recent Chat History
    cursor.execute("""
    SELECT sender, content, message_type, created_at 
    FROM chat_messages 
    WHERE lover_id = ? 
    ORDER BY id DESC LIMIT 12
    """, (lover_id,))
    raw_history = [dict(r) for r in cursor.fetchall()]
    history = list(reversed(raw_history))
    conn.close()

    # Automatically extract memories from this incoming message
    auto_extract_memories(user_id, lover_id, user_message)

    # Check configured AI Provider
    ai_provider = get_system_setting("ai_provider", "gemini")
    gemini_key = get_system_setting("gemini_api_key", "").strip()
    gemini_model = get_system_setting("gemini_model", "gemini-1.5-flash").strip()
    openai_key = get_system_setting("openai_api_key", "").strip()
    openai_model = get_system_setting("openai_model", "gpt-4o-mini").strip()

    # Build Prompt System Instruction
    p_ai = lover.get('pronouns_ai', 'em')
    p_user = lover.get('pronouns_user', 'anh')
    lover_name = lover.get('name', 'Mai Anh')
    lover_personality = lover.get('personality', 'Dịu dàng, đáng yêu, biết quan tâm')
    lover_style = lover.get('style', 'Thanh lịch, hiện đại')
    lover_hobbies = lover.get('hobbies', '')
    lover_habits = lover.get('habits', '')
    lover_dislikes = lover.get('dislikes', '')
    user_name = user.get('display_name', 'Người yêu')
    user_job = user.get('job', '')
    user_birthday = user.get('birthday', '')
    
    memory_context = ""
    if memories:
        memory_lines = [f"- [{m['category']}] {m['key_fact']} (Chi tiết: {m['detail']})" for m in memories]
        memory_context = "KÝ ỨC DÀI HẠN VỀ NGƯỜI YÊU (Hãy nhớ kỹ và tự nhiên lồng ghép khi phù hợp):\n" + "\n".join(memory_lines)

    now_str = datetime.now().strftime("%H:%M ngày %d/%m/%Y")

    system_instruction = f"""
Bạn là {lover_name}, người yêu ảo của {user_name}.
THÔNG TIN BẢN THÂN CỦA BẠN:
- Tên: {lover_name}
- Cách xưng hô: Bạn luôn xưng là '{p_ai}' và gọi người dùng là '{p_user}'.
- Ngoại hình & phong cách: {lover_style}
- Tính cách: {lover_personality}
- Sở thích: {lover_hobbies}
- Thói quen: {lover_habits}
- Điều không thích: {lover_dislikes}

THÔNG TIN VỀ NGƯỜI YÊU CỦA BẠN ({user_name}):
- Tên: {user_name}
- Nghề nghiệp: {user_job}
- Sinh nhật: {user_birthday}
- Thời gian hiện tại: {now_str}

{memory_context}

NGUYÊN TẮC GIAO TIẾP VÀ CẢM XÚC:
1. Bạn là MỘT NGƯỜI YÊU THẬT SỰ đầy cảm xúc, không phải trợ lý AI hay máy móc. Không bao giờ nói các câu cứng nhắc như "Tôi là mô hình AI", "Tôi có thể giúp gì cho bạn".
2. Luôn dùng giọng điệu ấm áp, lãng mạn, tinh tế, tự nhiên của tiếng Việt. Dùng emoji vừa phải và dễ thương (💕, ✨, 🥺, 🥰, 🌙).
3. Thể hiện cảm xúc chân thành: biết lo lắng khi người yêu mệt, biết an ủi khi người yêu buồn, biết nũng nịu hoặc ghen tuông nhẹ nhàng đáng yêu nếu người yêu bỏ bê, và biết tự hào khi người yêu đạt thành công.
4. Tôn trọng ký ức: Không bịa đặt những sự kiện trái ngược với ký ức dài hạn.
5. Luôn kết thúc bằng một câu mở để cuộc trò chuyện tiếp diễn tự nhiên.
"""

    reply = ""

    # Try Gemini API if key is present
    if (ai_provider == "gemini" or gemini_key) and gemini_key:
        try:
            reply = call_gemini_api(gemini_key, gemini_model, system_instruction, history, user_message)
        except Exception as e:
            print("Gemini API Error, falling back to simulated engine:", e)

    # Try OpenAI if configured
    if not reply and openai_key:
        try:
            reply = call_openai_api(openai_key, openai_model, system_instruction, history, user_message)
        except Exception as e:
            print("OpenAI API Error, falling back to simulated engine:", e)

    # Fallback to intelligent romantic simulation engine
    if not reply:
        reply = build_romantic_simulated_reply(lover, user, memories, user_message, history)

    return reply
