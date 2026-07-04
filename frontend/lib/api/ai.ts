const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export type AiStatus = "normal" | "warning" | "danger" | "unknown";

export interface AiPredictionRow {
  id: number;
  health_time: string | null;
  device_id: string;
  model_name: string;
  prediction_label: string;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  input_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface AiCoverage {
  mode?: "sensor-only" | "partial" | "full";
  available_fields?: string[];
  missing_fields?: string[];
  sensor_fields?: string[];
  manual_fields?: string[];
  model_required_fields?: string[];
  has_any_sensor_data?: boolean;
  has_manual_blood_pressure?: boolean;
}

export interface AiRuleBasedAssessment {
  methodology?: string;
  total_score?: number;
  highest_single_score?: number;
  status?: AiStatus;
  label?: string;
  interpretation?: string;
  components?: Array<{
    field: string;
    label?: string;
    value?: number | string | null;
    unit?: string;
    score?: number;
    source?: "sensor" | "manual_input" | string;
    calibration?: Record<string, unknown>;
  }>;
  limitations?: string[];
}

export interface AiModelSummary {
  latest: AiPredictionRow;
  status: AiStatus;
  status_reason?: string;
  counts: Record<string, number>;
  status_counts?: Record<AiStatus, number>;
  sample_count: number;
}

export interface AiSummary {
  device_id: string;
  overall_status: AiStatus;
  headline: string;
  summary: string;
  status_reason?: string;
  window: {
    limit: number;
    sample_count: number;
    from: string | null;
    to: string | null;
  };
  models: Record<string, AiModelSummary>;
  disclaimer: string;
}

export interface AiPredictionList {
  data: AiPredictionRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  disclaimer: string;
}

const getStoredToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
};

const getStoredConsentToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("consent_session_token");
};

const request = async <T>(
  path: string,
  options: { token?: string | null; consentToken?: string | null; method?: "GET" | "POST"; body?: unknown } = {}
): Promise<T> => {
  const token = options.token ?? getStoredToken();
  const consentToken = options.consentToken ?? getStoredConsentToken();
  const headers: Record<string, string> = {};

  if (token) headers.Authorization = `Bearer ${token}`;
  if (consentToken) headers["x-consent-session-token"] = consentToken;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = "Khong the tai du lieu AI";
    try {
      const body = await res.json();
      message = body?.error || message;
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return res.json();
};

export const aiApi = {
  getSummary: (
    deviceId: string,
    options: { limit?: number; token?: string | null; consentToken?: string | null } = {}
  ) => {
    const limit = options.limit || 30;
    return request<AiSummary>(`/api/ai/summary/${encodeURIComponent(deviceId)}?limit=${limit}`, options);
  },
  getPredictions: (
    deviceId: string,
    options: {
      page?: number;
      limit?: number;
      modelName?: string;
      from?: string;
      to?: string;
      status?: AiStatus;
      token?: string | null;
      consentToken?: string | null;
    } = {}
  ) => {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      limit: String(options.limit || 20),
    });
    if (options.modelName) params.set("model_name", options.modelName);
    if (options.from) params.set("from", options.from);
    if (options.to) params.set("to", options.to);
    if (options.status) params.set("status", options.status);
    return request<AiPredictionList>(
      `/api/ai/predictions/${encodeURIComponent(deviceId)}?${params.toString()}`,
      options
    );
  },
  predictLatest: (
    deviceId: string,
    options: { token?: string | null; consentToken?: string | null } = {}
  ) => request<{
    device_id: string;
    predictions: Record<string, unknown>;
    persisted_count: number;
    disclaimer: string;
  }>(`/api/ai/predict/latest/${encodeURIComponent(deviceId)}`, { ...options, method: "POST" }),
  recordManualBloodPressure: (
    deviceId: string,
    body: { systolic_bp: number; diastolic_bp: number },
    options: { token?: string | null; consentToken?: string | null } = {}
  ) => request<{
    data: Record<string, unknown>;
    source: "manual_input";
    message: string;
    disclaimer: string;
  }>(`/api/ai/manual-blood-pressure/${encodeURIComponent(deviceId)}`, {
    ...options,
    method: "POST",
    body,
  }),
};
