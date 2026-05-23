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
  options: { token?: string | null; consentToken?: string | null } = {}
): Promise<T> => {
  const token = options.token ?? getStoredToken();
  const consentToken = options.consentToken ?? getStoredConsentToken();
  const headers: Record<string, string> = {};

  if (token) headers.Authorization = `Bearer ${token}`;
  if (consentToken) headers["x-consent-session-token"] = consentToken;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers,
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
      token?: string | null;
      consentToken?: string | null;
    } = {}
  ) => {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      limit: String(options.limit || 20),
    });
    if (options.modelName) params.set("model_name", options.modelName);
    return request<AiPredictionList>(
      `/api/ai/predictions/${encodeURIComponent(deviceId)}?${params.toString()}`,
      options
    );
  },
};
