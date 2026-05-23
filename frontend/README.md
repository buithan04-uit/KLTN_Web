# 🖥️ Frontend - IoT Telehealth Dashboard

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.1.6-000000?style=for-the-badge&logo=next.js&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19.2.3-61dafb?style=for-the-badge&logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="Recharts" src="https://img.shields.io/badge/Charts-Recharts-ff6384?style=for-the-badge">
</p>

Frontend Next.js App Router cho hệ thống Telehealth IoT. Ứng dụng cung cấp màn hình đăng nhập/đăng ký, dashboard sinh hiệu realtime, quản lý thiết bị, privacy/consent center, doctor monitor, AI diagnosis, quản trị user/device và audit logs.

> Dự án phục vụ mục đích nghiên cứu và phát triển.

## 🧰 Stack kỹ thuật

| Nhóm | Công nghệ |
| --- | --- |
| Framework | Next.js 16 App Router |
| UI runtime | React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Icons | lucide-react |
| Data fetching | TanStack React Query |
| API client | Orval sinh client từ `openapi.json`, kết hợp custom clients trong `lib/api/*` |
| Realtime | socket.io-client |
| Charts | Recharts |

## 📁 Cấu trúc thư mục

```text
frontend/
├── app/
│   ├── (auth)/                  # Login, register, forgot/reset password
│   ├── (dashboard)/             # Protected dashboard layout và pages
│   ├── globals.css
│   ├── layout.tsx
│   └── providers.tsx            # React Query/Auth providers
├── components/
│   ├── admin/                   # User form/table
│   ├── dashboard/               # DeviceBar và dashboard widgets
│   └── ui/                      # AuthCard, Alert, PasswordInput...
├── context/AuthContext.tsx      # Auth state qua localStorage + sync event
├── hooks/                       # Custom hooks
├── lib/
│   ├── api.ts                   # Manual API helpers cho auth/health/device
│   ├── api/                     # Custom clients: ai, consent, admin-users
│   ├── orval/                   # Generated OpenAPI client
│   └── types.ts                 # Shared frontend types
├── openapi.json                 # Spec dùng cho Orval
└── Dockerfile
```

## ▶️ Cài đặt local

Yêu cầu:

- Node.js 20+
- Backend chạy tại `http://localhost:5000`

```bash
npm install
```

Tạo `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Chạy dev server:

```bash
npm run dev
```

Mở: `http://localhost:3001`

## 📜 Scripts

| Lệnh | Mục đích |
| --- | --- |
| `npm run dev` | Chạy dev server ở port `3001`. |
| `npm run build` | Build production. |
| `npm run start` | Chạy production server ở port `3001`. |
| `npm run lint` | Chạy ESLint. |
| `npm run orval` | Sinh lại API client từ `openapi.json`. |

## 🔧 Biến môi trường

| Biến | Ví dụ | Ý nghĩa |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Base URL backend API và Socket.IO. |

Vì biến `NEXT_PUBLIC_*` được bake vào lúc build, khi deploy cần đặt đúng URL backend trước khi `npm run build` hoặc build Docker image.

## 🗺️ Route/pages hiện có

| URL | Role | File | Mục đích |
| --- | --- | --- | --- |
| `/` | Public | `app/page.tsx` | Trang vào app/redirect. |
| `/login` | Public | `app/(auth)/login/page.tsx` | Đăng nhập. |
| `/register` | Public | `app/(auth)/register/page.tsx` | Đăng ký. |
| `/forgot-password` | Public | `app/(auth)/forgot-password/page.tsx` | Gửi yêu cầu reset mật khẩu. |
| `/reset-password` | Public | `app/(auth)/reset-password/page.tsx` | Đổi mật khẩu bằng token. |
| `/dashboard` | All authenticated roles | `app/(dashboard)/dashboard/page.tsx` | Tổng quan sinh hiệu, realtime, ECG, bảng bản ghi, AI summary. |
| `/dashboard/abnormal` | Doctor/Admin | `app/(dashboard)/dashboard/abnormal/page.tsx` | Danh sách dữ liệu bất thường. |
| `/dashboard/devices` | Patient/Doctor | `app/(dashboard)/dashboard/devices/page.tsx` | Thiết bị của user, claim/unlink/update. |
| `/dashboard/ai-diagnosis` | Patient/Doctor | `app/(dashboard)/dashboard/ai-diagnosis/page.tsx` | Lịch sử kết quả AI kèm dữ liệu đối chiếu. |
| `/dashboard/privacy` | Patient | `app/(dashboard)/dashboard/privacy/page.tsx` | Tạo mã đồng thuận, xem/revoke phiên active. |
| `/dashboard/doctor-monitor` | Doctor/Admin | `app/(dashboard)/dashboard/doctor-monitor/page.tsx` | Nhập mã đồng thuận, monitor realtime, trends, clinical summary, AI. |
| `/dashboard/profile` | All authenticated roles | `app/(dashboard)/dashboard/profile/page.tsx` | Hồ sơ user, avatar, thông tin patient/doctor/admin. |
| `/dashboard/test` | Admin | `app/(dashboard)/dashboard/test/page.tsx` | Test runner cho flow nội bộ. |
| `/admin/users` | Admin | `app/(dashboard)/admin/users/page.tsx` | Quản lý user. |
| `/admin/devices` | Admin | `app/(dashboard)/admin/devices/page.tsx` | Quản lý thiết bị hệ thống. |
| `/admin/audit-logs` | Admin | `app/(dashboard)/admin/audit-logs/page.tsx` | Xem audit logs. |

## 🔐 Auth và route protection

`AuthContext` lưu `token` và `user` trong `localStorage`:

```text
localStorage.token
localStorage.user
```

Dashboard layout kiểm tra token ở client. Nếu chưa đăng nhập, user được chuyển về `/login`. Navigation được filter theo role trong `app/(dashboard)/layout.tsx`.

## 🔌 Kết nối API

| Client | File | Dùng cho |
| --- | --- | --- |
| Manual helper | `lib/api.ts` | Auth, một số health/device API cơ bản. |
| Consent client | `lib/api/consent.ts` | Tạo/verify/revoke consent code/session. |
| AI client | `lib/api/ai.ts` | AI status, summary, predictions. |
| Admin users client | `lib/api/admin-users.ts` | User admin operations. |
| Orval generated | `lib/orval/api.ts` | Client sinh từ `openapi.json` cho nhiều endpoint typed. |

Khi backend Swagger/OpenAPI thay đổi:

```bash
npm run orval
```

## ⚡ Realtime trong frontend

Frontend kết nối Socket.IO tới `NEXT_PUBLIC_API_URL`.

### 🧑‍⚕️ Dashboard bệnh nhân

`/dashboard` lắng nghe:

| Event | Ý nghĩa |
| --- | --- |
| `device-status-<device_id>` | Cập nhật online/offline. |
| `realtime-<device_id>` | Dữ liệu HR, SpO2, nhiệt độ, ECG mới. |

Dữ liệu realtime được merge với history API để tránh mất dữ liệu khi refresh interval chưa kịp chạy.

### 👨‍⚕️ Doctor Monitor

`/dashboard/doctor-monitor` dùng consent session token để subscribe room thiết bị. Flow chính:

1. Doctor nhập mã 6 số do patient cấp.
2. Frontend gọi `POST /api/consent/verify`.
3. Backend trả `session_token`, `session`, `patient_summary`.
4. Frontend lưu session vào `localStorage.consent_sessions_map`.
5. Socket.IO kết nối với consent token.
6. Doctor monitor subscribe device room, nhận realtime `vitals`, `device-status`, `ai-predictions`, `session-revoked`.

Các session hết hạn sẽ được frontend dọn định kỳ.

## 📊 Dashboard tổng quan

`/dashboard` hiển thị:

- Chọn thiết bị đang theo dõi.
- Trạng thái online/offline.
- Card nhịp tim, SpO2, nhiệt độ với threshold UI.
- ECG mini chart từ `ecg_points` hoặc `ecg_value`.
- Bảng bản ghi gần nhất.
- AI summary panel với trạng thái `normal`, `warning`, `danger`, `unknown`.
- Refresh history mỗi 15 giây, AI summary mỗi 30 giây.

Threshold UI hiện tại:

| Chỉ số | Normal range tham khảo trong UI |
| --- | --- |
| Heart rate | `60-100 bpm` |
| SpO2 | `95-100%` |
| Temperature | `36.1-37.2°C` |

## 👨‍⚕️ Doctor Monitor

Màn hình doctor monitor hỗ trợ:

- Nhiều consent session cùng lúc.
- Chế độ grid để xem nhiều bệnh nhân/thiết bị.
- Chế độ focus để xem chi tiết một thiết bị.
- Card realtime HR/SpO2/nhiệt độ.
- ECG realtime chart.
- Clinical summary 24h.
- Trend bucket từ API `/api/health/trends/:deviceId`.
- AI diagnosis summary.
- Event log realtime.
- Kết thúc/revoke phiên monitor.

Doctor muốn gọi API guarded by consent phải có session token. Frontend gửi token qua header:

```text
x-consent-session-token: <session_token>
```

## 🧠 AI Diagnosis

`/dashboard/ai-diagnosis` hiển thị prediction đã lưu trong DB:

- Lọc theo thiết bị.
- Lọc theo model `vitals-risk` hoặc `ecg-arrhythmia`.
- Với doctor, nếu chưa có phiên consent thì có form nhập mã 6 số ngay trong màn hình.
- Mỗi prediction hiển thị nhãn dễ hiểu, confidence, thời điểm, ID và dữ liệu đầu vào để đối chiếu.

Mapping ECG trong UI:

| Label | Cách hiển thị |
| --- | --- |
| `N` | Nhịp tim bình thường. |
| `S` | Nghi ngoại tâm thu trên thất. |
| `V` | Nghi ngoại tâm thu thất. |
| `F` | Nghi nhịp hợp nhất. |
| `Q` | Khác/không phân loại rõ. |

## 🛡️ Admin screens

| Màn hình | Chức năng |
| --- | --- |
| `/admin/users` | Tìm kiếm, lọc, tạo, sửa, vô hiệu hóa user, đổi role/status, reset password. |
| `/admin/devices` | Tạo thiết bị, list/filter devices, bật/tắt active, gán owner. |
| `/admin/audit-logs` | Xem log consent/admin/system theo action/role. |
| `/dashboard/test` | Chạy các test flow phục vụ debug demo. |

## 🐳 Build Docker

Frontend Dockerfile nhận build arg `NEXT_PUBLIC_API_URL`.

Chạy riêng frontend qua compose từ root:

```bash
docker compose up --build frontend
```

Khi đổi backend URL production, đặt biến trước khi build image:

```powershell
$env:NEXT_PUBLIC_API_URL="https://api.example.com"
docker compose -f docker-compose.prod.yml up --build frontend
```

## 🧯 Debug nhanh

| Triệu chứng | Kiểm tra |
| --- | --- |
| Login thành công nhưng dashboard quay về login | Kiểm tra `localStorage.token`, `localStorage.user`, lỗi hydration trong console. |
| API báo CORS | Kiểm tra backend `FRONTEND_URL` trùng origin frontend đang mở. |
| Dashboard không có thiết bị | User chưa claim device hoặc device bị inactive. Vào `/dashboard/devices` hoặc admin tạo/gán device. |
| Realtime không chạy | Kiểm tra `NEXT_PUBLIC_API_URL`, backend Socket.IO, MQTT có insert DB không. |
| Doctor Monitor 403 | Consent token hết hạn/revoked hoặc device không khớp session. Tạo mã mới ở Privacy Center. |
| AI Diagnosis không có data | Backend chưa lưu `ai_predictions`, thiếu feature để chạy AI hoặc chưa có health data đủ điều kiện. |
| Orval types sai | Cập nhật `openapi.json`, chạy `npm run orval`, kiểm tra import trong `lib/orval/api.ts`. |