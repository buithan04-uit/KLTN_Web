# KLTN Telehealth - Bao Cao Qua Trinh Thuc Hien va Tien Do

## 1. Tong quan muc tieu

Du an huong toi xay dung he thong theo doi suc khoe IoT theo thoi gian thuc, co 3 luong chinh:

- Patient: theo doi chi so song, quan ly quyen rieng tu.
- Doctor: truy cap du lieu benh nhan theo co che dong thuan (consent-based access).
- Admin: quan tri nguoi dung, thiet bi, va he thong.

Trong giai doan hien tai, nhom da tap trung vao 3 khoi chuc nang cot loi:

- Authentication + Profile management.
- Admin User Management.
- Nen tang API/OpenAPI/Frontend de mo rong tiep.

---

## 2. Tien do tong hop (hien tai)

| Hang muc                                         | Trang thai                      | Tien do uoc tinh |
| ------------------------------------------------ | ------------------------------- | ---------------: |
| Nen tang Backend (Express, JWT, DB)              | Hoan thanh                      |              90% |
| Profile (lay/cap nhat/upload avatar)             | Hoan thanh co fix bo sung       |              90% |
| Admin User Management API                        | Hoan thanh                      |              95% |
| OpenAPI cap nhat cho admin users                 | Da cap nhat                     |              85% |
| Frontend Admin Users Page + components           | Da tao ban dau                  |              75% |
| Consent-Based Access (Access code + session tam) | Hoan thanh E2E MVP              |              95% |
| Doctor Clinical View + Analytics                 | Da co trends + clinical summary |              80% |
| Admin System Health + Inventory nang cao         | Da co API device registry core  |              65% |
| Test E2E/Hardening/Bao mat nang cao              | Dang lam                        |              35% |

Tien do toan du an (uoc tinh): 91%

---

## 3. Qua trinh thuc hien chi tiet theo giai doan

## Giai doan A - Khao sat he thong hien co

### Muc tieu

- Kiem tra cau truc backend/frontend.
- Xac dinh cac endpoint da co va khoang trong chuc nang.

### Da thuc hien

- Khao sat routes backend (`auth`, `health`, `profile`) va mo hinh user.
- Kiem tra OpenAPI frontend de map endpoint.
- Xac nhan thieu module quan ly nguoi dung cho admin.

### Ket qua

- Xac dinh duoc backlog uu tien cao: Admin users CRUD + role/status/password reset.

---

## Giai doan B - Trien khai Admin User Management (Backend)

### Muc tieu

Xay dung bo API day du cho admin quan ly nguoi dung theo huong production-ready.

### Da thuc hien

1. Mo rong `UserModel`:

- `getAll()` co pagination + filter (search/role/status).
- `adminUpdate()` cap nhat thong tin user.
- `changeRole()` doi vai tro.
- `deleteById()` soft delete (deactivate).

2. Tao controller admin users:

- `listUsers`
- `getUserById`
- `createUser`
- `updateUser`
- `deleteUser`
- `changeRole`
- `changeStatus`
- `resetPassword`

3. Tao route admin users + middleware bao ve:

- `verifyToken`
- `requireRole('admin')`

4. Gan route vao `routes/index.js`:

- prefix: `/api/admin/users`

### Ket qua

- Hoan thanh 8 endpoint admin user management.
- Da xu ly loi path import middleware sai trong `routes/admin/users.routes.js`.

---

## Giai doan C - Tich hop Frontend cho Admin Users

### Muc tieu

Cho admin thao tac quan ly user tren giao dien.

### Da thuc hien

1. Cap nhat OpenAPI (`frontend/openapi.json`) them endpoint admin users.
2. Tao API layer frontend cho admin users (`frontend/lib/api/admin-users.ts`).
3. Tao trang quan ly user:

- `frontend/app/(dashboard)/admin/users/page.tsx`

4. Tao component:

- `frontend/components/admin/UserTable.tsx`
- `frontend/components/admin/UserForm.tsx`

### Ket qua

- Da co man hinh CRUD co ban cho admin.
- Da co search/filter/pagination/actions (edit, role, reset password, delete).

### Luu y

- Luong Orval tu dong can duoc soat lai de dong bo endpoint moi triet de.

---

## Giai doan D - Sua loi Profile Update

### Van de gap phai

- User cap nhat profile nhung ngay sinh va benh nen khong luu dung trong mot so truong hop.

### Nguyen nhan chinh

- Input/date va state dong bo frontend chua on dinh.
- Controller/model backend xu ly field mapping chua linh hoat voi cac kieu key.
- Query update profile can linh hoat hon de tranh bo qua update.

### Da sua

1. Backend controller (`profile.controller.js`):

- Nhan ca `snake_case` va `camelCase`.
- Chuan hoa gia tri rong (`''`) thanh `null` voi cac truong cho phep clear.
- Validate payload co du lieu truoc khi update.

2. Backend model (`user.model.js`):

- Chuyen sang dynamic update theo field duoc gui.
- Dam bao cap nhat `date_of_birth` va `underlying_conditions` dung logic.
- Van cap nhat `full_name` khi doi `first_name/last_name`.

3. Frontend profile page:

- Chuan hoa `date_of_birth` ve `YYYY-MM-DD` cho input type date.
- Dong bo lai form state khi profile refetch.
- Payload submit on dinh hon cho truong ngay sinh va benh nen.

### Ket qua

- Luong cap nhat profile on dinh hon cho ngay sinh va benh nen.

---

## Giai doan E - Van hanh va loi moi truong

### Da xu ly

- Loi `MODULE_NOT_FOUND` do sai duong dan import route admin.
- Loi `EADDRINUSE:5000` do trung port backend process cu.
- Loi CORS khi frontend chay `3001` va backend allow `3000`:
  - Da cap nhat `FRONTEND_URL` trong `.env` sang `http://localhost:3001`.

---

## Giai doan F - Trien khai Consent-Based Access (Database -> Backend -> API -> Frontend)

### Database

- Da tao migration: `database/migrations/001_consent_access.sql`.
- Da cap nhat `database/init.sql` de setup moi co day du bang consent.
- Da apply migration tren DB hien tai thanh cong (tao duoc `doctor_access_sessions`, `audit_logs`).
- Bo sung cac thanh phan:
  - Mo rong `access_codes` (patient_id, revoked_at, note).
  - Tao `doctor_access_sessions`.
  - Tao `audit_logs`.

### Backend

- Da tao module consent:
  - `backend/src/models/consent.model.js`
  - `backend/src/controllers/consent.controller.js`
  - `backend/src/routes/consent.routes.js`
- Da mount route vao `backend/src/routes/index.js`:
  - Prefix `/api/consent`.
- Da bo sung middleware bao ve consent cho doctor:
  - `backend/src/middlewares/consent.middleware.js`
  - Yeu cau `x-consent-session-token` khi doctor query `history/abnormal`.

### API

- Da cap nhat OpenAPI `frontend/openapi.json` cho nhom Consent.
- Endpoint da co:
  - `POST /api/consent/codes`
  - `GET /api/consent/codes/active`
  - `POST /api/consent/verify`
  - `GET /api/consent/sessions/active`
  - `POST /api/consent/sessions/{sessionId}/revoke`

### Frontend

- Da tao API client consent:
  - `frontend/lib/api/consent.ts`
- Da tao trang Patient Privacy Center:
  - `frontend/app/(dashboard)/dashboard/privacy/page.tsx`
  - Tao code, xem code active, xem session active, revoke session.
- Da tao trang Doctor Access Gate:
  - `frontend/app/(dashboard)/dashboard/doctor-access/page.tsx`
  - Nhap ma 6 so, verify, nhan va luu session token tam.
- Da cap nhat menu role-based:
  - `frontend/app/(dashboard)/layout.tsx`.

### Socket.io consent gate (da thuc hien)

- Da bo sung xac thuc consent token tai `backend/index.js` cho socket handshake.
- Da bo sung event subscribe room theo device co quyen:
  - `subscribe-device` -> join `device:{device_id}`.
- MQTT service da emit du lieu vao secure room:
  - `io.to(device:...).emit('vitals', payload)`
  - Van giu kenh cu de tuong thich nguoc: `realtime-{device_id}`.

### Buoc tiep theo da hoan thanh them (Doctor Monitor MVP)

- Da bo sung trang monitor cho bac si:
  - `frontend/app/(dashboard)/dashboard/doctor-monitor/page.tsx`
- Da ket noi Socket.io voi consent token va subscribe room theo device:
  - event `subscribe-device`
  - nhan event `vitals`
- Da show metric realtime (HR, SpO2, Temp), danh sach event va lich su gan nhat.
- Da bo sung menu `Doctor Monitor` trong dashboard role doctor/admin.

### Hardening API session scope (da thuc hien)

- Da bo sung middleware kiem tra consent token theo `sessionId`:
  - `requireConsentSessionForDoctorBySessionParam`
- Da gan middleware vao route:
  - `GET /api/health/session/:sessionId`
- Ket qua: doctor chi query duoc session trung voi consent session token dang hieu luc.

### Ket qua giai doan F

- Da co luong dong thuan E2E co ban:
  1. Patient tao ma.
  2. Doctor verify ma -> nhan session token tam.
  3. Doctor query history/abnormal can consent token.
  4. Patient revoke session.
  5. Socket room co consent gate.

---

## 4. Tinh nang da hoan thanh

### Backend

- Auth (register/login/forgot/reset password).
- Profile (get/update/upload avatar).
- Admin user management (8 API).
- Middleware auth + role.

### Frontend

- Profile dashboard user.
- Admin users management page ban dau.

### He thong

- Postgres/Timescale schema co san.
- MQTT bridge san sang cho luong realtime.

---

## 5. Phan viec dang thieu va can uu tien tiep (cap nhat moi nhat)

## Uu tien 1 - Consent-Based Access (da dat MVP)

Da hoan thanh:

1. Access code 6 so cho patient (co TTL).
2. Doctor verify code de lay session token tam thoi.
3. Socket.io auth bang session token.
4. Active sessions + revoke ngay lap tuc.
5. Audit logs cho hanh dong truy cap du lieu.

Can bo sung:

1. Chinh sach rotation/refresh token cho session dai hon.
2. Cac test bao mat cho replay va brute-force code.

## Uu tien 2 - Doctor Clinical View (da nang cap)

1. Access Gate (nhap code + xac nhan thong tin benh nhan).
2. Realtime ECG quality cao (MVP room + event stream da co).
3. Analytics theo khoang thoi gian (da co trends endpoint + chart frontend).
4. AI panel (rule-based da co risk score + clinical alert, model-based de sprint sau).

## Uu tien 3 - Admin observability

1. MQTT throughput/status.
2. DB size/retention stats.
3. API audit log viewer (da co endpoint backend, cho frontend man hinh hien thi day du).
4. Device registry nang cao (da co endpoint list/toggle active/assign owner).

---

## 6. Ke hoach trien khai de xuat (4 sprint)

## Sprint 1

- DB migration cho `access_codes`, `doctor_access_sessions`, `audit_logs`.
- API tao code / verify code / revoke session.
- Middleware xac thuc session token.

## Sprint 2

- Socket room authorization bang session token.
- Patient Privacy Center (code + countdown + active sessions).

## Sprint 3

- Doctor Access Gate + Clinical View + history query.
- Rule-based canh bao y khoa ban dau.

## Sprint 4

- Admin system dashboard (health/inventory/logs).
- Hardening, test E2E, va bao mat.

---

## 7. Rui ro ky thuat va bien phap giam thieu

1. Rui ro ro ri quyen truy cap:

- Giam thieu: TTL ngan, revoke real-time, audit logs bat buoc.

2. Rui ro qua tai realtime:

- Giam thieu: gioi han room, throttle event, monitor broker metrics.

3. Rui ro sai so y khoa:

- Giam thieu: AI chi de support, hien disclaimer ro rang, canh bao theo muc do.

4. Rui ro sai lech schema giua environments:

- Giam thieu: migration versioning + startup checks.

---

## 8. Checklist nghiem thu tam thoi

- [x] Admin quan ly user qua API.
- [x] Frontend admin users co the thao tac co ban.
- [x] Profile update da duoc fix luong date/underlying conditions.
- [x] Consent-based access chay day du E2E (MVP).
- [x] Doctor clinical monitoring MVP (history + trends + risk summary + realtime).
- [ ] Admin system health dashboard day du (backend API da co, can hoan thien frontend quan tri he thong).
- [ ] Bao cao test bao mat + hieu nang.

---

## 9. Ket luan hien tai

Du an da hoan thanh vung nen quan trong (auth/profile/admin users), san sang chuyen sang giai doan cot loi cua de tai la `Consent-Based Access` va `Doctor Clinical Monitoring`.

Neu tiep tuc theo roadmap de xuat, he thong co the dat ban MVP day du cho 3 vai tro trong 2-4 sprint tiep theo.
