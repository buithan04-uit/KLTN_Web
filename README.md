# 🩺 IoT Telehealth System

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Backend-Node.js%20%2F%20Express-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="Next.js" src="https://img.shields.io/badge/Frontend-Next.js%2016-000000?style=for-the-badge&logo=next.js&logoColor=white">
  <img alt="TimescaleDB" src="https://img.shields.io/badge/Database-TimescaleDB-336791?style=for-the-badge&logo=postgresql&logoColor=white">
  <img alt="MQTT" src="https://img.shields.io/badge/MQTT-Mosquitto-3c5280?style=for-the-badge">
  <img alt="AI" src="https://img.shields.io/badge/AI-TensorFlow.js-ff6f00?style=for-the-badge&logo=tensorflow&logoColor=white">
</p>

Hệ thống Telehealth IoT dùng để thu thập, lưu trữ, phân tích và hiển thị dữ liệu sức khỏe từ thiết bị ESP32. Thiết bị gửi sinh hiệu qua MQTT, backend Node.js xử lý/lưu dữ liệu vào TimescaleDB, frontend Next.js hiển thị dashboard realtime cho bệnh nhân, bác sĩ và quản trị viên.

> Dự án phục vụ mục đích nghiên cứu và phát triển.

## 🎯 Mục tiêu dự án

Dự án mô phỏng một nền tảng theo dõi sức khỏe từ xa gồm thiết bị đo, broker nhận dữ liệu, API server, cơ sở dữ liệu chuỗi thời gian, dashboard realtime và lớp AI hỗ trợ phân tích. Hệ thống không chỉ hiển thị số đo tức thời, mà còn quản lý thiết bị, phân quyền người dùng, phiên đồng thuận chia sẻ dữ liệu cho bác sĩ, lịch sử đo, cảnh báo bất thường, audit log và kết quả AI có dữ liệu đầu vào để đối chiếu.

## 🧩 Thành phần hệ thống

| Icon | Thành phần | Thư mục / service | Công nghệ | Vai trò |
| --- | --- | --- | --- | --- |
| 🖥️ | Web dashboard | `frontend/` | Next.js 16, React 19, TypeScript, Tailwind CSS, Recharts | Giao diện cho bệnh nhân, bác sĩ và admin. |
| ⚙️ | API backend | `backend/` | Node.js, Express 5, Socket.IO | REST API, auth, role, realtime, MQTT runtime, AI inference. |
| 📡 | MQTT broker | `mosquitto/` | Eclipse Mosquitto | Nhận dữ liệu từ ESP32 qua topic `vitals/<device_id>/data`. |
| 🗄️ | Database | `database/` | TimescaleDB/PostgreSQL | Lưu users, devices, health data, consent sessions, audit logs, AI predictions. |
| 🧠 | AI service | `backend/src/ai/` | TensorFlow.js | Dự đoán risk theo sinh hiệu và phân loại ECG arrhythmia. |
| 🐳 | Runtime stack | `docker-compose.yml` | Docker Compose | Chạy DB, MQTT, Adminer, backend và frontend local. |

## 🔄 Kiến trúc luồng dữ liệu

```text
ESP32 firmware
  -> MQTT publish: vitals/<device_id>/data
  -> Mosquitto broker
  -> Backend MQTT subscriber
  -> Normalize + validate payload
  -> Kiểm tra device tồn tại và đang active
  -> Insert health_data vào TimescaleDB
  -> Cập nhật devices.last_seen_at/status
  -> Socket.IO emit realtime data + device status
  -> Tự chạy AI nếu đủ điều kiện dữ liệu
  -> Frontend dashboard hiển thị realtime/history/AI
```

## 📁 Cấu trúc thư mục

```text
KLTN/
├── backend/                 # Node.js/Express API, Socket.IO, MQTT, AI, migrations
├── frontend/                # Next.js App Router dashboard
├── database/
│   ├── init.sql             # Schema TimescaleDB/PostgreSQL khi chạy Docker lần đầu
│   └── seeds/               # Dữ liệu demo/test flow
├── mosquitto/               # Cấu hình MQTT broker
├── docker-compose.yml       # Stack local/dev
├── docker-compose.prod.yml  # Stack production tham khảo
├── .env.example             # Biến môi trường tổng cho deploy
└── README.md                # File này
```

## 👥 Vai trò người dùng

| Role | Khả năng chính |
| --- | --- |
| `patient` | Liên kết thiết bị, xem dashboard thiết bị của mình, tạo mã đồng thuận 6 số, xem/thu hồi phiên bác sĩ đang truy cập, cập nhật hồ sơ. |
| `doctor` | Nhập mã đồng thuận của bệnh nhân, mở phiên monitor tạm thời, xem realtime/history/trends/AI của thiết bị được cấp quyền. |
| `admin` | Quản lý người dùng, thiết bị, trạng thái active, owner thiết bị, xem audit logs, overview hệ thống và truy cập dữ liệu vận hành. |

## 🐳 Chạy nhanh bằng Docker Compose

Yêu cầu: Docker Desktop hoặc Docker Engine.

```bash
docker compose up --build
```

Các service local mặc định:

| Service | URL / Port | Ghi chú |
| --- | --- | --- |
| Frontend | `http://localhost:3001` | Dashboard Next.js. |
| Backend API | `http://localhost:5000` | Express API + Socket.IO. |
| Swagger | `http://localhost:5000/api-docs` | API docs sinh từ backend. |
| Adminer | `http://localhost:8080` | Xem database. |
| PostgreSQL/TimescaleDB | `localhost:5432` | User `admin`, DB `telehealth_system` theo compose local. |
| MQTT | `localhost:1883` | Broker nhận dữ liệu ESP32. |

Sau khi DB đã chạy, có thể seed dữ liệu demo:

```bash
cd backend
npm install
npm run seed
```

## 🔐 Tài khoản demo sau khi seed

| Role | Email | Password | Ghi chú |
| --- | --- | --- | --- |
| Admin | `admin01@telehealth.test` | `Admin@123` | Quản lý user/device/audit/system. |
| Doctor | `doctor01@telehealth.test` | `Doctor@123` | Có dữ liệu demo và active consent sessions. |
| Doctor | `doctor02@telehealth.test` | `Doctor@123` | Dùng kiểm tra flow phiên đã revoke/expired. |
| Patient | `patient01@telehealth.test` | `Patient@123` | Có thiết bị `DEV_01`, `DEV_02`, `DEV_06`. |
| Patient | `patient02@telehealth.test` | `Patient@123` | Có thiết bị `DEV_03`. |

Một số mã đồng thuận seed sẵn: `123456` cho `DEV_01`, `654321` cho `DEV_03`, `333444` cho `DEV_05`, `777888` cho `DEV_06`. Mã có TTL trong seed nên nếu hết hạn, đăng nhập patient và tạo mã mới ở Privacy Center.

## 🛠️ Chạy thủ công khi phát triển

Chạy hạ tầng DB + MQTT bằng Docker:

```bash
docker compose up db mosquitto adminer
```

Backend:

```bash
cd backend
npm install
copy .env.example .env
npm run migrate:up
npm run seed
npm run dev
```

Frontend:

```bash
cd frontend
npm install
echo NEXT_PUBLIC_API_URL=http://localhost:5000 > .env.local
npm run dev
```

## 📡 MQTT payload từ thiết bị

Backend subscribe mặc định topic:

```text
vitals/+/data
```

Topic thực tế nên có dạng:

```text
vitals/DEV_01/data
```

Payload JSON được backend hỗ trợ:

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

Backend sẽ kiểm tra:

- `device_id` trong topic và payload không được lệch nhau.
- Thiết bị phải tồn tại trong bảng `devices` và `is_active = true`.
- Giá trị ngoài khoảng hợp lệ bị chuyển thành `null`: HR `20-250`, SpO2 `50-100`, nhiệt độ `25-45`, ECG `-5..5`, huyết áp/MAP theo range trong backend.
- Nếu không có trường sinh hiệu hợp lệ, message bị bỏ qua.

## 🧭 Các flow chính

| Flow | Mô tả |
| --- | --- |
| Đăng ký/đăng nhập | User đăng ký theo role, login nhận JWT, frontend lưu token trong `localStorage`. |
| Quản lý thiết bị | Admin tạo thiết bị chưa có owner; patient/doctor/admin có thể claim thiết bị hợp lệ; owner xem thiết bị của mình. |
| Nhận dữ liệu realtime | MQTT message hợp lệ được lưu DB, sau đó emit qua Socket.IO channel `realtime-<device_id>` và room `device:<device_id>`. |
| Consent monitor | Patient tạo mã 6 số; doctor/admin verify mã để nhận `consent_session_token`; các API doctor phải gửi header `x-consent-session-token`. |
| Dashboard bệnh nhân | Hiển thị thiết bị của user, HR/SpO2/nhiệt độ/ECG, bảng bản ghi, tổng hợp AI. |
| Doctor Monitor | Bác sĩ nhập mã đồng thuận, xem nhiều phiên, realtime, trend 24h, clinical summary, AI summary và event log. |
| AI diagnosis | Xem lịch sử kết quả AI kèm dữ liệu đầu vào để đối chiếu. |
| Admin system | Quản lý user/device, audit logs, overview MQTT/server/database. |

## 🔌 API chính

| Nhóm | Endpoint | Mục đích |
| --- | --- | --- |
| Auth | `POST /api/auth/register` | Tạo tài khoản. |
| Auth | `POST /api/auth/login` | Đăng nhập, nhận JWT. |
| Auth | `POST /api/auth/forgot-password` | Gửi yêu cầu reset mật khẩu qua email. |
| Profile | `GET /api/profile` | Lấy hồ sơ user hiện tại. |
| Profile | `PUT /api/profile` | Cập nhật hồ sơ. |
| Profile | `POST /api/profile/avatar` | Upload avatar. |
| Devices | `GET /api/devices/my` | Thiết bị thuộc user hiện tại. |
| Devices | `GET /api/devices/available` | Thiết bị chưa có owner. |
| Devices | `POST /api/devices/register` | Claim hoặc tạo thiết bị tùy role. |
| Health | `GET /api/health/history/:deviceId` | Lịch sử sinh hiệu. |
| Health | `GET /api/health/trends/:deviceId` | Trend bucket theo thời gian. |
| Health | `GET /api/health/clinical-summary/:deviceId` | Tóm tắt lâm sàng/rule-based. |
| Consent | `POST /api/consent/codes` | Patient tạo mã đồng thuận. |
| Consent | `POST /api/consent/verify` | Doctor/admin verify mã để lấy session token. |
| AI | `GET /api/ai/status` | Trạng thái model AI. |
| AI | `POST /api/ai/predict/latest/:deviceId` | Chạy AI trên bản ghi mới nhất. |
| AI | `GET /api/ai/predictions/:deviceId` | Lịch sử kết quả AI. |
| Admin | `GET /api/admin/system/overview` | Tổng quan hệ thống. |
| Admin | `GET /api/admin/system/audit-logs` | Audit logs. |
| Admin | `GET /api/admin/users` | Quản lý user. |

## 🗄️ Database chính

| Bảng | Nội dung |
| --- | --- |
| `users` | Tài khoản, role, thông tin hồ sơ patient/doctor/admin. |
| `devices` | Thiết bị, owner, status, firmware, `last_seen_at`, active flag. |
| `health_data` | Hypertable TimescaleDB lưu HR, SpO2, nhiệt độ, ECG, BP/MAP, session, abnormal flag. |
| `access_codes` | Mã đồng thuận 6 số do patient tạo. |
| `doctor_access_sessions` | Phiên bác sĩ truy cập dữ liệu theo consent. |
| `audit_logs` | Log hành động consent/admin/system. |
| `ai_predictions` | Kết quả AI, confidence, probabilities, input snapshot. |

## 📚 README chi tiết

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)

## 🚫 Git ignore

Repo chỉ nên public các README chính:

- `README.md`
- `backend/README.md`
- `frontend/README.md`

Các tài liệu `.md` phụ, `.env`, `node_modules`, build output, database volume, MQTT log và upload runtime không nên commit.