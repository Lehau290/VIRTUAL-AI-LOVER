-- ============================================================
-- VIRTUAL AI LOVER - DATABASE SCHEMA
-- Hệ thống cơ sở dữ liệu Người Yêu AI Ảo
-- Hỗ trợ SQLite, MySQL và PostgreSQL
-- ============================================================

-- 1. Bảng Người dùng (Users)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user', -- 'user' hoặc 'admin'
    avatar_url TEXT DEFAULT '',
    phone VARCHAR(30) DEFAULT '',
    birthday DATE DEFAULT NULL,
    job VARCHAR(100) DEFAULT '',
    bio TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng Nhân vật Người yêu AI (AI Lovers)
CREATE TABLE IF NOT EXISTS ai_lovers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    gender VARCHAR(20) NOT NULL DEFAULT 'female', -- 'female', 'male', 'other'
    age INTEGER NOT NULL DEFAULT 21,
    avatar_url TEXT NOT NULL,
    style VARCHAR(255) NOT NULL DEFAULT 'Ngọt ngào, thanh lịch, nụ cười tỏa nắng',
    personality TEXT NOT NULL DEFAULT 'Dịu dàng, chu đáo, biết quan tâm, đôi lúc giận dỗi đáng yêu',
    pronouns_ai VARCHAR(50) NOT NULL DEFAULT 'em', -- Cách người yêu xưng hô
    pronouns_user VARCHAR(50) NOT NULL DEFAULT 'anh', -- Cách người yêu gọi người dùng
    voice_style VARCHAR(100) NOT NULL DEFAULT 'Nữ - Ngọt ngào nhẹ nhàng',
    voice_rate REAL NOT NULL DEFAULT 1.0,
    voice_pitch REAL NOT NULL DEFAULT 1.1,
    hobbies TEXT NOT NULL DEFAULT 'Nghe nhạc acoustic, làm bánh ngọt, chụp ảnh phim, đi dạo lúc chiều tà',
    habits TEXT NOT NULL DEFAULT 'Luôn chờ tin nhắn trước khi đi ngủ, hay nhắc anh uống nước và ăn cơm đúng giờ',
    dislikes TEXT NOT NULL DEFAULT 'Anh thức khuya làm việc bỏ bữa, anh im lặng không trả lời tin nhắn',
    custom_instructions TEXT DEFAULT '',
    relationship_status VARCHAR(100) DEFAULT 'Đang yêu say đắm',
    first_met_date DATE DEFAULT CURRENT_DATE,
    proactive_mode VARCHAR(20) DEFAULT 'medium', -- 'off', 'low', 'medium', 'high'
    morning_greeting_time VARCHAR(10) DEFAULT '07:30',
    night_greeting_time VARCHAR(10) DEFAULT '22:30',
    enable_morning_msg INTEGER DEFAULT 1,
    enable_night_msg INTEGER DEFAULT 1,
    enable_random_care INTEGER DEFAULT 1,
    emotion_state TEXT DEFAULT '{"mood": "happy", "affection": 90, "jealousy": 10, "energy": 85}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Bảng Tin nhắn trò chuyện (Chat Messages)
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lover_id INTEGER NOT NULL,
    sender VARCHAR(20) NOT NULL, -- 'user', 'ai', 'system'
    message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text', 'image', 'sticker', 'audio'
    content TEXT NOT NULL,
    media_url TEXT DEFAULT '',
    emotion_detected VARCHAR(50) DEFAULT '',
    platform VARCHAR(20) DEFAULT 'web', -- 'web', 'messenger'
    is_read INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
);

-- 4. Bảng Ký ức dài hạn của AI (AI Long-term Memories)
CREATE TABLE IF NOT EXISTS ai_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lover_id INTEGER NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'fact', -- 'fact', 'preference', 'promise', 'important_date', 'feeling'
    key_fact TEXT NOT NULL,
    detail TEXT DEFAULT '',
    importance INTEGER DEFAULT 3, -- Thang điểm từ 1 đến 5
    source_message TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
);

-- 5. Bảng Nhật ký tình yêu (Love Diaries)
CREATE TABLE IF NOT EXISTS love_diaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lover_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    entry_date DATE NOT NULL,
    mood VARCHAR(50) DEFAULT 'Hạnh phúc',
    photo_url TEXT DEFAULT '',
    written_by VARCHAR(20) DEFAULT 'both', -- 'user', 'ai', 'both'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
);

-- 6. Bảng Album ảnh kỷ niệm (Photo Albums)
CREATE TABLE IF NOT EXISTS photo_albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lover_id INTEGER NOT NULL,
    caption VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    captured_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
);

-- 7. Bảng Lịch sử cuộc gọi thoại (Voice Calls)
CREATE TABLE IF NOT EXISTS voice_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lover_id INTEGER NOT NULL,
    call_direction VARCHAR(20) DEFAULT 'outgoing', -- 'incoming', 'outgoing'
    duration_seconds INTEGER DEFAULT 0,
    summary TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'completed', -- 'missed', 'completed', 'declined'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lover_id) REFERENCES ai_lovers(id) ON DELETE CASCADE
);

-- 8. Bảng Cấu hình kết nối Facebook Messenger (Messenger Integrations)
CREATE TABLE IF NOT EXISTS messenger_integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    page_id VARCHAR(100) DEFAULT '',
    page_access_token TEXT DEFAULT '',
    verify_token VARCHAR(255) DEFAULT 'virtual_ai_lover_verify_2026',
    app_secret VARCHAR(255) DEFAULT '',
    is_active INTEGER DEFAULT 0,
    is_simulated INTEGER DEFAULT 1,
    messenger_user_psid VARCHAR(100) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 9. Bảng Cài đặt hệ thống (System Settings)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TẠO CHỈ MỤC (INDEXES) TỐI ƯU HIỆU NĂNG TÌM KIẾM
CREATE INDEX IF NOT EXISTS idx_messages_user_lover ON chat_messages(user_id, lover_id);
CREATE INDEX IF NOT EXISTS idx_memories_lover ON ai_memories(lover_id, importance);
CREATE INDEX IF NOT EXISTS idx_diaries_user ON love_diaries(user_id, entry_date);
