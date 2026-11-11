# VIRTUAL AI LOVER – NGƯỜI YÊU AI ẢO 💕

<div align="center">

![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Meta](https://img.shields.io/badge/Meta-Messenger%20Platform-0084FF?style=for-the-badge&logo=messenger&logoColor=white)
![Gemini AI](https://img.shields.io/badge/AI-Google%20Gemini-8E75C0?style=for-the-badge&logo=google&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

<p align="center">
  <b>Hệ thống người yêu ảo thông minh, giàu cảm xúc, có trí nhớ dài hạn, biết quan tâm chăm sóc, gọi thoại hai chiều và kết nối Facebook Messenger.</b>
</p>

</div>

---

## 🌟 1. Điểm nổi bật của dự án

- **Giao diện hiện đại & lãng mạn:** Phong cách Glassmorphism tinh tế với bảng màu Hồng Pastel, Tím nhạt, Trắng và Đen sang trọng. Hỗ trợ đầy đủ **Chế độ Sáng / Tối (Dark & Light Mode)** và tối ưu Responsive trên Mobile, Tablet, Desktop.
- **Trí nhớ dài hạn (Long-term Memory Engine):** Tự động phát hiện và ghi nhớ ngày sinh, sở thích, những điều ghét, công việc, lời hứa và kỷ niệm giữa hai người vào cơ sở dữ liệu SQLite ACID.
- **Mô phỏng cảm xúc tự nhiên (Emotion Tracking):** Theo dõi mức độ yêu thương (*Affection*), nhớ nhung, giận dỗi (*Jealousy/Sulking*), năng lượng và tâm trạng (*Mood*) thay đổi theo ngữ cảnh hội thoại.
- **Phòng trò chuyện thời gian thực:** Nhắn tin Messenger-style, gửi ảnh, sticker/emoji lãng mạn, trạng thái đang soạn tin, phát âm thanh đọc tin nhắn (*Text-to-Speech*) bằng giọng nói ấm áp.
- **Gọi thoại hai chiều (Voice Call):** Giao diện cuộc gọi điện thoại chân thực, trực quan hóa sóng âm thanh (*Audio Visualizer*), đàm thoại rảnh tay liên tục (*Speech-to-Text vi-VN*) và AI phản hồi bằng giọng nói (*Text-to-Speech*).
- **Nhật ký & Album kỷ niệm:** Bộ đếm số ngày bên nhau (*Love Day Counter*), viết nhật ký theo ngày kèm ảnh và tâm trạng, album ảnh lưu giữ khoảnh khắc.
- **Kết nối Facebook Messenger:** Cung cấp Webhook endpoint chính thức theo chuẩn Meta Platform API, mã xác thực bảo mật HMAC-SHA256, đồng bộ tin nhắn hai chiều và tích hợp sẵn **Bộ Giả Lập Messenger Sandbox** để kiểm thử ngay mà không cần domain công khai.
- **Nhắn tin chủ động (Proactive Messaging Scheduler):** Tiến trình nền tự động gửi lời chúc buổi sáng (*Morning Greeting*), chúc ngủ ngon (*Night Goodnight*), nhắc nhở uống nước/ăn cơm trưa và chúc mừng sinh nhật, ngày kỷ niệm.
- **Trang Quản trị Admin:** Theo dõi số liệu người dùng, cuộc gọi, ký ức; cấu hình khóa Google Gemini API / OpenAI API / Prompt hệ thống.

---

## 🚀 2. Hướng dẫn khởi chạy nhanh

Dự án được xây dựng tối ưu để **chạy trực tiếp bằng thư viện chuẩn của Python** (không cần cài đặt thêm gói phức tạp).

### Khởi động Server:
```powershell
python server.py
```
Server sẽ tự động:
1. Khởi tạo cơ sở dữ liệu SQLite `lover.db` với dữ liệu mẫu hoàn chỉnh.
2. Khởi chạy tiến trình lập lịch nhắn tin chủ động `scheduler.py`.
3. Lắng nghe tại cổng `http://localhost:8080`.

### Mở trình duyệt:
Truy cập: [http://localhost:8080](http://localhost:8080)

---

## 🔑 3. Tài khoản có sẵn

| Vai trò | Email | Mật khẩu | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Người dùng Demo** | `demo@lover.ai` | `123456` | Đã có sẵn nhân vật người yêu *Mai Anh*, lịch sử chat và ký ức mẫu |
| **Quản trị viên (Admin)** | `admin@lover.ai` | `admin123456` | Có quyền truy cập tab **🛡️ Quản trị Admin** |

Bạn cũng có thể đăng ký tài khoản mới bất cứ lúc nào từ màn hình đăng nhập.

---

## 📑 4. Cấu trúc thư mục

```
d:\Web VIRTUAL AI LOVER\
├── server.py             # HTTP Server REST API, phục vụ Static Assets, xác thực Session
├── database.py           # Thiết kế bảng SQLite, mật khẩu PBKDF2 salt, migration & seed data
├── ai_engine.py          # Google Gemini API, OpenAI API & Bộ xử lý lãng mạn tiếng Việt
├── messenger.py          # Xử lý Webhook Facebook Messenger, Meta Graph API v19.0, Sandbox
├── scheduler.py          # Tiến trình nền gửi tin sáng/tối, sinh nhật, kỷ niệm
├── lover.db              # SQLite Database lưu trữ toàn bộ dữ liệu
├── static/
│   ├── index.html        # Khung SPA, tải Tailwind CSS & Google Fonts
│   ├── app.js            # Điều khiển giao diện SPA, Web Speech STT/TTS, gọi thoại, chat
│   └── styles.css        # Glassmorphism, hiệu ứng sóng âm thanh, hào quang avatar
└── README.md             # Tài liệu dự án
```

---

## ⚡ 5. Tích hợp Facebook Messenger

### Cấu hình trên Meta for Developers:
1. Truy cập [Meta for Developers](https://developers.facebook.com) và tạo một App loại **Business / Messenger**.
2. Thêm sản phẩm **Messenger** vào App.
3. Trong mục **Webhooks**:
   - **Callback URL:** `https://your-domain.com/api/messenger/webhook` (hoặc thông qua công cụ như Ngrok/Cloudflare Tunnel khi chạy local).
   - **Verify Token:** `virtual_ai_lover_verify_2026` (hoặc chuỗi bạn tự đặt trong Cài đặt).
   - Đăng ký nhận sự kiện `messages` và `messaging_postbacks`.
4. Trong mục **Access Tokens**: Tạo **Page Access Token** cho Fanpage của bạn và dán vào tab **Kết nối Messenger** trên website.

### Kiểm thử bằng Bộ Giả Lập Messenger Sandbox:
Ngay cả khi bạn chưa gắn domain công khai, bạn có thể vào tab **⚡ Kết nối Messenger** -> sử dụng mục **Bộ Giả Lập Messenger Sandbox** để gõ tin nhắn thử nghiệm và xem phản hồi tức thì của AI được đồng bộ vào phòng chat!

---

## 🤖 6. Cấu hình AI Gemini / OpenAI

1. Đăng nhập bằng tài khoản Admin: `admin@lover.ai` / `admin123456`.
2. Vào mục **🛡️ Quản trị Admin**.
3. Chọn nhà cung cấp:
   - **Google Gemini API:** Nhập API Key của bạn (từ Google AI Studio) và chọn model (ví dụ: `gemini-1.5-flash`).
   - **OpenAI Compatible:** Nhập API Key và model (ví dụ: `gpt-4o-mini`).
   - **Chế độ Giả lập Tinh vi (Offline):** Hoạt động 100% không cần API Key, tự động nhận diện cảm xúc, sự mệt mỏi, trêu đùa và ký ức tiếng Việt một cách ngọt ngào!
4. Nhấn **Lưu cấu hình AI & Hệ thống**.

---

## 🔒 7. Bảo mật và Quyền riêng tư

- Mật khẩu được mã hóa an toàn bằng thuật toán **PBKDF2-HMAC-SHA256** với muối ngẫu nhiên (*salt*).
- Không lưu trữ mật khẩu Facebook của người dùng; chỉ kết nối qua Token chính thức được Meta cấp phép.
- Cơ sở dữ liệu SQLite hỗ trợ chuẩn ACID, bảo vệ toàn vẹn lịch sử tâm sự và ký ức riêng tư của từng người dùng.
