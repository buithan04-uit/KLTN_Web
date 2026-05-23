# ⚙️ Backend - IoT Telehealth API

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-Express%205-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="Socket.IO" src="https://img.shields.io/badge/Realtime-Socket.IO-010101?style=for-the-badge&logo=socket.io&logoColor=white">
  <img alt="MQTT" src="https://img.shields.io/badge/MQTT-Subscriber-3c5280?style=for-the-badge">
  <img alt="TensorFlow" src="https://img.shields.io/badge/AI-TensorFlow.js-ff6f00?style=for-the-badge&logo=tensorflow&logoColor=white">
</p>

Backend Node.js/Express cho hệ thống Telehealth IoT. Service này chịu trách nhiệm xác thực người dùng, phân quyền theo role, quản lý thiết bị, nhận dữ liệu MQTT từ ESP32, lưu dữ liệu sinh hiệu vào TimescaleDB, phát realtime qua Socket.IO, quản lý consent session cho bác sĩ và chạy AI inference khi có dữ liệu hợp lệ.

> Dự án phục vụ mục đích nghiên cứu và phát triển.

## 🧰 Stack kỹ thuật

| Nhóm | Công nghệ |
| --- | --- |
| HTTP API | Node.js, Express 5 |
| Realtime | Socket.IO |
| MQTT | `mqtt` client, subscribe topic `vitals/+/data` |
| Database | PostgreSQL/TimescaleDB, `pg`, `node-pg-migrate` |
| Auth | JWT, bcryptjs, role middleware |
| Email | Nodemailer |
| Upload | Multer, static `/uploads` |
| API docs | Swagger UI tại `/api-docs` |
| AI | TensorFlow.js Node, local model files trong `src/ai/models` |

## 📁 Cấu trúc thư mục

```text
backend/
├── index.js                    # HTTP server, Socket.IO, MQTT init, offline watchdog
├── src/
│   ├── app.js                  # Express app, CORS, JSON, access log, Swagger, routes
│   ├── config/                 # DB pool, Socket.IO singleton, Swagger config
│   ├── controllers/            # HTTP handlers
│   ├── middlewares/            # auth, role, consent, validation
│   ├── models/                 # data access layer
│   ├── routes/                 # route definitions
│   ├── services/               # MQTT, MQTT runtime status, email
│   └── ai/                     # AI orchestration, preprocessing, TensorFlow loaders
├── migrations/                 # node-pg-migrate migrations
├── scripts/                    # seed, test flow, MQTT/debug utilities
├── uploads/                    # runtime avatar upload folder
├── Dockerfile
├── package.json
└── .env.example
```

## ▶️ Chạy local

Yêu cầu:

- Node.js 20+
- PostgreSQL/TimescaleDB đang chạy
- MQTT broker đang chạy

```bash
npm install
copy .env.example .env
npm run migrate:up
npm run seed
npm run dev
```

Server mặc định: `http://localhost:5000`

Swagger: `http://localhost:5000/api-docs`

## 📜 Scripts

| Lệnh | Mục đích |
| --- | --- |
| `npm run dev` | Chạy backend bằng nodemon. |
| `npm start` | Chạy server bằng `node index.js`. |
| `npm run migrate:up` | Chạy migration lên DB hiện tại. |
| `npm run migrate:down` | Rollback migration gần nhất. |
| `npm run migrate:create` | Tạo migration mới. |
| `npm run seed` | Nạp dữ liệu demo từ `database/seeds/001_full_test_data.sql`. |
| `npm run test:ai-web` | Test luồng AI/web alerts. |
| `npm run test:all` | Test các flow chính. |

## 🔧 Biến môi trường quan trọng

| Biến | Ví dụ | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `5000` | Cổng HTTP server. |
| `DATABASE_URL` | `postgres://admin:123456@localhost:5432/telehealth_system` | Chuỗi kết nối PostgreSQL/TimescaleDB. |
| `MQTT_BROKER` | `mqtt://localhost:1883` | Broker MQTT local hoặc cloud. |
| `MQTT_SUBSCRIBE_TOPIC` | `vitals/+/data` | Topic backend subscribe. |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | `server` / `...` | Credential MQTT cho backend. |
| `MQTT_DEVICE_USERNAME` / `MQTT_DEVICE_PASSWORD` | `device` / `...` | Credential gợi ý cho thiết bị/simulator. |
| `JWT_SECRET` | chuỗi random 32+ ký tự | Secret ký JWT và consent session token. |
| `FRONTEND_URL` | `http://localhost:3001` | Origin cho CORS và Socket.IO. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Gmail SMTP | Gửi email reset password/consent notification. |
| `DEVICE_OFFLINE_THRESHOLD_S` | `60` | Ngưỡng watchdog chuyển device offline. |
| `AI_MIN_INTERVAL_MS` | `30000` | Khoảng cách tối thiểu giữa hai lần AI auto-run cho cùng device. |

## 📡 MQTT ingest

Backend subscribe topic mặc định: `vitals/+/data`

Topic hợp lệ: `vitals/DEV_01/data`

Payload mẫu:

```json
{
  "device_id": "DEV_01",
  "hr": 78,
  "spo2": 97.5,
  "temp": 36.8,
  "ecg": 0.12,
  "ecg_points": [0.02, 0.04, 0.08, 0.03],
  "systolic_bp": 120,
  "diastolic_bp": 80,
  "session_id": "11111111-1111-1111-1111-111111111111"
}
```

Normalize logic trong `src/services/mqtt.service.js`:

| Field input | Field lưu DB | Rule |
| --- | --- | --- |
| `hr` | `heart_rate` | Number trong khoảng `20-250`. |
| `spo2` | `spo2` | Number trong khoảng `50-100`. |
| `temp` | `temperature` | Number trong khoảng `25-45`. |
| `ecg` | `ecg_value` | Number trong khoảng `-5..5`. |
| `ecg_points` | `ecg_points` | Array số, lấy tối đa 256 điểm. |
| `systolic_bp`, `systolic`, `sbp` | `systolic_bp` | Number trong khoảng `50-260`. |
| `diastolic_bp`, `diastolic`, `dbp` | `diastolic_bp` | Number trong khoảng `30-180`. |
| `map` hoặc `MAP` | `map` | Nếu thiếu thì derive từ huyết áp: `(SBP + 2*DBP) / 3`. |
| `session_id` | `session_id` | String/UUID để nhóm phiên đo. |

Nếu `device_id` trong topic khác payload, thiếu device ID, hoặc không có trường sinh hiệu hợp lệ, message bị bỏ qua. Nếu thiết bị chưa tồn tại trong bảng `devices` hoặc `is_active = false`, message cũng bị bỏ qua.

## ⚡ Realtime events

Sau khi insert dữ liệu thành công, backend emit:

| Event | Đối tượng nhận | Nội dung |
| --- | --- | --- |
| `realtime-<device_id>` | Channel tương thích frontend hiện tại | HR, SpO2, temp, ECG, BP/MAP, session, timestamp. |
| `vitals` trong room `device:<device_id>` | Doctor monitor có consent token | Payload realtime được bảo vệ theo room. |
| `device-status-<device_id>` | Dashboard chung | Online/offline. |
| `device-status` trong room `device:<device_id>` | Doctor monitor | Online/offline cho phiên đang xem. |
| `ai-predictions-<device_id>` | Dashboard | Kết quả AI mới. |
| `ai-predictions` trong room `device:<device_id>` | Doctor monitor | Kết quả AI mới theo consent. |
| `session-revoked` | Doctor monitor | Patient/admin/doctor thu hồi phiên. |

## 🔌 API routes

Tất cả endpoint nghiệp vụ nằm dưới `/api`.

### 🔐 Auth

| Method | Endpoint | Auth | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | No | Tạo user mới. Body gồm `email`, `password`, `role`, `full_name`, `phone`. |
| `POST` | `/api/auth/login` | No | Đăng nhập, trả JWT và user summary. Account bị khóa 15 phút nếu sai mật khẩu 5 lần. |
| `POST` | `/api/auth/forgot-password` | No | Tạo token reset và gửi email. |
| `POST` | `/api/auth/verify-reset-token` | No | Kiểm tra token reset. |
| `POST` | `/api/auth/reset-password` | No | Đổi mật khẩu bằng token reset. |

### 👤 Profile

| Method | Endpoint | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/profile` | Bearer JWT | Lấy hồ sơ user hiện tại. |
| `PUT` | `/api/profile` | Bearer JWT | Cập nhật profile cơ bản, patient fields, doctor fields tùy role/model. |
| `POST` | `/api/profile/avatar` | Bearer JWT | Upload avatar qua multipart field `avatar`. |

### 📟 Devices

| Method | Endpoint | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/devices/my?include_inactive=true` | Bearer JWT | Danh sách thiết bị thuộc user hiện tại. |
| `GET` | `/api/devices/available` | Bearer JWT | Thiết bị active chưa có owner. |
| `POST` | `/api/devices/register` | Bearer JWT | Claim thiết bị. Admin có thể tạo mới, non-admin chỉ claim device đã tồn tại. |
| `PATCH` | `/api/devices/:deviceId` | Bearer JWT | Cập nhật device của user; chỉ admin được sửa `name/type/firmware_version`. |
| `DELETE` | `/api/devices/:deviceId/unlink` | Bearer JWT | Gỡ owner khỏi thiết bị của user. |

### 🩺 Health

Doctor cần consent session token khi xem device của bệnh nhân. Token gửi bằng header:

```text
x-consent-session-token: <session_token>
```

| Method | Endpoint | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Health check backend. |
| `GET` | `/api/health/history/:deviceId?limit=50&since=...` | Bearer JWT + consent nếu doctor | Lịch sử đo mới nhất. |
| `GET` | `/api/health/session/:sessionId` | Bearer JWT + consent nếu doctor | Dữ liệu theo phiên đo. |
| `GET` | `/api/health/abnormal/:deviceId` | Admin/doctor | Bản ghi `is_abnormal = true`. |
| `GET` | `/api/health/trends/:deviceId?hours=24&bucket_minutes=15` | Bearer JWT + consent nếu doctor | Trend theo bucket TimescaleDB. |
| `GET` | `/api/health/clinical-summary/:deviceId?hours=24` | Admin/doctor | Latest + stats + rule-based clinical summary. |

### 🤝 Consent

| Method | Endpoint | Role | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/api/consent/codes` | Patient | Tạo mã 6 số cho một thiết bị active của patient. TTL mặc định 30 phút, tối đa 60 phút. |
| `GET` | `/api/consent/codes/active` | Patient | Danh sách mã đang active. |
| `GET` | `/api/consent/sessions/active` | Patient | Phiên bác sĩ đang có quyền truy cập. |
| `POST` | `/api/consent/verify` | Doctor/Admin | Verify mã, trả `session_token`, session và patient/device summary. |
| `POST` | `/api/consent/sessions/:sessionId/revoke` | Patient/Doctor/Admin | Thu hồi hoặc kết thúc phiên. |

### 🧠 AI

| Method | Endpoint | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/ai/status` | Bearer JWT | Trạng thái model, TensorFlow, file model còn thiếu. |
| `POST` | `/api/ai/predict/latest/:deviceId` | Bearer JWT + consent nếu doctor | Chạy AI trên bản ghi mới nhất và lưu kết quả. |
| `GET` | `/api/ai/summary/:deviceId?limit=30` | Bearer JWT + consent nếu doctor | Tổng hợp nhiều prediction gần đây thành trạng thái `normal/warning/danger/unknown`. |
| `GET` | `/api/ai/predictions/:deviceId?page=1&limit=20&model_name=...` | Bearer JWT + consent nếu doctor | Lịch sử prediction kèm input snapshot. |

### 🛡️ Admin

| Method | Endpoint | Role | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | Admin | List user, phân trang/lọc/tìm kiếm. |
| `POST` | `/api/admin/users` | Admin | Tạo user. |
| `GET` | `/api/admin/users/:id` | Admin | Chi tiết user. |
| `PUT` | `/api/admin/users/:id` | Admin | Cập nhật user. |
| `DELETE` | `/api/admin/users/:id` | Admin | Vô hiệu hóa user. |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Đổi role. |
| `PATCH` | `/api/admin/users/:id/status` | Admin | Bật/tắt tài khoản. |
| `POST` | `/api/admin/users/:id/reset-password` | Admin | Đặt lại mật khẩu tạm thời. |
| `GET` | `/api/admin/system/overview` | Admin | Tổng quan users/devices/vitals/consent/database/MQTT/server. |
| `GET` | `/api/admin/system/audit-logs` | Admin | Xem audit logs. |
| `POST` | `/api/admin/system/devices` | Admin | Tạo device chưa có owner. |
| `GET` | `/api/admin/system/devices` | Admin | List devices có filter status/search. |
| `PATCH` | `/api/admin/system/devices/:deviceId/active` | Admin | Bật/tắt device. |
| `PATCH` | `/api/admin/system/devices/:deviceId/owner` | Admin | Gán hoặc bỏ owner. |

## 🗄️ Database schema chính

| Bảng | Cột quan trọng | Mục đích |
| --- | --- | --- |
| `users` | `email`, `password`, `role`, `is_active`, profile fields | User auth và hồ sơ theo role. |
| `devices` | `device_id`, `owner_id`, `status`, `last_seen_at`, `is_active` | Quản lý thiết bị và online/offline. |
| `health_data` | `time`, `device_id`, `heart_rate`, `spo2`, `temperature`, `ecg_value`, `ecg_points`, `systolic_bp`, `diastolic_bp`, `map`, `session_id`, `is_abnormal` | Hypertable lưu sinh hiệu. |
| `access_codes` | `code`, `device_id`, `patient_id`, `expires_at`, `is_used`, `revoked_at` | Mã đồng thuận 6 số. |
| `doctor_access_sessions` | `session_id`, `doctor_id`, `patient_id`, `device_id`, `expires_at`, `revoked_at` | Phiên doctor monitor tạm thời. |
| `audit_logs` | `actor_id`, `actor_role`, `action`, `target_type`, `meta` | Truy vết thao tác nhạy cảm. |
| `ai_predictions` | `model_name`, `prediction_label`, `confidence`, `probabilities`, `input_snapshot` | Lưu kết quả AI. |

Ngoài bảng, `database/init.sql` có function `get_health_trends(device_id, hours, bucket_minutes)` dùng `time_bucket` của TimescaleDB.

## 🧠 AI service

| Model | Thư mục | Input cần có | Output |
| --- | --- | --- | --- |
| `vitals-risk` | `src/ai/models/vitals-risk` | SpO2, temperature, heart_rate, MAP hoặc systolic/diastolic BP, tuổi, cân nặng, chiều cao, BMI, gender | Nhãn rủi ro và confidence. |
| `ecg-arrhythmia` | `src/ai/models/ecg-arrhythmia` | `ecg_points` đủ window size theo metadata, mặc định cần khoảng 100+ điểm | Nhãn ECG như `N`, `S`, `V`, `F`, `Q` và confidence. |

AI tự chạy sau MQTT insert nếu device có owner, không có job cùng device đang chạy, không bị giới hạn bởi `AI_MIN_INTERVAL_MS`, dữ liệu mới hơn lần AI gần nhất, model file và TensorFlow.js khả dụng.

## 🌱 Seed data

`npm run seed` nạp users, devices, health data, access codes, doctor sessions và audit logs demo. Tài khoản chính:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin01@telehealth.test` | `Admin@123` |
| Doctor | `doctor01@telehealth.test` | `Doctor@123` |
| Patient | `patient01@telehealth.test` | `Patient@123` |

## 🧯 Debug nhanh

| Triệu chứng | Kiểm tra |
| --- | --- |
| Frontend không gọi được API | Kiểm tra `NEXT_PUBLIC_API_URL`, CORS `FRONTEND_URL`, backend port `5000`. |
| MQTT không có dữ liệu | Kiểm tra `MQTT_BROKER`, topic `vitals/<device_id>/data`, device tồn tại trong DB và active. |
| Device luôn offline | Kiểm tra `last_seen_at`, `DEVICE_OFFLINE_THRESHOLD_S`, MQTT insert có thành công không. |
| Doctor bị 403 khi xem dữ liệu | Kiểm tra header `x-consent-session-token`, token hết hạn/revoked, device_id có đúng session không. |
| AI không có kết quả | Gọi `/api/ai/status`, kiểm tra thiếu model file, thiếu feature profile hoặc thiếu `ecg_points`. |
| Reset password không gửi mail | Kiểm tra SMTP env và log backend. |