const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

/**
 * Custom fetch mutator used by Orval-generated API client.
 * - Prepends BASE_URL to every path
 * - Injects JWT from localStorage automatically
 * - Normalises error messages from the backend error envelope
 */
export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  // Orval passes just the path (e.g. "/api/auth/login") when no baseUrl is
  // set in the openapi spec servers array (or servers is set to "").
  const finalUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const consentSessionToken =
    typeof window !== 'undefined' ? localStorage.getItem('consent_session_token') : null;

  const headers = new Headers(options.headers);
  // For FormData bodies the browser must set Content-Type (with multipart boundary)
  // — do NOT override it manually.
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (consentSessionToken) headers.set('x-consent-session-token', consentSessionToken);

  const res = await fetch(finalUrl, { ...options, headers });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message =
      (data.errors as string[] | undefined)?.join(', ') ??
      (data as { error?: string }).error ??
      (data as { message?: string }).message ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }

  // Orval generates status-discriminated union types: { data: T; status: N; headers: Headers }
  // Return the response in that shape so response.status / response.data work correctly.
  if (res.status === 204) {
    return { data: undefined, status: 204, headers: res.headers } as T;
  }

  const json = await res.json();
  return { data: json, status: res.status, headers: res.headers } as T;
};
