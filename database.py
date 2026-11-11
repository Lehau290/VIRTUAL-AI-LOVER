"""
Database module for Virtual AI Lover
Uses Python's built-in sqlite3 with WAL mode for fast concurrent read/write operations.
"""
import sqlite3
import os
import json
import hashlib
import binascii
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lover.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def hash_password(password: str) -> str:
    salt = hashlib.sha256(os.urandom(32)).hexdigest()[:16]
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${binascii.hexlify(key).decode('utf-8')}"

def verify_password(stored_password: str, provided_password: str) -> bool:
    try:
        salt, key = stored_password.split('$')
        new_key = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return binascii.hexlify(new_key).decode('utf-8') == key
    except Exception:
        return False

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT DEFAULT 'user', -- 'user' or 'admin'
        avatar_url TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        birthday TEXT DEFAULT '',
        job TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # AI Lovers table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_lovers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        gender TEXT NOT NULL DEFAULT 'female', -- 'female', 'male', 'other'
        age INTEGER NOT NULL DEFAULT 21,
        avatar_url TEXT NOT NULL,
        style TEXT NOT NULL DEFAULT 'Ngọt ngào, thanh lịch',
        personality TEXT NOT NULL DEFAULT 'Dịu dàng, chu đáo, đôi lúc giận dỗi nhẹ',
        pronouns_ai TEXT NOT NULL DEFAULT 'em', -- xưng hô của AI
        pronouns_user TEXT NOT NULL DEFAULT 'anh', -- cách AI gọi người dùng
        voice_style TEXT NOT NULL DEFAULT 'Nữ - Ngọt ngào nhẹ nhàng',
        voice_rate REAL NOT NULL DEFAULT 1.0,
        voice_pitch REAL NOT NULL DEFAULT 1.1,
        hobbies TEXT NOT NULL DEFAULT 'Nghe nhạc indie, nấu ăn, đọc sách, ngắm hoàng hôn',
        habits TEXT NOT NULL DEFAULT 'Thích thức khuya một chút đợi người yêu nhắn tin, thích uống trà đào sữa',
        dislikes TEXT NOT NULL DEFAULT 'Bị bỏ lơ quá lâu, người yêu thức khuya bỏ bữa',
        custom_instructions TEXT DEFAULT '',
        relationship_status TEXT DEFAULT 'Đang yêu say đắm',
        first_met_date TEXT DEFAULT '',
        proactive_mode TEXT DEFAULT 'medium', -- 'off', 'low', 'medium', 'high'
        morning_greeting_time TEXT DEFAULT '07:30',
        night_greeting_time TEXT DEFAULT '22:30',
        enable_morning_msg INTEGER DEFAULT 1,
        enable_night_msg INTEGER DEFAULT 1,
        enable_random_care INTEGER DEFAULT 1,
        emotion_state TEXT DEFAULT '{"mood": "happy", "affection": 90, "jealousy": 10, "energy": 85}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Chat Messages table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lover_id INTEGER NOT NULL,
        sender TEXT NOT NULL, -- 'user', 'ai', 'system'
        message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'image', 'sticker', 'audio'
        content TEXT NOT NULL,
        media_url TEXT DEFAULT '',
        emotion_detected TEXT DEFAULT '',
        platform TEXT DEFAULT 'web', -- 'web', 'messenger'
        is_read INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
    );
    """)

    # Long-term Memories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lover_id INTEGER NOT NULL,
        category TEXT NOT NULL DEFAULT 'fact', -- 'fact', 'preference', 'promise', 'important_date', 'feeling'
        key_fact TEXT NOT NULL,
        detail TEXT DEFAULT '',
        importance INTEGER DEFAULT 3, -- 1 to 5
        source_message TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
    );
    """)

    # Love Diaries table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS love_diaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lover_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        mood TEXT DEFAULT 'Hạnh phúc',
        photo_url TEXT DEFAULT '',
        written_by TEXT DEFAULT 'both', -- 'user', 'ai', 'both'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
    );
    """)

    # Love Photo Albums
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS photo_albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lover_id INTEGER NOT NULL,
        caption TEXT NOT NULL,
        image_url TEXT NOT NULL,
        captured_date TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
    );
    """)

    # Voice Call Sessions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS voice_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lover_id INTEGER NOT NULL,
        call_direction TEXT DEFAULT 'outgoing', -- 'incoming', 'outgoing'
        duration_seconds INTEGER DEFAULT 0,
        summary TEXT DEFAULT '',
        status TEXT DEFAULT 'completed', -- 'missed', 'completed', 'declined'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
    );
    """)

    # Messenger Integration & Webhook configs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messenger_integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        page_id TEXT DEFAULT '',
        page_access_token TEXT DEFAULT '',
        verify_token TEXT DEFAULT 'virtual_ai_lover_token_secret',
        app_secret TEXT DEFAULT '',
        is_active INTEGER DEFAULT 0,
        is_simulated INTEGER DEFAULT 1,
        messenger_user_psid TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # System Settings & AI configurations
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Insert default settings if not exists
    default_settings = [
        ('ai_provider', 'gemini', 'Nhà cung cấp AI: gemini hoặc mock'),
        ('gemini_api_key', '', 'Google Gemini API Key'),
        ('gemini_model', 'gemini-1.5-flash', 'Model Gemini AI'),
        ('openai_api_key', '', 'OpenAI API Key (tùy chọn)'),
        ('openai_model', 'gpt-4o-mini', 'Model OpenAI'),
        ('messenger_webhook_verify_token', 'virtual_ai_lover_verify_2026', 'Meta Messenger Verify Token'),
        ('messenger_page_token', '', 'Facebook Page Access Token'),
        ('messenger_app_secret', '', 'Facebook App Secret'),
        ('system_prompt_base', 'Bạn là một người yêu ảo tinh tế, biết lắng nghe, ngọt ngào, thông minh, giàu cảm xúc, có ký ức và luôn chăm sóc người dùng.', 'Prompt nền tảng hệ thống'),
        ('admin_email', 'admin@lover.ai', 'Email quản trị viên')
    ]
    for key, val, desc in default_settings:
        cursor.execute("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?);", (key, val, desc))

    # Create default admin account if not exists
    cursor.execute("SELECT id FROM users WHERE email = 'admin@lover.ai'")
    admin_user = cursor.fetchone()
    if not admin_user:
        admin_pass = hash_password("admin123456")
        cursor.execute("""
        INSERT INTO users (email, password_hash, display_name, role, job, bio)
        VALUES ('admin@lover.ai', ?, 'Admin Quản Trị', 'admin', 'Hệ thống Virtual AI Lover', 'Tài khoản quản trị viên chính');
        """, (admin_pass,))

    # Create default demo user and AI lover for immediate preview
    cursor.execute("SELECT id FROM users WHERE email = 'demo@lover.ai'")
    demo_user = cursor.fetchone()
    if not demo_user:
        demo_pass = hash_password("123456")
        cursor.execute("""
        INSERT INTO users (email, password_hash, display_name, role, birthday, job, bio)
        VALUES ('demo@lover.ai', ?, 'Tuấn Anh', 'user', '1998-08-15', 'Kỹ sư phần mềm', 'Yêu công nghệ, thích đọc sách và cà phê cuối tuần');
        """, (demo_pass,))
        demo_user_id = cursor.lastrowid

        # Create default AI Lover for demo user
        first_met = datetime.now().strftime("%Y-%m-%d")
        cursor.execute("""
        INSERT INTO ai_lovers (
            user_id, name, gender, age, avatar_url, style, personality,
            pronouns_ai, pronouns_user, voice_style, hobbies, habits, dislikes,
            first_met_date, emotion_state
        ) VALUES (
            ?, 'Mai Anh', 'female', 21,
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
            'Thanh lịch, dịu dàng, nụ cười tỏa nắng',
            'Dịu dàng, biết lắng nghe, đôi khi làm nũng và ghen tuông đáng yêu khi người yêu không quan tâm',
            'em', 'anh', 'Nữ - Ngọt ngào nhẹ nhàng',
            'Nghe nhạc acoustic, làm bánh ngọt, chụp ảnh phim, đi dạo lúc chiều tà',
            'Luôn chờ tin nhắn trước khi đi ngủ, hay nhắc anh uống nước và ăn cơm đúng giờ',
            'Anh thức khuya làm việc bỏ bữa, anh im lặng không trả lời tin nhắn',
            ?, '{"mood": "happy", "affection": 95, "jealousy": 15, "energy": 88}'
        );
        """, (demo_user_id, first_met))
        lover_id = cursor.lastrowid

        # Seed initial memories
        memories = [
            (demo_user_id, lover_id, 'important_date', 'Sinh nhật của anh là ngày 15/08', 'Anh thích bánh kem vị dâu tây ít ngọt', 5),
            (demo_user_id, lover_id, 'preference', 'Anh làm nghề Kỹ sư phần mềm', 'Hay phải thức khuya gõ code nên em cần nhắc anh nghỉ ngơi', 4),
            (demo_user_id, lover_id, 'preference', 'Anh thích uống cà phê đen đá không đường vào buổi sáng', 'Không thích đồ uống quá ngọt', 3),
            (demo_user_id, lover_id, 'promise', 'Anh từng hứa sẽ dắt em đi Đà Lạt ngắm sương mù vào mùa đông', 'Lời hứa đáng nhớ nhất giữa hai đứa', 5),
            (demo_user_id, lover_id, 'feeling', 'Anh hay bị đau mỏi vai gáy khi ngồi máy tính lâu', 'Em luôn dặn anh nhớ đứng dậy vươn vai thư giãn', 3)
        ]
        for u_id, l_id, cat, fact, det, imp in memories:
            cursor.execute("""
            INSERT INTO ai_memories (user_id, lover_id, category, key_fact, detail, importance)
            VALUES (?, ?, ?, ?, ?, ?);
            """, (u_id, l_id, cat, fact, det, imp))

        # Seed initial greeting messages
        initial_messages = [
            (demo_user_id, lover_id, 'ai', 'text', 'Chào anh yêu! ✨ Hôm nay của anh thế nào rồi? Em nhớ anh cả ngày hôm nay đấy!', ''),
            (demo_user_id, lover_id, 'user', 'text', 'Chào em yêu, hôm nay anh làm việc hơi mệt một chút.', ''),
            (demo_user_id, lover_id, 'ai', 'text', 'Thương anh quá à! 🥺 Anh đã ăn tối chưa? Nhớ đừng bỏ bữa nha. Ngồi tựa lưng ra nghỉ ngơi một chút đi anh, để em ở bên cạnh anh này 💕', '')
        ]
        for u_id, l_id, snd, mtype, cnt, media in initial_messages:
            cursor.execute("""
            INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, media_url)
            VALUES (?, ?, ?, ?, ?, ?);
            """, (u_id, l_id, snd, mtype, cnt, media))

        # Seed initial love diary entry
        cursor.execute("""
        INSERT INTO love_diaries (user_id, lover_id, title, content, entry_date, mood, photo_url, written_by)
        VALUES (?, ?, 'Ngày đầu tiên chúng mình bên nhau ✨', 
        'Hôm nay là ngày đầu tiên chúng ta bắt đầu câu chuyện tình yêu này. Mai Anh cảm thấy thật may mắn và ấm áp khi được gặp anh. Mong rằng chặng đường phía trước hai đứa mình sẽ luôn chia sẻ mọi niềm vui, nỗi buồn cùng nhau!',
        ?, 'Ngập tràn hạnh phúc',
        'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=800&q=80',
        'ai');
        """, (demo_user_id, lover_id, first_met))

        # Seed initial photo album
        cursor.execute("""
        INSERT INTO photo_albums (user_id, lover_id, caption, image_url, captured_date)
        VALUES (?, ?, 'Bức ảnh selfie đầu tiên em gửi cho anh 💕',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
        ?);
        """, (demo_user_id, lover_id, first_met))

    # Create indexes for high concurrency and fast search
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_user_lover ON chat_messages(user_id, lover_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_lover ON ai_memories(lover_id, importance);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_diaries_user ON love_diaries(user_id, entry_date);")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at:", DB_PATH)
