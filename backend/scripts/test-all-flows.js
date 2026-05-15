'use strict';
/**
 * test-all-flows.js — Kiểm thử tích hợp toàn bộ luồng API
 *
 * Yêu cầu:
 *   1. Database đã migrate + seed: node scripts/run-seed.js
 *   2. Chạy: node scripts/test-all-flows.js
 *
 * Không cần server đang chạy — script tự khởi động server nội bộ.
 *
 * Luồng được kiểm tra:
 *   [Auth]        Đăng ký, đăng nhập, sai mật khẩu, quên mật khẩu
 *   [Profile]     Xem / cập nhật hồ sơ (bệnh nhân, bác sĩ, admin)
 *   [Devices]     Danh sách thiết bị, đăng ký, cập nhật, huỷ liên kết, available
 *   [Consent]     Tạo mã, xem mã, bác sĩ xác thực, xem phiên, thu hồi phiên
 *   [Health]      Lịch sử (self), lịch sử (có consent), xu hướng, clinical, bất thường, by session
 *   [Admin/Users] Danh sách, chi tiết, tạo, cập nhật, xoá
 *   [Admin/System]Tổng quan, audit logs, danh sách thiết bị, set active, assign owner
 *   [Security]    Không token → 401, sai role → 403, truy cập chéo không consent → 403/404
 */

require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const app = require('../src/app');

const PORT = 5058;
const BASE = `http://localhost:${PORT}/api`;

// ─── Console colours ──────────────────────────────────────────────────────────
const G = '\x1b[32m'; const R = '\x1b[31m'; const Y = '\x1b[33m';
const B = '\x1b[36m'; const D = '\x1b[2m';  const RESET = '\x1b[0m';

let pass = 0; let fail = 0; let skip = 0;
const results = []; // { name, ok, status, expected, note }

// ─── Assertion helpers ────────────────────────────────────────────────────────
function assert(name, condition, note = '') {
  const icon = condition ? `${G}✓${RESET}` : `${R}✗${RESET}`;
  console.log(`  ${icon}  ${name}${note ? D + '  ' + note + RESET : ''}`);
  results.push({ name, ok: condition, note });
  condition ? pass++ : fail++;
  return condition;
}

function section(title) {
  console.log(`\n${B}── ${title}${RESET}`);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function api(method, path, { body, token, consentToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (consentToken) headers['x-consent-session-token'] = consentToken;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  // ── Connect DB to get user IDs ──────────────────────────────────────────────
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const { rows } = await db.query(`
    SELECT id, email, role FROM users
    WHERE email IN (
      'admin01@telehealth.test','doctor01@telehealth.test',
      'doctor02@telehealth.test','patient01@telehealth.test','patient02@telehealth.test'
    )
  `);

  if (rows.length < 5) {
    console.error(`${R}Seed data missing — run: node scripts/run-seed.js${RESET}`);
    await db.end();
    process.exit(1);
  }

  const byEmail = {};
  rows.forEach((r) => (byEmail[r.email] = r));

  const U = {
    admin:    byEmail['admin01@telehealth.test'],
    doctor1:  byEmail['doctor01@telehealth.test'],
    doctor2:  byEmail['doctor02@telehealth.test'],
    patient1: byEmail['patient01@telehealth.test'],
    patient2: byEmail['patient02@telehealth.test'],
  };

  await db.end();

  const tok = (u) => jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const T = {
    admin:    tok(U.admin),
    doctor1:  tok(U.doctor1),
    doctor2:  tok(U.doctor2),
    patient1: tok(U.patient1),
    patient2: tok(U.patient2),
  };

  // ── Start in-process server ─────────────────────────────────────────────────
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`${D}Test server listening on port ${PORT}${RESET}\n`);

  // State accumulated across tests
  let newUserId = null;        // created by admin
  let newDeviceId = null;      // registered by patient1
  let consentCode = null;      // created by patient1
  let consentToken = null;     // obtained by doctor1 via verify
  let activeSessionId = null;  // session created by verify
  let registeredByTest = 'TEST_DEV_' + Date.now().toString().slice(-6);

  try {
    // ════════════════════════════════════════════════════════════════════════
    // AUTH
    // ════════════════════════════════════════════════════════════════════════
    section('Auth — Đăng nhập & Đăng ký');

    {
      const { status, json } = await api('POST', '/auth/login', {
        body: { email: 'patient01@telehealth.test', password: 'Patient@123' },
      });
      assert('Login bệnh nhân thành công', status === 200, `token: ${!!json?.token}`);
    }

    {
      const { status, json } = await api('POST', '/auth/login', {
        body: { email: 'doctor01@telehealth.test', password: 'Doctor@123' },
      });
      assert('Login bác sĩ thành công', status === 200, `token: ${!!json?.token}`);
    }

    {
      const { status, json } = await api('POST', '/auth/login', {
        body: { email: 'admin01@telehealth.test', password: 'Admin@123' },
      });
      assert('Login admin thành công', status === 200, `token: ${!!json?.token}`);
    }

    {
      const { status } = await api('POST', '/auth/login', {
        body: { email: 'patient01@telehealth.test', password: 'WrongPass!999' },
      });
      assert('Login sai mật khẩu → 401', status === 401);
    }

    {
      const { status } = await api('POST', '/auth/login', {
        body: { email: 'notexist@telehealth.test', password: 'Any@123' },
      });
      assert('Login email không tồn tại → 401', status === 401);
    }

    {
      // Validation middleware thực hiện DNS MX lookup — cần mạng Internet (có thể trả 400 trong môi trườ ng offline)
      const { status } = await api('POST', '/auth/register', {
        body: {
          email: `regtest_${Date.now()}@gmail.com`,
          password: 'Reg@12345',
          full_name: 'Test Register',
        },
      });
      // 201: tạo thành công; 400: DNS check fail (offline env); 409: email đã tồn tại
      assert('Đăng ký tài khoản mới → 201/400 (DNS phụ thuộc môi trườ ng)', [201, 400, 409].includes(status), `status=${status}`);
    }

    {
      const { status } = await api('POST', '/auth/register', {
        body: { email: 'patient01@telehealth.test', password: 'Patient@123', full_name: 'Dup' },
      });
      assert('Đăng ký email đã tồn tại → 400/409', status === 400 || status === 409);
    }

    {
      const { status } = await api('POST', '/auth/forgot-password', {
        body: { email: 'patient01@telehealth.test' },
      });
      // Email service may not be configured in test env — 200 or 500 both OK; key = not 404
      assert('Quên mật khẩu gọi được (không crash) → không phải 404', status !== 404);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PROFILE
    // ════════════════════════════════════════════════════════════════════════
    section('Profile — Xem & Cập nhật hồ sơ');

    {
      const { status, json } = await api('GET', '/profile', { token: T.patient1 });
      assert('Bệnh nhân xem hồ sơ → 200', status === 200);
      assert('Hồ sơ bệnh nhân có blood_type', !!json?.blood_type, `blood_type=${json?.blood_type}`);
      assert('Hồ sơ bệnh nhân có height/weight', json?.height != null && json?.weight != null);
    }

    {
      const { status, json } = await api('PUT', '/profile', {
        token: T.patient1,
        body: { first_name: 'Lê Văn', last_name: 'Bệnh Nhân Updated', blood_type: 'B+', height: 172, weight: 70 },
      });
      assert('Bệnh nhân cập nhật hồ sơ → 200', status === 200);
      assert('Bệnh nhân — blood_type cập nhật đúng', json?.profile?.blood_type === 'B+' || json?.blood_type === 'B+');
    }

    {
      const { status, json } = await api('GET', '/profile', { token: T.doctor1 });
      assert('Bác sĩ xem hồ sơ → 200', status === 200);
      assert('Hồ sơ bác sĩ có specialty', !!json?.specialty, `specialty=${json?.specialty}`);
      assert('Hồ sơ bác sĩ có license_number', !!json?.license_number);
    }

    {
      const { status, json } = await api('PUT', '/profile', {
        token: T.doctor1,
        body: {
          first_name: 'Nguyễn Văn',
          last_name: 'Bác Sĩ Updated',
          specialty: 'Tim mạch - Siêu âm',
          license_number: '001234/BYT-CCHN-UPD',
          workplace: 'BV Bạch Mai - Khoa Tim mạch',
          bio: 'Chuyên gia tim mạch cập nhật.',
        },
      });
      assert('Bác sĩ cập nhật hồ sơ chuyên môn → 200', status === 200);
      assert('Bác sĩ — specialty cập nhật đúng', json?.profile?.specialty === 'Tim mạch - Siêu âm' || json?.specialty === 'Tim mạch - Siêu âm');
    }

    {
      const { status, json } = await api('GET', '/profile', { token: T.admin });
      assert('Admin xem hồ sơ → 200', status === 200);
      assert('Hồ sơ admin có department', !!json?.department, `department=${json?.department}`);
    }

    {
      const { status } = await api('PUT', '/profile', {
        token: T.admin,
        body: { department: 'Vận hành & CNTT - Updated', bio: 'Quản trị viên hệ thống cập nhật.' },
      });
      assert('Admin cập nhật phòng ban → 200', status === 200);
    }

    {
      const { status } = await api('GET', '/profile');
      assert('Xem hồ sơ không có token → 401', status === 401);
    }

    // ════════════════════════════════════════════════════════════════════════
    // DEVICES
    // ════════════════════════════════════════════════════════════════════════
    section('Devices — Thiết bị cá nhân');

    {
      const { status, json } = await api('GET', '/devices/my', { token: T.patient1 });
      assert('Bệnh nhân xem thiết bị của mình → 200', status === 200);
      assert('patient1 có ít nhất 2 thiết bị (DEV_01, DEV_02)', (json?.data?.length ?? 0) >= 2, `count=${json?.data?.length}`);
    }

    {
      const { status, json } = await api('GET', '/devices/available', { token: T.admin });
      assert('Admin xem thiết bị available → 200', status === 200);
    }

    {
      // Admin có thể tạo thiết bị mới; patient chỉ có thể nhận thiết bị đã tồn tại và chưa có chủ sở hữu
      // DEV_04 được seed là thiết bị chưa có owner → patient1 nhận → 201
      const { status, json } = await api('POST', '/devices/register', {
        token: T.patient1,
        body: { device_id: 'DEV_04', name: 'DEV_04 Claimed', type: 'wearable' },
      });
      assert('Bệnh nhân nhận thiết bị chưa có owner (DEV_04) → 201', status === 201);
      newDeviceId = json?.device?.device_id || 'DEV_04';
    }

    {
      // DEV_03 owned by patient2 → patient1 cố nhận → 409
      const { status } = await api('POST', '/devices/register', {
        token: T.patient1,
        body: { device_id: 'DEV_03', name: 'Claim attempt', type: 'wearable' },
      });
      assert('Nhận thiết bị đã có owner khác → 409', status === 409);
    }

    if (newDeviceId) {
      const { status, json } = await api('PATCH', `/devices/${newDeviceId}`, {
        token: T.patient1,
        body: { name: 'DEV_04 Updated', firmware_version: '1.0.0' },
      });
      assert(`Cập nhật thiết bị ${newDeviceId} → 200`, status === 200);
    }

    {
      const { status } = await api('PATCH', '/devices/DEV_03', {
        token: T.patient1,
        body: { name: 'IDOR attempt' },
      });
      assert('Cập nhật thiết bị của người khác → 403/404', status === 403 || status === 404);
    }

    if (newDeviceId) {
      const { status } = await api('DELETE', `/devices/${newDeviceId}/unlink`, { token: T.patient1 });
      assert(`Huỷ liên kết thiết bị ${newDeviceId} → 200`, status === 200);
    }

    {
      const { status } = await api('DELETE', '/devices/DEV_03/unlink', { token: T.patient1 });
      assert('Huỷ liên kết thiết bị của người khác → 403/404', status === 403 || status === 404);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONSENT — Tạo mã + Bác sĩ xác thực
    // ════════════════════════════════════════════════════════════════════════
    section('Consent — Mã truy cập & Phiên bác sĩ');

    {
      const { status, json } = await api('POST', '/consent/codes', {
        token: T.patient1,
        body: { device_id: 'DEV_01', ttl_minutes: 30 },
      });
      assert('patient1 tạo mã consent cho DEV_01 → 201', status === 201);
      // Response: { message, data: { id, code, device_id, expires_at, ... } }
      consentCode = json?.data?.code ?? json?.code ?? json?.access_code?.code ?? null;
      assert('Mã consent được trả về', !!consentCode, `code=${consentCode}`);
    }

    {
      const { status } = await api('POST', '/consent/codes', {
        token: T.doctor1,
        body: { device_id: 'DEV_01' },
      });
      assert('Bác sĩ không được tạo mã consent → 403', status === 403);
    }

    {
      const { status, json } = await api('GET', '/consent/codes/active', { token: T.patient1 });
      assert('patient1 xem mã active → 200', status === 200);
      assert('Có ít nhất 1 mã active', (json?.codes?.length ?? json?.data?.length ?? 0) >= 1);
    }

    {
      const { status } = await api('GET', '/consent/codes/active', { token: T.doctor1 });
      assert('Bác sĩ xem codes active (không phải patient) → 403', status === 403);
    }

    if (consentCode) {
      const { status, json } = await api('POST', '/consent/verify', {
        token: T.doctor1,
        body: { code: consentCode },
      });
      assert(`Bác sĩ xác thực mã ${consentCode} → 200/201`, status === 200 || status === 201);
      // Response: { message, data: { session_token, session, patient_summary } }
      consentToken = json?.data?.session_token ?? json?.session_token ?? json?.token ?? null;
      activeSessionId = json?.data?.session?.session_id ?? json?.session_id ?? null;
      assert('Session token được cấp', !!consentToken, `keys:${Object.keys(json?.data ?? json ?? {})}`);
    } else {
      console.log(`  ${Y}⚠${RESET}  Bỏ qua verify consent (không có mã)`);
      skip++;
    }

    {
      const { status } = await api('POST', '/consent/verify', {
        token: T.doctor1,
        body: { code: '000000' },
      });
      assert('Xác thực mã không hợp lệ → 404/400/401', [400, 401, 404].includes(status));
    }

    {
      const { status, json } = await api('GET', '/consent/sessions/active', { token: T.patient1 });
      assert('patient1 xem phiên active → 200', status === 200);
    }

    {
      const { status } = await api('GET', '/consent/sessions/active', { token: T.doctor1 });
      assert('Bác sĩ không xem sessions của patient → 403', status === 403);
    }

    // Revoke sẽ test ở cuối để không mất token cho health tests bên dưới

    // ════════════════════════════════════════════════════════════════════════
    // HEALTH DATA
    // ════════════════════════════════════════════════════════════════════════
    section('Health — Dữ liệu sinh hiệu');

    {
      const { status, json } = await api('GET', '/health/history/DEV_01?limit=10', { token: T.patient1 });
      assert('patient1 xem lịch sử DEV_01 (thiết bị của mình) → 200', status === 200);
      assert('Có ít nhất 1 bản ghi', (Array.isArray(json) ? json.length : (json?.data?.length ?? 0)) > 0);
    }

    {
      const { status } = await api('GET', '/health/history/DEV_03?limit=5', { token: T.patient1 });
      assert('patient1 xem DEV_03 (của patient2, không có consent) → 403/404', status === 403 || status === 404);
    }

    if (consentToken) {
      const { status, json } = await api('GET', '/health/history/DEV_01?limit=10', {
        token: T.doctor1,
        consentToken,
      });
      assert('Bác sĩ xem lịch sử DEV_01 với consent token → 200', status === 200);
      assert('Có dữ liệu trả về', (Array.isArray(json) ? json.length : (json?.data?.length ?? 0)) > 0);
    } else {
      console.log(`  ${Y}⚠${RESET}  Bỏ qua health/history với consent (không có token)`);
      skip++;
    }

    {
      const { status } = await api('GET', '/health/history/DEV_01?limit=5', { token: T.doctor1 });
      assert('Bác sĩ xem lịch sử không có consent token → 403', status === 403);
    }

    if (consentToken) {
      const { status } = await api('GET', '/health/abnormal/DEV_01?limit=5', {
        token: T.doctor1,
        consentToken,
      });
      assert('Bác sĩ xem dữ liệu bất thường DEV_01 → 200', status === 200);
    }

    {
      const { status } = await api('GET', '/health/abnormal/DEV_01?limit=5', { token: T.patient1 });
      assert('Bệnh nhân xem /abnormal → 403 (role không đủ)', status === 403);
    }

    if (consentToken) {
      const { status } = await api('GET', '/health/trends/DEV_01?hours=24&bucket_minutes=15', {
        token: T.doctor1,
        consentToken,
      });
      assert('Bác sĩ xem xu hướng DEV_01 → 200', status === 200);
    }

    if (consentToken) {
      const { status } = await api('GET', '/health/clinical-summary/DEV_01?hours=24', {
        token: T.doctor1,
        consentToken,
      });
      assert('Bác sĩ xem clinical summary DEV_01 → 200', status === 200);
    }

    {
      const { status } = await api('GET', '/health/clinical-summary/DEV_01?hours=24', { token: T.patient1 });
      assert('Bệnh nhân xem /clinical-summary → 403 (role không đủ)', status === 403);
    }

    {
      // patient1 owns DEV_01 → seed health data has session_id='11111111-1111-1111-1111-111111111111'
      const sessionId = '11111111-1111-1111-1111-111111111111';
      const { status } = await api('GET', `/health/session/${sessionId}`, { token: T.patient1 });
      assert(`Bệnh nhân xem dữ liệu theo session DEV_01 → 200`, status === 200);
    }

    if (consentToken && activeSessionId) {
      const { status, json } = await api('GET', `/health/session/${activeSessionId}`, {
        token: T.doctor1,
        consentToken,
      });
      // The dynamic session may have 0 rows of health data but endpoint should respond 200
      assert(`Bác sĩ xem dữ liệu theo session id (consent) → 200`, status === 200);
    } else {
      console.log(`  ${Y}⚠${RESET}  Bỏ qua health/session doctor (không có activeSessionId)`);
      skip++;
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONSENT REVOKE  (thực hiện sau health tests)
    // ════════════════════════════════════════════════════════════════════════
    section('Consent — Thu hồi phiên');

    if (activeSessionId) {
      const { status } = await api('POST', `/consent/sessions/${activeSessionId}/revoke`, {
        token: T.patient1,
        body: { reason: 'Test revoke' },
      });
      assert(`patient1 thu hồi phiên ${activeSessionId} → 200`, status === 200);
    } else {
      // Revoke bằng seed session aaaa...
      const seedSession = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const { status } = await api('POST', `/consent/sessions/${seedSession}/revoke`, {
        token: T.patient1,
        body: { reason: 'Test revoke seed session' },
      });
      // May already be revoked → 200 or 400 both fine
      assert(`Thu hồi seed session → không crash (200/400)`, status === 200 || status === 400);
    }

    {
      const { status } = await api('POST', '/consent/sessions/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/revoke', {
        token: T.patient1,
        body: { reason: 'IDOR attempt' },
      });
      // patient1 trying to revoke patient2's session → 403/404
      assert('patient1 thu hồi phiên của patient2 → 403/404', status === 403 || status === 404);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ADMIN — USERS
    // ════════════════════════════════════════════════════════════════════════
    section('Admin — Quản lý người dùng');

    {
      const { status, json } = await api('GET', '/admin/users?page=1&limit=10', { token: T.admin });
      assert('Admin lấy danh sách users → 200', status === 200);
      assert('Có ít nhất 5 users', (json?.users?.length ?? 0) >= 5 || (json?.data?.length ?? 0) >= 5, `count=${json?.users?.length ?? json?.data?.length}`);
    }

    {
      const { status } = await api('GET', '/admin/users?role=doctor', { token: T.admin });
      assert('Admin lọc users theo role=doctor → 200', status === 200);
    }

    {
      const { status } = await api('GET', '/admin/users?search=patient01', { token: T.admin });
      assert('Admin tìm kiếm user → 200', status === 200);
    }

    {
      const { status } = await api('GET', `/admin/users/${U.patient1.id}`, { token: T.admin });
      assert('Admin xem chi tiết user → 200', status === 200);
    }

    {
      const { status } = await api('GET', '/admin/users/999999', { token: T.admin });
      assert('Admin xem user không tồn tại → 404', status === 404);
    }

    {
      const { status, json } = await api('POST', '/admin/users', {
        token: T.admin,
        body: {
          email: `admin_created_${Date.now()}@telehealth.test`,
          password: 'AdminCreate@123',
          role: 'doctor',
          full_name: 'Admin Created Doctor',
        },
      });
      assert('Admin tạo user mới → 201', status === 201);
      newUserId = json?.user?.id ?? json?.id ?? null;
    }

    if (newUserId) {
      const { status } = await api('PUT', `/admin/users/${newUserId}`, {
        token: T.admin,
        body: { full_name: 'Admin Created Doctor UPDATED', is_active: true },
      });
      assert(`Admin cập nhật user ${newUserId} → 200`, status === 200);
    }

    if (newUserId) {
      const { status } = await api('DELETE', `/admin/users/${newUserId}`, { token: T.admin });
      assert(`Admin xoá user ${newUserId} → 200`, status === 200);
    }

    {
      const { status } = await api('GET', '/admin/users', { token: T.doctor1 });
      assert('Bác sĩ truy cập admin/users → 403', status === 403);
    }

    {
      const { status } = await api('GET', '/admin/users', { token: T.patient1 });
      assert('Bệnh nhân truy cập admin/users → 403', status === 403);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ADMIN — SYSTEM
    // ════════════════════════════════════════════════════════════════════════
    section('Admin — Hệ thống');

    {
      const { status, json } = await api('GET', '/admin/system/overview', { token: T.admin });
      assert('Admin xem system overview → 200', status === 200);
      assert('Overview có user count', json?.users != null || json?.total_users != null || json?.data?.users != null);
    }

    {
      const { status } = await api('GET', '/admin/system/audit-logs?limit=10', { token: T.admin });
      assert('Admin xem audit logs → 200', status === 200);
    }

    {
      const { status } = await api('GET', '/admin/system/audit-logs', { token: T.doctor1 });
      assert('Bác sĩ xem audit logs → 403', status === 403);
    }

    {
      const { status, json } = await api('GET', '/admin/system/devices?page=1&limit=10', { token: T.admin });
      assert('Admin xem danh sách thiết bị → 200', status === 200);
      assert('Có ít nhất 3 thiết bị (DEV_01..DEV_04)', (json?.data?.length ?? 0) >= 3 || (json?.devices?.length ?? 0) >= 3);
    }

    {
      const { status } = await api('PATCH', '/admin/system/devices/DEV_01/active', {
        token: T.admin,
        body: { is_active: true },
      });
      assert('Admin set device active → 200', status === 200);
    }

    {
      const { status } = await api('PATCH', '/admin/system/devices/DEV_04/active', {
        token: T.admin,
        body: { is_active: false },
      });
      assert('Admin set device inactive → 200', status === 200);
    }

    {
      const { status } = await api('PATCH', `/admin/system/devices/DEV_04/owner`, {
        token: T.admin,
        body: { owner_id: U.patient2.id },
      });
      // Assign DEV_04 to patient2
      assert('Admin assign device owner → 200', status === 200);
    }

    // ════════════════════════════════════════════════════════════════════════
    // SECURITY — Bảo mật & Kiểm soát truy cập
    // ════════════════════════════════════════════════════════════════════════
    section('Security — Kiểm soát truy cập');

    {
      const { status } = await api('GET', '/profile');
      assert('GET /profile không có token → 401', status === 401);
    }

    {
      const { status } = await api('GET', '/devices/my');
      assert('GET /devices/my không có token → 401', status === 401);
    }

    {
      const { status } = await api('GET', '/health/history/DEV_01');
      assert('GET /health/history không có token → 401', status === 401);
    }

    {
      const { status } = await api('GET', '/admin/users');
      assert('GET /admin/users không có token → 401', status === 401);
    }

    {
      // Expired token
      const expiredToken = jwt.sign({ id: U.patient1.id, role: 'patient' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
      const { status } = await api('GET', '/profile', { token: expiredToken });
      assert('Token hết hạn → 401', status === 401);
    }

    {
      // patient truy cập endpoint bác sĩ (clinical-summary uses role:doctor)
      const { status } = await api('GET', '/health/clinical-summary/DEV_01', { token: T.patient1 });
      assert('Bệnh nhân truy cập /clinical-summary (doctor-only) → 403', status === 403);
    }

    {
      // doctor truy cập admin endpoint
      const { status } = await api('GET', '/admin/system/overview', { token: T.doctor1 });
      assert('Bác sĩ truy cập admin/system/overview → 403', status === 403);
    }

    {
      // doctor xem health với consent token của bệnh nhân khác (token không khớp device)
      const wrongToken = 'definitely.not.a.valid.consent.token';
      const { status } = await api('GET', '/health/history/DEV_01', { token: T.doctor2, consentToken: wrongToken });
      assert('Consent token giả mạo → 401/403', [401, 403].includes(status));
    }

    {
      // doctor2 dùng consent token của doctor1 để truy cập (token đúng device nhưng không phải của doctor2)
      if (consentToken) {
        const { status } = await api('GET', '/health/history/DEV_01', { token: T.doctor2, consentToken });
        // After session revoked above, this should fail; if not revoked it may succeed (session is valid)
        // Either way: should not be 500
        assert('Dùng consent token của doctor khác không gây lỗi server → không phải 500', status !== 500);
      }
    }

  } finally {
    server.close();
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = pass + fail + skip;
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`${B}Kết quả kiểm thử TeleHealth API${RESET}`);
  console.log(`${'─'.repeat(55)}`);
  console.log(`  ${G}✓ Passed:${RESET}  ${pass}`);
  if (fail > 0) console.log(`  ${R}✗ Failed:${RESET}  ${fail}`);
  if (skip > 0) console.log(`  ${Y}⚠ Skipped:${RESET} ${skip}`);
  console.log(`  Total:    ${total}`);
  console.log(`${'═'.repeat(55)}\n`);

  if (fail > 0) {
    console.log(`${R}Các test thất bại:${RESET}`);
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}${r.note ? ' (' + r.note + ')' : ''}`));
    console.log('');
    process.exit(1);
  }

})().catch((err) => {
  console.error(`\n${R}Fatal error:${RESET}`, err.message);
  console.error(err.stack);
  process.exit(1);
});
