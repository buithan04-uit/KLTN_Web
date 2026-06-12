// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  role: 'admin' | 'doctor' | 'patient';
  full_name: string | null;
  phone: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: Pick<User, 'id' | 'email' | 'role' | 'full_name'>;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

// ─── Health / Vitals ─────────────────────────────────────────────────────────

export interface HealthRecord {
  time: string;
  device_id: string;
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  ecg_value: number | null;
  ecg_points?: number[] | null;
  ecg_lcd_points?: number[] | null;
  ecg_sampling_rate?: number | null;
  r_peak_index?: number | null;
  normalized?: boolean | null;
  type?: string | null;
  mode?: string | null;
  ecg_unit?: string | null;
  ecg_source?: string | null;
  ecg_display?: string | null;
  ecg_seq?: number | null;
  ecg_start_ms?: number | null;
  min_mv?: number | null;
  max_mv?: number | null;
  p2p_mv?: number | null;
  clip_pct?: number | null;
  hr_ecg?: number | null;
  hr_ppg?: number | null;
  hr_source?: string | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  map?: number | null;
  session_id: string | null;
  is_abnormal: boolean;
  note: string | null;
}

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiError {
  error?: string;
  errors?: string[];
  message?: string;
}
