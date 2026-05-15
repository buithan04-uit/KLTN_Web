const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data as T;
};

export type AccessCode = {
  id: number;
  code: string;
  device_id: string;
  patient_id: number;
  created_at: string;
  expires_at: string;
};

export type DoctorAccessSession = {
  session_id: string;
  doctor_id: number;
  patient_id: number;
  device_id: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  doctor_name?: string;
  doctor_email?: string;
};

export const consentApi = {
  createCode: (payload?: { device_id?: string; ttl_minutes?: number }) =>
    apiFetch<{ message: string; data: AccessCode }>('/api/consent/codes', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  listActiveCodes: (deviceId?: string) => {
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    return apiFetch<{ data: AccessCode[] }>(`/api/consent/codes/active${query}`);
  },

  verifyCode: (code: string) =>
    apiFetch<{
      message: string;
      data: {
        session_token: string;
        session: DoctorAccessSession;
        patient_summary: {
          id: number;
          full_name: string | null;
          age: number | null;
          device_id: string;
          device_name: string | null;
          device_status: string | null;
        };
      };
    }>('/api/consent/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  listActiveSessions: () =>
    apiFetch<{ data: DoctorAccessSession[] }>('/api/consent/sessions/active'),

  revokeSession: (sessionId: string, reason?: string) =>
    apiFetch<{ message: string; data: DoctorAccessSession }>(`/api/consent/sessions/${sessionId}/revoke`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    }),
};
