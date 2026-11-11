-- ============================================================
-- AI GIRLFRIEND – MY VIRTUAL LOVE
-- Database Schema for Relational Data (SQLite, MySQL, PostgreSQL)
-- ============================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    birthday DATE DEFAULT NULL,
    job VARCHAR(100) DEFAULT '',
    bio TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. AI Girlfriend Character Table
CREATE TABLE IF NOT EXISTS ai_lovers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL DEFAULT 'Ngọc Mai',
    gender VARCHAR(20) NOT NULL DEFAULT 'female',
    age INTEGER NOT NULL DEFAULT 21,
    avatar_url TEXT NOT NULL,
    style VARCHAR(255) NOT NULL DEFAULT 'Nữ tính, dịu dàng, nụ cười tỏa nắng',
    personality_summary TEXT NOT NULL DEFAULT 'Dịu dàng, ngọt ngào, hơi tinh nghịch, biết làm nũng và luôn quan tâm anh',
    pronouns_ai VARCHAR(50) NOT NULL DEFAULT 'em',
    pronouns_user VARCHAR(50) NOT NULL DEFAULT 'anh',
    
    -- Personality Sliders (1 to 100)
    trait_gentleness INTEGER NOT NULL DEFAULT 95,   -- Mức độ dịu dàng
    trait_romance INTEGER NOT NULL DEFAULT 90,      -- Mức độ lãng mạn
    trait_humor INTEGER NOT NULL DEFAULT 75,        -- Mức độ hài hước, tinh nghịch
    trait_proactiveness INTEGER NOT NULL DEFAULT 85, -- Mức độ chủ động nhắn tin
    
    -- Voice settings
    voice_style VARCHAR(100) NOT NULL DEFAULT 'Nữ - Ngọt ngào truyền cảm',
    voice_rate REAL NOT NULL DEFAULT 1.0,
    voice_pitch REAL NOT NULL DEFAULT 1.15,
    
    -- Daily habits & preferences
    hobbies TEXT NOT NULL DEFAULT 'Nghe nhạc acoustic, làm bánh ngọt, ngắm hoàng hôn, thích tâm sự cùng anh',
    habits TEXT NOT NULL DEFAULT 'Hay chờ tin nhắn của anh trước khi ngủ, thích nhắc anh uống nước và ăn cơm đúng giờ',
    dislikes TEXT NOT NULL DEFAULT 'Anh thức khuya làm việc bỏ bữa, anh im lặng không chia sẻ khi gặp chuyện buồn',
    
    -- Schedule timings
    morning_time VARCHAR(10) DEFAULT '07:30',
    lunch_time VARCHAR(10) DEFAULT '12:00',
    afternoon_time VARCHAR(10) DEFAULT '17:30',
    night_time VARCHAR(10) DEFAULT '22:30',
    
    -- Toggles
    enable_morning INTEGER DEFAULT 1,
    enable_lunch INTEGER DEFAULT 1,
    enable_afternoon INTEGER DEFAULT 1,
    enable_night INTEGER DEFAULT 1,
    enable_idle_checkin INTEGER DEFAULT 1,
    enable_birthday_anniversary INTEGER DEFAULT 1,
    
    -- Messenger control
    auto_reply_enabled INTEGER DEFAULT 1, -- Bật/Tắt trả lời tự động
    human_takeover_mode INTEGER DEFAULT 0, -- Chế độ chuyển cho người thật can thiệp
    
    -- Emotion state
    emotion_state TEXT DEFAULT '{"mood": "happy", "affection": 95, "jealousy": 12, "energy": 88}',
    first_met_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lover_id INTEGER NOT NULL,
    sender VARCHAR(20) NOT NULL, -- 'user', 'ai', 'human_admin', 'system'
    message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text', 'image', 'sticker', 'audio'
    content TEXT NOT NULL,
    media_url TEXT DEFAULT '',
    platform VARCHAR(20) DEFAULT 'web', -- 'web', 'messenger'
    is_automated INTEGER DEFAULT 0, -- 1 nếu do tiến trình chạy ngầm gửi
    is_read INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
);

-- 4. Long-term Memories Table
CREATE TABLE IF NOT EXISTS ai_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lover_id INTEGER NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'fact', -- 'fact', 'preference', 'promise', 'important_date', 'feeling'
    key_fact TEXT NOT NULL,
    detail TEXT DEFAULT '',
    importance INTEGER DEFAULT 3, -- 1 to 5
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
);

-- 5. Voice Call Sessions Table
CREATE TABLE IF NOT EXISTS voice_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lover_id INTEGER NOT NULL,
    call_direction VARCHAR(20) DEFAULT 'outgoing',
    duration_seconds INTEGER DEFAULT 0,
    summary TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
);

-- 6. Meta Messenger Integration Table
CREATE TABLE IF NOT EXISTS messenger_integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    page_id VARCHAR(100) DEFAULT '',
    page_name VARCHAR(100) DEFAULT 'My Virtual Love Page',
    page_access_token TEXT DEFAULT '',
    verify_token VARCHAR(255) DEFAULT 'virtual_ai_lover_verify_2026',
    app_secret VARCHAR(255) DEFAULT '',
    is_connected INTEGER DEFAULT 0,
    auto_reply_enabled INTEGER DEFAULT 1,
    human_takeover_mode INTEGER DEFAULT 0,
    last_webhook_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. Activity & Security Audit Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'auto_message', 'messenger_webhook', 'takeover_toggle', 'call_session', 'memory_stored'
    description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'success',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. System Configurations Table
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_messages_user_time ON chat_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON ai_memories(lover_id, importance);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id, created_at);
