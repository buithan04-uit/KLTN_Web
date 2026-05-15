# KLTN Telehealth - Tai Lieu Tong Hop Chi Tiet (Hien Trang Du An)

## 1. Muc tieu va pham vi he thong

Du an KLTN Telehealth la nen tang theo doi suc khoe IoT theo thoi gian thuc, ket hop:

- He thong thiet bi IoT gui du lieu sinh hieu (HR, SpO2, nhiet do, ECG)
- Backend API (Express + PostgreSQL/TimescaleDB)
- Frontend dashboard (Next.js)
- MQTT broker de nhan stream du lieu
- Co che privacy theo consent code/session cho doctor truy cap du lieu patient

### 3 vai tro chinh

- Patient:
  - Quan ly profile
  - Quan ly thiet bi cua minh
  - Tao/quan ly consent code
  - Theo doi ai dang truy cap du lieu va revoke session
- Doctor:
  - Verify consent code
  - Nhan consent session token tam thoi
  - Xem du lieu clinical theo thiet bi duoc cap quyen
- Admin:
  - Quan ly users
  - Quan ly system devices
  - Xem overview/audit logs
  - Reset password users

---

## 2. Kien truc tong the

## 2.1 Kien truc service

Du an dang chay theo docker-compose gom 5 service:

1. db: TimescaleDB (PG15)
2. mosquitto: MQTT broker
3. adminer: DB GUI
4. backend: Node.js/Express API
5. frontend: Next.js app

Thong tin ports:

- Backend: 5000
- Frontend: 3001
- DB: 5432
- MQTT: 1883
- Adminer: 8080

## 2.2 Luong du lieu runtime

1. Thiet bi publish du lieu vao MQTT topic `vitals/{deviceId}/data`
2. Backend MQTT service subscribe `vitals/+/data`
3. Backend validate device + persist vao `health_data`
4. Backend cap nhat `last_seen_at` va status device
5. Backend emit realtime event qua Socket.io
6. Frontend dashboards nhan event va render

## 2.3 Luong consent-gated cho doctor

1. Patient tao access code
2. Doctor verify code -> backend cap `consent_session token`
3. Doctor goi API health co middleware consent check
4. Socket subscribe room `device:{device_id}` can consent token hop le

---

## 3. Cau truc thu muc chinh

- `backend/`: API server, business logic, MQTT integration, auth, consent, admin
- `frontend/`: Next.js dashboard, API client layer, visual test runner
- `database/`: SQL init + migrations + seeds
- `mosquitto/`: broker config, ACL, passwd
- `docker-compose.yml`: orchestration local stack

---

## 4. Cong nghe va dependencies

## 4.1 Backend

- Node.js + Express 5
- JWT auth (`jsonwebtoken`)
- PostgreSQL driver (`pg`)
- Migrations (`node-pg-migrate`)
- MQTT client (`mqtt`)
- Socket.io server
- Swagger (`swagger-jsdoc`, `swagger-ui-express`)
- Upload avatar (`multer`)
- Email (`nodemailer`)

Scripts backend:

- `npm run dev`
- `npm run migrate:up`
- `npm run migrate:down`
- `npm run seed`
- `npm run test:all`

## 4.2 Frontend

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind 4
- React Query
- Recharts
- Socket.io client
- Orval (generate API clients)

Scripts frontend:

- `npm run dev` (port 3001)
- `npm run build`
- `npm run lint`
- `npm run orval`

---

## 5. Database design (hien tai)

## 5.1 Bang cot loi

- `users`
  - id, email, password, role, full_name, phone
  - is_active, is_verified
  - failed_login_attempts, locked_until
- `devices`
  - device_id, owner_id, status, last_seen_at, is_active
  - name, type, firmware_version
- `health_data` (Timescale hypertable)
  - time, device_id, heart_rate, spo2, temperature, ecg_value
  - session_id, is_abnormal, note
- `password_reset_tokens`
- `access_codes`
- `doctor_access_sessions`
- `audit_logs`

## 5.2 TimescaleDB

- `health_data` da duoc convert sang hypertable
- Co index theo `session_id`, `is_abnormal`

## 5.3 Privacy/consent schema

- `access_codes` duoc mo rong patient ownership va revoke metadata
- `doctor_access_sessions` quan ly phien truy cap tam thoi
- `audit_logs` theo doi hanh vi quan trong

---

## 6. Backend modules chi tiet

## 6.1 Entry points

- `backend/src/app.js`

  - CORS theo `FRONTEND_URL`
  - JSON middleware
  - Static uploads `/uploads`
  - Swagger `/api-docs`, `/api-docs.json`
  - mount router `/api`
- `backend/index.js`

  - Tao HTTP server + Socket.io
  - JWT verify consent token cho socket handshake
  - Event `subscribe-device` co consent validation
  - Start MQTT service
  - Device offline watchdog theo threshold

## 6.2 API route groups

Duoi prefix `/api`:

- `/auth`
  - register/login/forgot-password/verify-reset-token/reset-password
- `/profile`
  - get profile, update profile, upload avatar
- `/devices`
  - my devices, available devices, register, update, unlink
- `/health`
  - history, session, abnormal, trends, clinical-summary
- `/consent`
  - create/list code, verify, list/revoke sessions
- `/admin/users`
  - CRUD users + role/status/reset-password
- `/admin/system`
  - overview, audit-logs, devices list, set active, assign owner

## 6.3 Security va authorization

- Auth JWT cho API protected routes
- RBAC middleware cho admin/doctor constraints
- Consent middleware:
  - Admin bypass consent gate
  - Non-doctor bypass gate
  - Doctor bat buoc co `x-consent-session-token` hop le cho route nhay cam
- Socket consent gate tai handshake + subscribe-device event

## 6.4 MQTT integration

- Subscribe topic: `vitals/+/data`
- Parse topic + payload de xac dinh `device_id`
- Reject du lieu tu device chua dang ky hoac bi disable
- Persist vao DB + emit realtime events
- Emit:
  - `device-status-{device_id}`
  - room event `device-status` / `vitals` vao `device:{device_id}`
  - backward-compatible event `realtime-{device_id}`

## 6.5 Device online/offline state

- Online: khi nhan message MQTT
- Offline: watchdog update theo `DEVICE_OFFLINE_THRESHOLD_S`

---

## 7. Frontend modules chi tiet

## 7.1 App structure

- App Router voi nhom route `(auth)` va `(dashboard)`
- Dashboard pages theo role
- Shared components trong `components/`
- Context auth + hooks cho async/action

## 7.2 Dashboard domains

- Profile
- Devices
- Privacy (consent management)
- Doctor access
- Doctor monitor
- Abnormal/clinical analytics
- Admin users/system

## 7.3 API layer

- `lib/api.ts` + domain APIs
- `openapi.json` + `orval.config.ts` de maintain typed clients

## 7.4 Visual Test Runner page

File: `frontend/app/(dashboard)/dashboard/test/page.tsx`

Tinh nang chinh:

- Chia theo suites + test cases
- Auto auth lay 3 token (admin/doctor/patient)
- Run single test hoac run all
- Evaluate theo expect negative/positive + custom evaluator
- Hien thi status code, duration, response JSON
- Expand/collapse suite va case details

Noi dung test da duoc mo rong:

- Server/Auth/Profile/Devices/Health/Consent/Admin
- Integration chains
- RBAC detail cases
- Data shape checks
- QA extended checks

Hai case ownership da fix:

- Unlink not owned device: dung `DEV_03` -> expect 404
- Patient health history not owned: dung `DEV_03` -> expect 403

---

## 8. Consent workflow (chi tiet)

## 8.1 Patient

1. Tao code cho device so huu (`POST /api/consent/codes`)
2. Xem active codes (`GET /api/consent/codes/active`)
3. Xem active sessions (`GET /api/consent/sessions/active`)
4. Revoke session (`POST /api/consent/sessions/:sessionId/revoke`)

## 8.2 Doctor

1. Nhap code verify (`POST /api/consent/verify`)
2. Nhan `session_token`
3. Goi health APIs can consent token
4. Socket subscribe device room theo consent token

## 8.3 Backend enforcement

- Consent session co expiry/revocation check
- Device scope check
- Audit log cho hanh vi consent

---

## 9. Admin workflow (chi tiet)

## 9.1 User management

- List/search/filter users
- Get detail
- Create/update/deactivate
- Change role/status
- Reset password (temporary password)

## 9.2 System management

- Overview stats users/devices/vitals/database/server
- Audit logs (filter by action/actor_role)
- List devices
- Toggle device active
- Assign/unassign owner

---

## 10. Logging, observability, va van hanh local

## 10.1 Logs

- Backend console logs cho server, MQTT, watchdog
- Mosquitto logs trong `mosquitto/log/`

## 10.2 Local startup (goi y)

1. Start stack: `docker compose up -d`
2. Backend standalone: `cd backend && npm run dev`
3. Frontend standalone: `cd frontend && npm run dev`

## 10.3 MQTT auth incident (da xu ly)

Issue gap phai:

- `MQTT error: Connection refused: Not authorized`

Nguyen nhan:

- `mosquitto/config/passwd` rong

Da xu ly:

- Tao user `server` khop env backend
- Restart broker
- Test publish co CONNACK code 0

---

## 11. Bao mat va hardening da co

- JWT auth
- Login failed-attempt lockout
- Role-based access cho route quan tri/clinical
- Consent-token guard cho doctor access route/socket
- Soft delete user thay vi hard delete
- Device ownership check cho patient routes

---

## 12. Risk hien tai / diem can tiep tuc

1. Test idempotency

- Mot so test mutate data (toggle/reset) can reset state de chay lap lai on dinh

2. Data consistency cho test seed

- Can bo bo test fixture co deterministic setup/teardown

3. Security hardening nang cao

- Rate limit, structured audit pipeline, secret rotation policy

4. Production readiness

- Env separation, centralized logs, health checks, backup policy

5. API contract governance

- Dong bo OpenAPI <-> controllers thong qua CI check

---

## 13. Danh sach endpoint nhanh (tham chieu)

## Auth

- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/forgot-password`
- POST `/api/auth/verify-reset-token`
- POST `/api/auth/reset-password`

## Profile

- GET `/api/profile`
- PUT `/api/profile`
- POST `/api/profile/avatar`

## Devices

- GET `/api/devices/my`
- GET `/api/devices/available`
- POST `/api/devices/register`
- PATCH `/api/devices/:deviceId`
- DELETE `/api/devices/:deviceId/unlink`

## Health

- GET `/api/health/history/:deviceId`
- GET `/api/health/session/:sessionId`
- GET `/api/health/abnormal/:deviceId`
- GET `/api/health/trends/:deviceId`
- GET `/api/health/clinical-summary/:deviceId`

## Consent

- POST `/api/consent/codes`
- GET `/api/consent/codes/active`
- POST `/api/consent/verify`
- GET `/api/consent/sessions/active`
- POST `/api/consent/sessions/:sessionId/revoke`

## Admin users

- GET `/api/admin/users`
- GET `/api/admin/users/:id`
- POST `/api/admin/users`
- PUT `/api/admin/users/:id`
- DELETE `/api/admin/users/:id`
- PATCH `/api/admin/users/:id/role`
- PATCH `/api/admin/users/:id/status`
- POST `/api/admin/users/:id/reset-password`

## Admin system

- GET `/api/admin/system/overview`
- GET `/api/admin/system/audit-logs`
- GET `/api/admin/system/devices`
- PATCH `/api/admin/system/devices/:deviceId/active`
- PATCH `/api/admin/system/devices/:deviceId/owner`

---

## 14. Ket luan

He thong hien tai da dat duoc bo khung production-like cho mot nen tang telehealth IoT:

- Luong du lieu realtime hoan chinh
- Consent-based privacy gate cho doctor
- Admin governance cho users/devices/system
- Frontend dashboard va visual test runner duoc mo rong manh

Trang thai tong quan: du an da o muc cao ve tinh nang cot loi, co the tiep tuc sang hardening, test automation on dinh, va chuan bi deployment production.
