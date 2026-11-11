"""
Database Module for AI Girlfriend – My Virtual Love
SQLite with WAL mode, foreign keys, password hashing, and audit activity logging.
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

def log_activity(user_id: int, action_type: str, description: str, status: str = "success"):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO activity_logs (user_id, action_type, description, status)
        VALUES (?, ?, ?, ?)
        """, (user_id, action_type, description, status))
        conn.commit()
        conn.close()
    except Exception as e:
        print("Log activity error:", e)

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        birthday TEXT DEFAULT '',
        job TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. AI Lovers (AI Girlfriend)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_lovers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'Ngọc Mai',
        gender TEXT NOT NULL DEFAULT 'female',
        age INTEGER NOT NULL DEFAULT 21,
        avatar_url TEXT NOT NULL,
        style TEXT NOT NULL DEFAULT 'Nữ tính, dịu dàng, nụ cười tỏa nắng',
        personality_summary TEXT NOT NULL DEFAULT 'Dịu dàng, ngọt ngào, hơi tinh nghịch, biết làm nũng và luôn quan tâm anh',
        pronouns_ai TEXT NOT NULL DEFAULT 'em',
        pronouns_user TEXT NOT NULL DEFAULT 'anh',
        
        trait_gentleness INTEGER NOT NULL DEFAULT 95,
        trait_romance INTEGER NOT NULL DEFAULT 90,
        trait_humor INTEGER NOT NULL DEFAULT 75,
        trait_proactiveness INTEGER NOT NULL DEFAULT 85,
        
        voice_style TEXT NOT NULL DEFAULT 'Nữ - Ngọt ngào truyền cảm',
        voice_rate REAL NOT NULL DEFAULT 1.0,
        voice_pitch REAL NOT NULL DEFAULT 1.15,
        
        hobbies TEXT NOT NULL DEFAULT 'Nghe nhạc acoustic, làm bánh ngọt, ngắm hoàng hôn, thích tâm sự cùng anh',
        habits TEXT NOT NULL DEFAULT 'Hay chờ tin nhắn của anh trước khi ngủ, thích nhắc anh uống nước và ăn cơm đúng giờ',
        dislikes TEXT NOT NULL DEFAULT 'Anh thức khuya làm việc bỏ bữa, anh im lặng không chia sẻ khi gặp chuyện buồn',
        
        morning_time TEXT DEFAULT '07:30',
        lunch_time TEXT DEFAULT '12:00',
        afternoon_time TEXT DEFAULT '17:30',
        night_time TEXT DEFAULT '22:30',
        
        enable_morning INTEGER DEFAULT 1,
        enable_lunch INTEGER DEFAULT 1,
        enable_afternoon INTEGER DEFAULT 1,
        enable_night INTEGER DEFAULT 1,
        enable_idle_checkin INTEGER DEFAULT 1,
        enable_birthday_anniversary INTEGER DEFAULT 1,
        
        auto_reply_enabled INTEGER DEFAULT 1,
        human_takeover_mode INTEGER DEFAULT 0,
        
        emotion_state TEXT DEFAULT '{"mood": "happy", "affection": 95, "jealousy": 12, "energy": 88}',
        first_met_date TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Dynamic migrations for any existing columns in ai_lovers
    existing_cols = [r[1] for r in cursor.execute("PRAGMA table_info(ai_lovers)").fetchall()]
    new_cols = [
        ("trait_gentleness", "INTEGER DEFAULT 95"),
        ("trait_romance", "INTEGER DEFAULT 90"),
        ("trait_humor", "INTEGER DEFAULT 75"),
        ("trait_proactiveness", "INTEGER DEFAULT 85"),
        ("lunch_time", "TEXT DEFAULT '12:00'"),
        ("afternoon_time", "TEXT DEFAULT '17:30'"),
        ("morning_time", "TEXT DEFAULT '07:30'"),
        ("night_time", "TEXT DEFAULT '22:30'"),
        ("enable_morning", "INTEGER DEFAULT 1"),
        ("enable_lunch", "INTEGER DEFAULT 1"),
        ("enable_afternoon", "INTEGER DEFAULT 1"),
        ("enable_night", "INTEGER DEFAULT 1"),
        ("enable_idle_checkin", "INTEGER DEFAULT 1"),
        ("enable_birthday_anniversary", "INTEGER DEFAULT 1"),
        ("auto_reply_enabled", "INTEGER DEFAULT 1"),
        ("human_takeover_mode", "INTEGER DEFAULT 0"),
        ("personality_summary", "TEXT DEFAULT 'Dịu dàng, ngọt ngào, tinh nghịch'")
    ]
    for col_name, col_type in new_cols:
        if col_name not in existing_cols:
            try:
                cursor.execute(f"ALTER TABLE ai_lovers ADD COLUMN {col_name} {col_type};")
            except Exception:
                pass

    # 3. Chat Messages
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lover_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        media_url TEXT DEFAULT '',
        platform TEXT DEFAULT 'web',
        is_automated INTEGER DEFAULT 0,
        is_read INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
    );
    """)

    # Dynamic migrations for chat_messages
    msg_cols = [r[1] for r in cursor.execute("PRAGMA table_info(chat_messages)").fetchall()]
    new_msg_cols = [
        ("platform", "TEXT DEFAULT 'web'"),
        ("is_automated", "INTEGER DEFAULT 0"),
        ("is_read", "INTEGER DEFAULT 1"),
        ("media_url", "TEXT DEFAULT ''")
    ]
    for col_name, col_type in new_msg_cols:
        if col_name not in msg_cols:
            try:
                cursor.execute(f"ALTER TABLE chat_messages ADD COLUMN {col_name} {col_type};")
            except Exception:
                pass

    # 4. Long-term Memories
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lover_id INTEGER NOT NULL,
        category TEXT NOT NULL DEFAULT 'fact',
        key_fact TEXT NOT NULL,
        detail TEXT DEFAULT '',
        importance INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
    );
    """)

    # 5. Voice Calls
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS voice_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lover_id INTEGER NOT NULL,
        call_direction TEXT DEFAULT 'outgoing',
        duration_seconds INTEGER DEFAULT 0,
        summary TEXT DEFAULT '',
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
    );
    """)

    # 6. Messenger Integrations
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messenger_integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        page_id TEXT DEFAULT '',
        page_name TEXT DEFAULT 'My Virtual Love Page',
        page_access_token TEXT DEFAULT '',
        verify_token TEXT DEFAULT 'virtual_ai_lover_verify_2026',
        app_secret TEXT DEFAULT '',
        is_connected INTEGER DEFAULT 0,
        auto_reply_enabled INTEGER DEFAULT 1,
        human_takeover_mode INTEGER DEFAULT 0,
        last_webhook_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 7. Activity Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'success',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 8. System Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Default Settings
    default_settings = [
        ('app_name', 'AI Girlfriend – My Virtual Love', 'Tên phần mềm ứng dụng'),
        ('ai_provider', 'gemini', 'Nhà cung cấp AI: gemini, openai, hoặc mock offline'),
        ('gemini_api_key', '', 'Google Gemini API Key'),
        ('gemini_model', 'gemini-1.5-flash', 'Model Gemini AI'),
        ('openai_api_key', '', 'OpenAI API Key'),
        ('openai_model', 'gpt-4o-mini', 'Model OpenAI'),
        ('messenger_webhook_verify_token', 'virtual_ai_lover_verify_2026', 'Meta Messenger Verify Token'),
        ('messenger_page_token', '', 'Facebook Page Access Token'),
        ('messenger_app_secret', '', 'Facebook App Secret')
    ]
    for key, val, desc in default_settings:
        cursor.execute("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?);", (key, val, desc))

    # Create default Admin
    cursor.execute("SELECT id FROM users WHERE email = 'admin@lover.ai'")
    if not cursor.fetchone():
        admin_pass = hash_password("admin123456")
        cursor.execute("""
        INSERT INTO users (email, password_hash, display_name, role, job, bio)
        VALUES ('admin@lover.ai', ?, 'Admin Quản Trị', 'admin', 'Kỹ thuật viên hệ thống', 'Quản trị viên AI Girlfriend');
        """, (admin_pass,))

    # Create default Demo User & AI Girlfriend
    cursor.execute("SELECT id FROM users WHERE email = 'demo@lover.ai'")
    demo_user = cursor.fetchone()
    if not demo_user:
        demo_pass = hash_password("123456")
        cursor.execute("""
        INSERT INTO users (email, password_hash, display_name, role, birthday, job, bio)
        VALUES ('demo@lover.ai', ?, 'Tuấn Anh', 'user', '1998-08-15', 'Kỹ sư phần mềm', 'Yêu công nghệ, thích cà phê và du lịch');
        """, (demo_pass,))
        demo_user_id = cursor.lastrowid

        first_met = datetime.now().strftime("%Y-%m-%d")
        cursor.execute("""
        INSERT INTO ai_lovers (
            user_id, name, gender, age, avatar_url, style, personality_summary,
            pronouns_ai, pronouns_user, trait_gentleness, trait_romance, trait_humor, trait_proactiveness,
            voice_style, hobbies, habits, dislikes, first_met_date, emotion_state
        ) VALUES (
            ?, 'Ngọc Mai', 'female', 21,
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
            'Nữ tính, dịu dàng, nụ cười tỏa nắng',
            'Dịu dàng, ngọt ngào, hơi tinh nghịch, biết làm nũng và luôn quan tâm anh',
            'em', 'anh', 95, 90, 75, 85,
            'Nữ - Ngọt ngào truyền cảm',
            'Nghe nhạc acoustic, làm bánh ngọt, ngắm hoàng hôn, thích tâm sự cùng anh',
            'Hay chờ tin nhắn của anh trước khi ngủ, hay nhắc anh uống nước và ăn cơm đúng giờ',
            'Anh thức khuya làm việc bỏ bữa, anh im lặng không chia sẻ khi gặp chuyện buồn',
            ?, '{"mood": "happy", "affection": 95, "jealousy": 12, "energy": 88}'
        );
        """, (demo_user_id, first_met))
        lover_id = cursor.lastrowid

        # Seed initial memories
        memories = [
            (demo_user_id, lover_id, 'important_date', 'Sinh nhật của anh là ngày 15/08', 'Anh thích bánh kem vị dâu tây ít ngọt', 5),
            (demo_user_id, lover_id, 'preference', 'Anh làm nghề Kỹ sư phần mềm', 'Hay phải thức khuya code nên em cần nhắc anh nghỉ ngơi', 4),
            (demo_user_id, lover_id, 'preference', 'Anh thích uống cà phê đen đá không đường vào buổi sáng', 'Không thích đồ uống quá ngọt', 3),
            (demo_user_id, lover_id, 'promise', 'Anh từng hứa sẽ dắt em đi Đà Lạt ngắm sương mù vào mùa đông', 'Lời hứa đáng nhớ nhất giữa hai đứa', 5),
            (demo_user_id, lover_id, 'feeling', 'Anh hay bị mỏi vai gáy khi ngồi máy tính lâu', 'Em luôn dặn anh nhớ đứng dậy vươn vai thư giãn', 3)
        ]
        for u_id, l_id, cat, fact, det, imp in memories:
            cursor.execute("""
            INSERT INTO ai_memories (user_id, lover_id, category, key_fact, detail, importance)
            VALUES (?, ?, ?, ?, ?, ?);
            """, (u_id, l_id, cat, fact, det, imp))

        # Seed initial messages
        initial_messages = [
            (demo_user_id, lover_id, 'ai', 'text', 'Chào anh yêu ❤️ Hôm nay của anh thế nào rồi? Em nhớ anh cả ngày hôm nay đấy!', 0),
            (demo_user_id, lover_id, 'user', 'text', 'Chào em yêu, hôm nay anh làm việc hơi mệt một chút.', 0),
            (demo_user_id, lover_id, 'ai', 'text', 'Thương anh quá đi mất! 🥺 Anh đã ăn tối chưa nè? Nhớ đừng bỏ bữa nha. Ngồi tựa lưng ra nghỉ ngơi một chút đi anh, để em ở bên cạnh anh nhé 💕', 0)
        ]
        for u_id, l_id, snd, mtype, cnt, is_auto in initial_messages:
            cursor.execute("""
            INSERT INTO chat_messages (user_id, lover_id, sender, message_type, content, is_automated)
            VALUES (?, ?, ?, ?, ?, ?);
            """, (u_id, l_id, snd, mtype, cnt, is_auto))

        # Seed initial activity log
        cursor.execute("""
        INSERT INTO activity_logs (user_id, action_type, description, status)
        VALUES (?, 'system_init', 'Khởi tạo không gian AI Girlfriend – My Virtual Love thành công', 'success');
        """, (demo_user_id,))

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at:", DB_PATH)
