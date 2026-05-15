import type { AuthResponse, RegisterPayload, LoginPayload, HealthRecord, ApiError } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = data as ApiError;
    const message =
      err.errors?.join(', ') ?? err.error ?? err.message ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (payload: RegisterPayload) =>
    request<{ message: string; user: AuthResponse['user'] }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: LoginPayload) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyResetToken: (token: string) =>
    request<{ message: string; email: string }>('/api/auth/verify-reset-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  resetPassword: (token: string, new_password: string) =>
    request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    }),
};

// ─── Health / Vitals ──────────────────────────────────────────────────────────

export const healthApi = {
  getHistory: (deviceId: string, limit = 50, token: string) =>
    request<HealthRecord[]>(`/api/health/history/${deviceId}?limit=${limit}`, {}, token),

  getBySession: (sessionId: string, token: string) =>
    request<HealthRecord[]>(`/api/health/session/${sessionId}`, {}, token),

  getAbnormal: (deviceId: string, token: string) =>
    request<HealthRecord[]>(`/api/health/abnormal/${deviceId}`, {}, token),
};

// ─── Device ────────────────────────────────────────────────────────────────────────────────────
export type AvailableDevice = {
  device_id: string;
  name: string | null;
  type: string;
  firmware_version: string | null;
  created_at: string;
};

export const deviceApi = {
  listAvailable: (token: string) =>
    request<{ data: AvailableDevice[] }>('/api/devices/available', {}, token),

  unlink: (deviceId: string, token: string) =>
    request<{ message: string }>(`/api/devices/${deviceId}/unlink`, { method: 'DELETE' }, token),
};
