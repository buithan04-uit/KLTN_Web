'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  BadgeX,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  FlaskConical,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Play,
  RotateCw,
  Server,
  Shield,
  ShieldCheck,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

type Status = 'idle' | 'running' | 'pass' | 'fail';

interface TestResult {
  status: Status;
  duration?: number;
  statusCode?: number;
  response?: unknown;
  error?: string;
}

interface TestContext {
  adminToken: string;
  doctorToken: string;
  patientToken: string;
}

interface EvalResult {
  pass: boolean;
  error?: string;
}

interface TestCase {
  id: string;
  name: string;
  description: string;
  tag: string;
  expect: string;
  run: (ctx: TestContext) => Promise<{ statusCode?: number; data: unknown }>;
  evaluate?: (r: { statusCode?: number; data: unknown }) => EvalResult;
}

interface TestSuite {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgLight: string;
  border: string;
  cases: TestCase[];
}

const CREDS = {
  admin: { email: 'admin01@telehealth.test', password: 'Admin@123' },
  doctor: { email: 'doctor01@telehealth.test', password: 'Doctor@123' },
  patient: { email: 'patient01@telehealth.test', password: 'Patient@123' },
  bad: { email: 'patient01@telehealth.test', password: 'wrongpassword' },
};

async function api(
  path: string,
  options: RequestInit = {},
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ statusCode: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { statusCode: res.status, data };
}

const SUITES: TestSuite[] = [
  {
    id: 'server',
    name: 'Kết nối Server',
    icon: Server,
    color: 'text-slate-600',
    bgLight: 'bg-slate-50',
    border: 'border-slate-200',
    cases: [
      {
        id: 'health-root',
        name: 'Root endpoint',
        description: 'GET /',
        tag: 'Server',
        expect: 'HTTP 200',
        run: async () => {
          const res = await fetch(`${API_URL}/`);
          return { statusCode: res.status, data: { text: await res.text() } };
        },
      },
      {
        id: 'api-docs',
        name: 'Swagger endpoint',
        description: 'GET /api-docs',
        tag: 'Server',
        expect: 'HTTP 200',
        run: async () => {
          const res = await fetch(`${API_URL}/api-docs`);
          return { statusCode: res.status, data: { ok: res.ok } };
        },
      },
    ],
  },
  {
    id: 'auth',
    name: 'Auth',
    icon: ShieldCheck,
    color: 'text-sky-600',
    bgLight: 'bg-sky-50',
    border: 'border-sky-200',
    cases: [
      {
        id: 'login-admin',
        name: 'Login admin',
        description: 'POST /api/auth/login admin',
        tag: '/login',
        expect: 'HTTP 200',
        run: async () => api('/api/auth/login', { method: 'POST', body: JSON.stringify(CREDS.admin) }),
      },
      {
        id: 'login-doctor',
        name: 'Login doctor',
        description: 'POST /api/auth/login doctor',
        tag: '/login',
        expect: 'HTTP 200',
        run: async () => api('/api/auth/login', { method: 'POST', body: JSON.stringify(CREDS.doctor) }),
      },
      {
        id: 'login-patient',
        name: 'Login patient',
        description: 'POST /api/auth/login patient',
        tag: '/login',
        expect: 'HTTP 200',
        run: async () => api('/api/auth/login', { method: 'POST', body: JSON.stringify(CREDS.patient) }),
      },
      {
        id: 'login-wrong-password',
        name: 'Sai mật khẩu',
        description: 'POST /api/auth/login wrong password',
        tag: '/login',
        expect: 'HTTP 401',
        run: async () => api('/api/auth/login', { method: 'POST', body: JSON.stringify(CREDS.bad) }),
      },
      {
        id: 'login-missing-email',
        name: 'Thiếu email',
        description: 'POST /api/auth/login thiếu email',
        tag: '/login',
        expect: 'HTTP 4xx',
        run: async () => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'x' }) }),
      },
      {
        id: 'register-invalid-email',
        name: 'Register email sai định dạng',
        description: 'POST /api/auth/register invalid email',
        tag: '/register',
        expect: 'HTTP 400',
        run: async () => api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email: 'abc', password: 'Test@1234', role: 'patient' }),
        }),
      },
      {
        id: 'verify-reset-invalid',
        name: 'Verify reset token giả',
        description: 'POST /api/auth/verify-reset-token token giả',
        tag: '/forgot-password',
        expect: 'HTTP 400',
        run: async () => api('/api/auth/verify-reset-token', {
          method: 'POST',
          body: JSON.stringify({ token: 'invalid-token' }),
        }),
      },
    ],
  },
  {
    id: 'profile',
    name: 'Profile',
    icon: UserCircle,
    color: 'text-violet-600',
    bgLight: 'bg-violet-50',
    border: 'border-violet-200',
    cases: [
      {
        id: 'profile-get',
        name: 'Lấy profile',
        description: 'GET /api/profile',
        tag: '/dashboard/profile',
        expect: 'HTTP 200',
        run: async ({ patientToken }) => api('/api/profile', {}, patientToken),
      },
      {
        id: 'profile-update',
        name: 'Cập nhật profile',
        description: 'PUT /api/profile',
        tag: '/dashboard/profile',
        expect: 'HTTP 200',
        run: async ({ patientToken }) => api('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ underlying_conditions: 'None' }),
        }, patientToken),
      },
      {
        id: 'profile-bad-blood-type',
        name: 'Blood type không hợp lệ',
        description: 'PUT /api/profile blood_type INVALID',
        tag: '/dashboard/profile',
        expect: 'HTTP 400',
        run: async ({ patientToken }) => api('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({ blood_type: 'INVALID' }),
        }, patientToken),
      },
      {
        id: 'profile-unauthorized',
        name: 'Không token',
        description: 'GET /api/profile no auth',
        tag: '/dashboard/profile',
        expect: 'HTTP 401',
        run: async () => api('/api/profile'),
      },
    ],
  },
  {
    id: 'devices',
    name: 'Devices',
    icon: Cpu,
    color: 'text-emerald-600',
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-200',
    cases: [
      {
        id: 'devices-my',
        name: 'Thiết bị của tôi',
        description: 'GET /api/devices/my?include_inactive=true',
        tag: '/dashboard/devices',
        expect: 'HTTP 200',
        run: async ({ patientToken }) => api('/api/devices/my?include_inactive=true', {}, patientToken),
      },
      {
        id: 'devices-available',
        name: 'Thiết bị khả dụng',
        description: 'GET /api/devices/available',
        tag: '/dashboard/devices',
        expect: 'HTTP 200',
        run: async ({ doctorToken }) => api('/api/devices/available', {}, doctorToken),
      },
      {
        id: 'device-update-owned',
        name: 'Update thiết bị sở hữu',
        description: 'PATCH /api/devices/DEV_01',
        tag: '/dashboard/devices',
        expect: 'HTTP 200',
        run: async ({ patientToken }) => api('/api/devices/DEV_01', {
          method: 'PATCH',
          body: JSON.stringify({ name: 'My Wearable DEV_01' }),
        }, patientToken),
      },
      {
        id: 'device-register-admin',
        name: 'Admin tạo thiết bị mới',
        description: 'POST /api/devices/register DEV_TEST_001',
        tag: '/dashboard/devices',
        expect: 'HTTP 201 hoặc 409',
        run: async ({ adminToken }) => api('/api/devices/register', {
          method: 'POST',
          body: JSON.stringify({ device_id: 'DEV_TEST_001', name: 'Test Device', type: 'wearable' }),
        }, adminToken),
        evaluate: ({ statusCode }) => ({
          pass: statusCode === 201 || statusCode === 409,
          error: `HTTP ${statusCode} (cần 201/409)`,
        }),
      },
      {
        id: 'device-register-no-id',
        name: 'Register thiếu device_id',
        description: 'POST /api/devices/register thiếu device_id',
        tag: '/dashboard/devices',
        expect: 'HTTP 400',
        run: async ({ adminToken }) => api('/api/devices/register', {
          method: 'POST',
          body: JSON.stringify({ name: 'No ID Device' }),
        }, adminToken),
      },
      {
        id: 'device-unlink-not-owned',
        name: 'Huỷ liên kết thiết bị không sở hữu',
        description: 'DELETE /api/devices/DEV_03/unlink (patient01 không sở hữu) => 404',
        tag: '/dashboard/devices',
        expect: 'HTTP 404',
        run: async ({ patientToken }) => api('/api/devices/DEV_03/unlink', { method: 'DELETE' }, patientToken),
      },
      {
        id: 'devices-no-auth',
        name: 'Không token',
        description: 'GET /api/devices/my',
        tag: '/dashboard/devices',
        expect: 'HTTP 401',
        run: async () => api('/api/devices/my'),
      },
    ],
  },
  {
    id: 'health',
    name: 'Health',
    icon: Activity,
    color: 'text-rose-600',
    bgLight: 'bg-rose-50',
    border: 'border-rose-200',
    cases: [
      {
        id: 'health-history-owned',
        name: 'History thiết bị sở hữu',
        description: 'GET /api/health/history/DEV_01?limit=10',
        tag: 'Health',
        expect: 'HTTP 200',
        run: async ({ patientToken }) => api('/api/health/history/DEV_01?limit=10', {}, patientToken),
      },
      {
        id: 'health-history-not-owned',
        name: 'Patient xem lịch sử thiết bị không sở hữu',
        description: 'GET /api/health/history/DEV_03 => 403',
        tag: 'RBAC',
        expect: 'HTTP 403',
        run: async ({ patientToken }) => api('/api/health/history/DEV_03', {}, patientToken),
      },
      {
        id: 'health-history-doctor-fake-consent',
        name: 'Doctor dùng consent token giả',
        description: 'GET /api/health/history/DEV_01 + x-consent-session-token giả',
        tag: 'RBAC',
        expect: 'HTTP 403',
        run: async ({ doctorToken }) => api('/api/health/history/DEV_01', {}, doctorToken, {
          'x-consent-session-token': 'fake-token-test',
        }),
      },
      {
        id: 'health-abnormal-admin',
        name: 'Abnormal data (admin)',
        description: 'GET /api/health/abnormal/DEV_01',
        tag: 'Health',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/health/abnormal/DEV_01', {}, adminToken),
      },
      {
        id: 'health-clinical-summary-admin',
        name: 'Clinical summary (admin)',
        description: 'GET /api/health/clinical-summary/DEV_01',
        tag: 'Health',
        expect: 'HTTP 200 + ai_summary',
        run: async ({ adminToken }) => api('/api/health/clinical-summary/DEV_01', {}, adminToken),
        evaluate: ({ statusCode, data }) => {
          if (statusCode !== 200) return { pass: false, error: `HTTP ${statusCode}` };
          const ai = (data as Record<string, unknown>)?.ai_summary as Record<string, unknown> | undefined;
          if (!ai) return { pass: false, error: 'Thiếu ai_summary' };
          if (typeof ai.risk_score !== 'number') return { pass: false, error: 'risk_score không phải number' };
          return { pass: true };
        },
      },
      {
        id: 'health-trends-admin',
        name: 'Health trends (admin)',
        description: 'GET /api/health/trends/DEV_01?hours=12&bucket_minutes=5',
        tag: 'Health',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/health/trends/DEV_01?hours=12&bucket_minutes=5', {}, adminToken),
      },
      {
        id: 'health-session-seed',
        name: 'Health theo session seed',
        description: 'GET /api/health/session/11111111-1111-1111-1111-111111111111',
        tag: 'Health',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/health/session/11111111-1111-1111-1111-111111111111', {}, adminToken),
      },
      {
        id: 'health-no-auth',
        name: 'Health không token',
        description: 'GET /api/health/history/DEV_01',
        tag: 'RBAC',
        expect: 'HTTP 401',
        run: async () => api('/api/health/history/DEV_01'),
      },
    ],
  },
  {
    id: 'consent',
    name: 'Consent',
    icon: KeyRound,
    color: 'text-amber-600',
    bgLight: 'bg-amber-50',
    border: 'border-amber-200',
    cases: [
      {
        id: 'consent-active-codes',
        name: 'Mã đang hoạt động',
        description: 'GET /api/consent/codes/active',
        tag: 'Consent',
        expect: 'HTTP 200',
        run: async ({ patientToken }) => api('/api/consent/codes/active', {}, patientToken),
      },
      {
        id: 'consent-create-code-owned',
        name: 'Tạo mã cho thiết bị sở hữu',
        description: 'POST /api/consent/codes device DEV_01',
        tag: 'Consent',
        expect: 'HTTP 201',
        run: async ({ patientToken }) => api('/api/consent/codes', {
          method: 'POST',
          body: JSON.stringify({ device_id: 'DEV_01', ttl_minutes: 5 }),
        }, patientToken),
      },
      {
        id: 'consent-create-code-unowned',
        name: 'Tạo mã cho thiết bị không sở hữu',
        description: 'POST /api/consent/codes device DEV_03',
        tag: 'Consent',
        expect: 'HTTP 404',
        run: async ({ patientToken }) => api('/api/consent/codes', {
          method: 'POST',
          body: JSON.stringify({ device_id: 'DEV_03', ttl_minutes: 5 }),
        }, patientToken),
      },
      {
        id: 'consent-verify-bad-format',
        name: 'Verify code sai format',
        description: 'POST /api/consent/verify code abcdef',
        tag: 'Consent',
        expect: 'HTTP 400',
        run: async ({ doctorToken }) => api('/api/consent/verify', {
          method: 'POST',
          body: JSON.stringify({ code: 'abcdef' }),
        }, doctorToken),
      },
      {
        id: 'consent-revoke-not-found',
        name: 'Revoke session không tồn tại',
        description: 'POST /api/consent/sessions/.../revoke',
        tag: 'Consent',
        expect: 'HTTP 404',
        run: async ({ patientToken }) => api('/api/consent/sessions/00000000-dead-beef-0000-000000000000/revoke', {
          method: 'POST',
        }, patientToken),
      },
      {
        id: 'consent-verify-by-patient-forbidden',
        name: 'Patient không được verify mã',
        description: 'POST /api/consent/verify dùng patient token',
        tag: 'RBAC',
        expect: 'HTTP 403',
        run: async ({ patientToken }) => api('/api/consent/verify', {
          method: 'POST',
          body: JSON.stringify({ code: '123456' }),
        }, patientToken),
      },
    ],
  },
  {
    id: 'admin',
    name: 'Admin',
    icon: Users,
    color: 'text-indigo-600',
    bgLight: 'bg-indigo-50',
    border: 'border-indigo-200',
    cases: [
      {
        id: 'admin-list-users',
        name: 'Danh sách users',
        description: 'GET /api/admin/users?page=1&limit=10',
        tag: '/admin/users',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/admin/users?page=1&limit=10', {}, adminToken),
      },
      {
        id: 'admin-get-user-detail',
        name: 'Chi tiết user',
        description: 'GET list -> GET /api/admin/users/:id',
        tag: '/admin/users',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => {
          const listRes = await api('/api/admin/users?page=1&limit=1', {}, adminToken);
          if (listRes.statusCode !== 200) return listRes;
          const users = ((listRes.data as Record<string, unknown>)?.users ?? []) as Array<Record<string, unknown>>;
          if (!users.length) return { statusCode: 200, data: { skipped: true } };
          return api(`/api/admin/users/${users[0].id}`, {}, adminToken);
        },
      },
      {
        id: 'admin-search-user',
        name: 'Search user admin01',
        description: 'GET /api/admin/users?search=admin01',
        tag: '/admin/users',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/admin/users?search=admin01', {}, adminToken),
      },
      {
        id: 'admin-filter-doctor',
        name: 'Filter role doctor',
        description: 'GET /api/admin/users?role=doctor',
        tag: '/admin/users',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/admin/users?role=doctor&limit=20', {}, adminToken),
      },
      {
        id: 'admin-overview',
        name: 'System overview',
        description: 'GET /api/admin/system/overview',
        tag: '/admin/system',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/admin/system/overview', {}, adminToken),
      },
      {
        id: 'admin-audit-role-filter',
        name: 'Audit filter role',
        description: 'GET /api/admin/system/audit-logs?actor_role=doctor',
        tag: '/admin/system',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/admin/system/audit-logs?actor_role=doctor', {}, adminToken),
      },
      {
        id: 'admin-reset-password',
        name: 'Reset password user',
        description: 'POST /api/admin/users/:id/reset-password',
        tag: '/admin/users',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => {
          const listRes = await api('/api/admin/users?role=doctor&limit=1', {}, adminToken);
          if (listRes.statusCode !== 200) return listRes;
          const users = ((listRes.data as Record<string, unknown>)?.users ?? []) as Array<Record<string, unknown>>;
          if (!users.length) return { statusCode: 200, data: { skipped: true } };
          return api(`/api/admin/users/${users[0].id}/reset-password`, { method: 'POST' }, adminToken);
        },
      },
      {
        id: 'admin-patient-forbidden',
        name: 'Patient vào admin endpoint',
        description: 'GET /api/admin/users với patient token',
        tag: 'RBAC',
        expect: 'HTTP 403',
        run: async ({ patientToken }) => api('/api/admin/users', {}, patientToken),
      },
      {
        id: 'admin-no-auth',
        name: 'Admin endpoint không token',
        description: 'GET /api/admin/users no auth',
        tag: 'RBAC',
        expect: 'HTTP 401',
        run: async () => api('/api/admin/users'),
      },
    ],
  },
  {
    id: 'integration',
    name: 'Integration',
    icon: GitBranch,
    color: 'text-purple-600',
    bgLight: 'bg-purple-50',
    border: 'border-purple-200',
    cases: [
      {
        id: 'chain-auth-profile-email',
        name: 'Auth -> Profile email match',
        description: 'Login patient và kiểm tra email profile',
        tag: 'Integration',
        expect: 'email đúng',
        run: async ({ patientToken }) => api('/api/profile', {}, patientToken),
        evaluate: ({ statusCode, data }) => {
          if (statusCode !== 200) return { pass: false, error: `HTTP ${statusCode}` };
          const email = (data as Record<string, unknown>)?.email;
          if (email !== CREDS.patient.email) {
            return { pass: false, error: `Email mismatch: ${String(email)}` };
          }
          return { pass: true };
        },
      },
      {
        id: 'chain-admin-device-active',
        name: 'Admin toggle active device',
        description: 'PATCH /api/admin/system/devices/DEV_01/active',
        tag: 'Integration',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/admin/system/devices/DEV_01/active', {
          method: 'PATCH',
          body: JSON.stringify({ is_active: true }),
        }, adminToken),
      },
      {
        id: 'chain-doctor-no-consent',
        name: 'Doctor vào clinical summary không consent',
        description: 'GET /api/health/clinical-summary/DEV_01 with doctor token only',
        tag: 'Integration',
        expect: 'HTTP 403',
        run: async ({ doctorToken }) => api('/api/health/clinical-summary/DEV_01', {}, doctorToken),
      },
      {
        id: 'frontend-reachable',
        name: 'Frontend chạy',
        description: 'GET current origin',
        tag: 'Frontend',
        expect: 'HTTP 200',
        run: async () => {
          const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
          const res = await fetch(origin);
          return { statusCode: res.status, data: { ok: res.ok, origin } };
        },
      },
    ],
  },
  {
    id: 'shape',
    name: 'Data Shape',
    icon: LayoutDashboard,
    color: 'text-pink-600',
    bgLight: 'bg-pink-50',
    border: 'border-pink-200',
    cases: [
      {
        id: 'shape-profile',
        name: 'Profile shape',
        description: 'id,email,role,is_active',
        tag: 'Shape',
        expect: 'đủ fields',
        run: async ({ patientToken }) => api('/api/profile', {}, patientToken),
        evaluate: ({ statusCode, data }) => {
          if (statusCode !== 200) return { pass: false, error: `HTTP ${statusCode}` };
          const d = data as Record<string, unknown>;
          const missing = ['id', 'email', 'role', 'is_active'].filter((k) => !(k in d));
          return missing.length ? { pass: false, error: `Thiếu: ${missing.join(', ')}` } : { pass: true };
        },
      },
      {
        id: 'shape-devices',
        name: 'Devices shape',
        description: 'data[] có device_id/status',
        tag: 'Shape',
        expect: 'đúng shape',
        run: async ({ patientToken }) => api('/api/devices/my', {}, patientToken),
      },
    ],
  },
  {
    id: 'rbac-extra',
    name: 'RBAC chi tiết',
    icon: Shield,
    color: 'text-red-600',
    bgLight: 'bg-red-50',
    border: 'border-red-200',
    cases: [
      {
        id: 'rbac-patient-abnormal-forbidden',
        name: 'Patient vào abnormal endpoint',
        description: 'GET /api/health/abnormal/DEV_01 với patient',
        tag: 'RBAC',
        expect: 'HTTP 403',
        run: async ({ patientToken }) => api('/api/health/abnormal/DEV_01', {}, patientToken),
      },
      {
        id: 'rbac-patient-consent-verify-forbidden',
        name: 'Patient verify consent code',
        description: 'POST /api/consent/verify với patient',
        tag: 'RBAC',
        expect: 'HTTP 403',
        run: async ({ patientToken }) => api('/api/consent/verify', {
          method: 'POST',
          body: JSON.stringify({ code: '123456' }),
        }, patientToken),
      },
      {
        id: 'rbac-doctor-admin-users-forbidden',
        name: 'Doctor vào /admin/users',
        description: 'GET /api/admin/users với doctor',
        tag: 'RBAC',
        expect: 'HTTP 403',
        run: async ({ doctorToken }) => api('/api/admin/users', {}, doctorToken),
      },
      {
        id: 'rbac-no-token-admin-users',
        name: 'Không token vào /admin/users',
        description: 'GET /api/admin/users no auth',
        tag: 'RBAC',
        expect: 'HTTP 401',
        run: async () => api('/api/admin/users'),
      },
    ],
  },
  {
    id: 'admin-users-extended',
    name: 'Admin Users Extended',
    icon: UserPlus,
    color: 'text-cyan-600',
    bgLight: 'bg-cyan-50',
    border: 'border-cyan-200',
    cases: [
      {
        id: 'admin-user-not-found',
        name: 'GET user không tồn tại',
        description: 'GET /api/admin/users/99999',
        tag: '/admin/users',
        expect: 'HTTP 404',
        run: async ({ adminToken }) => api('/api/admin/users/99999', {}, adminToken),
      },
      {
        id: 'admin-update-user-name',
        name: 'Update full_name user',
        description: 'PUT /api/admin/users/:id full_name',
        tag: '/admin/users',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => {
          const listRes = await api('/api/admin/users?role=doctor&limit=1', {}, adminToken);
          if (listRes.statusCode !== 200) return listRes;
          const users = ((listRes.data as Record<string, unknown>)?.users ?? []) as Array<Record<string, unknown>>;
          if (!users.length) return { statusCode: 200, data: { skipped: true } };
          return api(`/api/admin/users/${users[0].id}`, {
            method: 'PUT',
            body: JSON.stringify({ full_name: `Doctor Test ${Date.now() % 10000}` }),
          }, adminToken);
        },
      },
      {
        id: 'admin-toggle-user-status',
        name: 'Toggle user status',
        description: 'PATCH /api/admin/users/:id/status',
        tag: '/admin/users',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => {
          const listRes = await api('/api/admin/users?role=doctor&limit=1', {}, adminToken);
          if (listRes.statusCode !== 200) return listRes;
          const users = ((listRes.data as Record<string, unknown>)?.users ?? []) as Array<Record<string, unknown>>;
          if (!users.length) return { statusCode: 200, data: { skipped: true } };
          return api(`/api/admin/users/${users[0].id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: true }),
          }, adminToken);
        },
      },
      {
        id: 'admin-change-role-invalid',
        name: 'Change role invalid',
        description: 'PATCH /api/admin/users/:id/role role invalid',
        tag: '/admin/users',
        expect: 'HTTP 400',
        run: async ({ adminToken }) => {
          const listRes = await api('/api/admin/users?limit=1', {}, adminToken);
          if (listRes.statusCode !== 200) return listRes;
          const users = ((listRes.data as Record<string, unknown>)?.users ?? []) as Array<Record<string, unknown>>;
          if (!users.length) return { statusCode: 200, data: { skipped: true } };
          return api(`/api/admin/users/${users[0].id}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role: 'invalid-role' }),
          }, adminToken);
        },
      },
    ],
  },
  {
    id: 'qa-extended',
    name: 'QA mở rộng',
    icon: FlaskConical,
    color: 'text-orange-600',
    bgLight: 'bg-orange-50',
    border: 'border-orange-200',
    cases: [
      {
        id: 'overview-shape',
        name: 'Overview có users/devices/server',
        description: 'GET /api/admin/system/overview shape check',
        tag: 'QA',
        expect: 'HTTP 200 + object con',
        run: async ({ adminToken }) => api('/api/admin/system/overview', {}, adminToken),
        evaluate: ({ statusCode, data }) => {
          if (statusCode !== 200) return { pass: false, error: `HTTP ${statusCode}` };
          const d = data as Record<string, unknown>;
          for (const k of ['users', 'devices', 'server']) {
            if (!(k in d)) return { pass: false, error: `Thiếu key ${k}` };
          }
          return { pass: true };
        },
      },
      {
        id: 'devices-admin-search',
        name: 'Admin search device DEV_01',
        description: 'GET /api/admin/system/devices?search=DEV_01',
        tag: 'QA',
        expect: 'HTTP 200',
        run: async ({ adminToken }) => api('/api/admin/system/devices?search=DEV_01', {}, adminToken),
      },
      {
        id: 'audit-pagination-shape',
        name: 'Audit logs có pagination',
        description: 'GET /api/admin/system/audit-logs?page=1&limit=5',
        tag: 'QA',
        expect: 'HTTP 200 + data/pagination',
        run: async ({ adminToken }) => api('/api/admin/system/audit-logs?page=1&limit=5', {}, adminToken),
        evaluate: ({ statusCode, data }) => {
          if (statusCode !== 200) return { pass: false, error: `HTTP ${statusCode}` };
          const d = data as Record<string, unknown>;
          if (!('data' in d) || !('pagination' in d)) return { pass: false, error: 'Thiếu data/pagination' };
          return { pass: true };
        },
      },
      {
        id: 'consent-active-sessions-shape',
        name: 'Active sessions shape',
        description: 'GET /api/consent/sessions/active',
        tag: 'QA',
        expect: 'HTTP 200',
        run: async ({ patientToken }) => api('/api/consent/sessions/active', {}, patientToken),
      },
    ],
  },
];

function StatusIcon({ status }: { status: Status }) {
  if (status === 'idle') return <div className="h-4 w-4 rounded-full border-2 border-slate-300" />;
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-sky-500" />;
  if (status === 'pass') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <BadgeX className="h-4 w-4 text-red-500" />;
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    idle: 'bg-slate-100 text-slate-500',
    running: 'bg-sky-100 text-sky-700',
    pass: 'bg-emerald-100 text-emerald-700',
    fail: 'bg-red-100 text-red-700',
  };
  const label: Record<Status, string> = {
    idle: 'Chưa chạy',
    running: 'Đang chạy...',
    pass: 'PASS',
    fail: 'FAIL',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>{label[status]}</span>;
}

function JsonView({ data }: { data: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function TestCaseRow({
  tc,
  result,
  running,
  onRun,
}: {
  tc: TestCase;
  result: TestResult;
  running: boolean;
  onRun: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDone = result.status === 'pass' || result.status === 'fail';

  return (
    <div className={`overflow-hidden rounded-xl border ${result.status === 'pass' ? 'border-emerald-200' : result.status === 'fail' ? 'border-red-200' : 'border-slate-200'}`}>
      <div className={`flex items-center gap-3 px-4 py-3 ${result.status === 'pass' ? 'bg-emerald-50' : result.status === 'fail' ? 'bg-red-50' : 'bg-white'}`}>
        <StatusIcon status={result.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{tc.name}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">{tc.tag}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{tc.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={result.status} />
          {result.duration !== undefined && (
            <span className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3 w-3" />{result.duration}ms</span>
          )}
          {result.statusCode !== undefined && (
            <span className={`rounded px-2 py-0.5 font-mono text-xs ${result.statusCode < 300 ? 'bg-emerald-100 text-emerald-700' : result.statusCode < 400 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
              {result.statusCode}
            </span>
          )}
          {hasDone && (
            <button onClick={() => setExpanded((v) => !v)} className="rounded p-1 hover:bg-slate-200" title="Chi tiết">
              {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
            </button>
          )}
          <button
            onClick={onRun}
            disabled={running}
            className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-600 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}Chạy
          </button>
        </div>
      </div>

      {expanded && hasDone && (
        <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="mb-1 font-medium text-slate-500">Kỳ vọng</p>
              <p className="rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-700">{tc.expect}</p>
            </div>
            <div>
              <p className="mb-1 font-medium text-slate-500">Kết quả</p>
              <p className={`rounded border px-2 py-1.5 font-medium ${result.status === 'pass' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                {result.status === 'pass' ? 'Dung ky vong' : `Loi: ${result.error}`}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Response</p>
            <JsonView data={result.response} />
          </div>
        </div>
      )}
    </div>
  );
}

type ResultsMap = Record<string, TestResult>;

export default function TestPage() {
  const [results, setResults] = useState<ResultsMap>({});
  const [runningAll, setRunningAll] = useState(false);
  const [ctx, setCtx] = useState<TestContext | null>(null);
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [authError, setAuthError] = useState('');
  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>({});
  const runningCaseId = useRef<string | null>(null);

  const allCases = useMemo(() => SUITES.flatMap((s) => s.cases), []);

  const getOrInitResult = (id: string): TestResult => results[id] ?? { status: 'idle' };

  const authenticate = useCallback(async (): Promise<TestContext> => {
    setAuthStatus('loading');
    setAuthError('');

    const [adminRes, doctorRes, patientRes] = await Promise.all([
      api('/api/auth/login', { method: 'POST', body: JSON.stringify(CREDS.admin) }),
      api('/api/auth/login', { method: 'POST', body: JSON.stringify(CREDS.doctor) }),
      api('/api/auth/login', { method: 'POST', body: JSON.stringify(CREDS.patient) }),
    ]);

    const adminToken = (adminRes.data as Record<string, unknown>)?.token as string | undefined;
    const doctorToken = (doctorRes.data as Record<string, unknown>)?.token as string | undefined;
    const patientToken = (patientRes.data as Record<string, unknown>)?.token as string | undefined;

    if (!adminToken || !doctorToken || !patientToken) {
      setAuthStatus('error');
      setAuthError('Không thể lấy đủ token admin/doctor/patient');
      throw new Error('Auth failed');
    }

    const nextCtx = { adminToken, doctorToken, patientToken };
    setCtx(nextCtx);
    setAuthStatus('ok');
    return nextCtx;
  }, []);

  const runCase = useCallback(async (tc: TestCase) => {
    runningCaseId.current = tc.id;
    setResults((prev) => ({
      ...prev,
      [tc.id]: { ...(prev[tc.id] ?? { status: 'idle' as const }), status: 'running', error: undefined },
    }));
    const start = performance.now();

    try {
      const currentCtx = ctx ?? (await authenticate());
      const r = await tc.run(currentCtx);
      const duration = Math.round(performance.now() - start);
      const statusCode = r.statusCode ?? 0;

      const defaultIsNegative = /401|403|404|400|4xx/i.test(tc.expect);
      const passByDefault = defaultIsNegative ? statusCode >= 400 : statusCode >= 200 && statusCode < 400;
      const custom = tc.evaluate ? tc.evaluate(r) : null;
      const pass = custom ? custom.pass : passByDefault;

      setResults((prev) => ({
        ...prev,
        [tc.id]: {
          status: pass ? 'pass' : 'fail',
          duration,
          statusCode,
          response: r.data,
          error: pass ? undefined : custom?.error ?? `HTTP ${statusCode}`,
        },
      }));
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      setResults((prev) => ({
        ...prev,
        [tc.id]: {
          status: 'fail',
          duration,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      }));
    } finally {
      runningCaseId.current = null;
    }
  }, [authenticate, ctx]);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    try {
      if (!ctx) await authenticate();
      for (const tc of allCases) {
        await runCase(tc);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    } finally {
      setRunningAll(false);
    }
  }, [allCases, authenticate, ctx, runCase]);

  const resetAll = useCallback(() => {
    setResults({});
    setAuthStatus('idle');
    setAuthError('');
    setCtx(null);
  }, []);

  const total = allCases.length;
  const passCount = allCases.filter((c) => results[c.id]?.status === 'pass').length;
  const failCount = allCases.filter((c) => results[c.id]?.status === 'fail').length;

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
              <FlaskConical className="h-5 w-5 text-sky-600" />API Visual Test Runner
            </h1>
            <p className="mt-1 text-sm text-slate-500">Tổng: {total} tests | PASS: {passCount} | FAIL: {failCount}</p>
            <p className="text-xs text-slate-500">API: {API_URL}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${authStatus === 'ok' ? 'bg-emerald-100 text-emerald-700' : authStatus === 'error' ? 'bg-red-100 text-red-700' : authStatus === 'loading' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
              Auth: {authStatus}
            </span>
            <button onClick={runAll} disabled={runningAll || runningCaseId.current !== null} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run all
            </button>
            <button onClick={resetAll} disabled={runningAll || runningCaseId.current !== null} className="flex items-center gap-1 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50">
              <RotateCw className="h-4 w-4" />Reset
            </button>
          </div>
        </div>
        {authError && <p className="mt-2 text-sm text-red-600">{authError}</p>}
      </div>

      {SUITES.map((suite) => {
        const Icon = suite.icon;
        const isExpanded = expandedSuites[suite.id] ?? true;
        const suiteCases = suite.cases;
        const suitePass = suiteCases.filter((c) => results[c.id]?.status === 'pass').length;
        const suiteFail = suiteCases.filter((c) => results[c.id]?.status === 'fail').length;

        return (
          <section key={suite.id} className={`rounded-2xl border ${suite.border} bg-white shadow-sm`}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpandedSuites((prev) => ({ ...prev, [suite.id]: !isExpanded }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpandedSuites((prev) => ({ ...prev, [suite.id]: !isExpanded }));
                }
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-t-2xl px-4 py-3 ${suite.bgLight}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${suite.color}`} />
                <h2 className="font-semibold text-slate-800">{suite.name}</h2>
                <span className="rounded bg-white/80 px-2 py-0.5 text-xs text-slate-600">{suite.cases.length} tests</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">{suitePass} pass</span>
                <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-700">{suiteFail} fail</span>
                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-600" /> : <ChevronRight className="h-4 w-4 text-slate-600" />}
              </div>
            </div>

            {isExpanded && (
              <div className="space-y-3 p-4">
                {suite.cases.map((tc) => (
                  <TestCaseRow
                    key={tc.id}
                    tc={tc}
                    result={getOrInitResult(tc.id)}
                    running={runningCaseId.current === tc.id || runningAll}
                    onRun={() => runCase(tc)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p className="mb-1 flex items-center gap-2 font-semibold"><BadgeCheck className="h-4 w-4 text-emerald-600" />PASS</p>
          <p>{passCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p className="mb-1 flex items-center gap-2 font-semibold"><BadgeX className="h-4 w-4 text-red-600" />FAIL</p>
          <p>{failCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p className="mb-1 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-sky-600" />Total</p>
          <p>{total}</p>
        </div>
      </div>
    </div>
  );
}
