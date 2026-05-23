'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { useGetApiHealthClinicalSummaryDeviceId, useGetApiHealthTrendsDeviceId, useGetApiHealthHistoryDeviceId } from '@/lib/orval/api';
import { useAuth } from '@/context/AuthContext';
import { consentApi } from '@/lib/api/consent';
import { aiApi, type AiStatus } from '@/lib/api/ai';
import { Activity, AlertTriangle, BrainCircuit, HeartPulse, KeyRound, LayoutGrid, Maximize2, Plus, PlugZap, X } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type RealtimePayload = {
  device_id: string;
  hr: number | null;
  spo2: number | null;
  temp: number | null;
  ecg: number | null;
  session_id?: string | null;
  ts?: string;
  received_at?: number;
};

type DoctorHistoryRow = {
  time: string;
  device_id: string;
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  ecg_value: number | null;
  ecg_points?: number[] | null;
  session_id: string | null;
};

type SessionEntry = {
  token: string;
  session_id?: string;
  patient_name: string | null;
  patient_id: number;
  device_name: string | null;
  device_status: string | null;
  expires_at?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

// ── Vital snapshot type used by DeviceSummaryCard ─────────────────────────────
type VitalSnapshot = { heart_rate?: number | null; spo2?: number | null; temperature?: number | null; time?: string | null };

function getVitalStatus(hr: number | null, spo2: number | null, temp: number | null): 'danger' | 'warning' | 'normal' | 'unknown' {
  if (hr === null && spo2 === null && temp === null) return 'unknown';
  if (
    (hr !== null && (hr < 50 || hr > 120)) ||
    (spo2 !== null && spo2 < 92) ||
    (temp !== null && temp > 38.5)
  ) return 'danger';
  if (
    (hr !== null && (hr < 60 || hr > 100)) ||
    (spo2 !== null && spo2 < 95) ||
    (temp !== null && (temp < 36.1 || temp > 37.2))
  ) return 'warning';
  return 'normal';
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value: number | null, precision = 1): string {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(precision);
}

function extractSessionIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

const VITAL_CONFIG = {
  heart_rate: { min: 60, max: 100, unit: 'bpm', precision: 0, stroke: '#ef4444' },
  spo2: { min: 95, max: 100, unit: '%', precision: 1, stroke: '#0ea5e9' },
  temperature: { min: 36.1, max: 37.2, unit: '°C', precision: 1, stroke: '#f59e0b' },
} as const;

const AI_STATUS_STYLES: Record<AiStatus, { box: string; text: string; badge: string; label: string }> = {
  normal: { box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', label: 'On dinh' },
  warning: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', label: 'Can theo doi' },
  danger: { box: 'border-red-200 bg-red-50', text: 'text-red-800', badge: 'bg-red-100 text-red-700', label: 'Can xem xet' },
  unknown: { box: 'border-slate-200 bg-white', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-600', label: 'Chua du du lieu' },
};

function getFieldStatus(
  field: keyof typeof VITAL_CONFIG,
  value: number | null
): 'danger' | 'warning' | 'normal' | 'unknown' {
  if (value === null) return 'unknown';
  const { min, max } = VITAL_CONFIG[field];
  if (value < min || value > max) return 'danger';
  const span = max - min;
  const warnLow = min + span * 0.1;
  const warnHigh = max - span * 0.1;
  if (value < warnLow || value > warnHigh) return 'warning';
  return 'normal';
}

function toDoctorHistoryRowFromRealtime(payload: RealtimePayload): DoctorHistoryRow {
  return {
    time: payload.ts || new Date(payload.received_at || Date.now()).toISOString(),
    device_id: payload.device_id,
    heart_rate: toNumber(payload.hr),
    spo2: toNumber(payload.spo2),
    temperature: toNumber(payload.temp),
    ecg_value: toNumber(payload.ecg),
    ecg_points: null,
    session_id: payload.session_id || null,
  };
}

function toHistoryUniqueKey(row: DoctorHistoryRow): string {
  return [
    row.time || '',
    row.device_id || '',
    row.heart_rate ?? 'n',
    row.spo2 ?? 'n',
    row.temperature ?? 'n',
    row.ecg_value ?? 'n',
    row.session_id ?? 'n',
  ].join('|');
}

function DeviceSummaryCard({
  deviceId, consentToken, patientName, deviceName, isActive, onFocus,
}: {
  deviceId: string; consentToken: string;
  patientName: string | null; deviceName: string | null;
  isActive: boolean; onFocus: () => void;
}) {
  const { data } = useGetApiHealthHistoryDeviceId(
    deviceId,
    { limit: 5 },
    {
      query: { enabled: !!deviceId && !!consentToken, refetchInterval: 15000 },
      request: { headers: { 'x-consent-session-token': consentToken } },
    }
  );
  const records = (data?.status === 200 ? data.data : []) as VitalSnapshot[];
  const latest = records.at(-1) ?? null;
  const status = getVitalStatus(latest?.heart_rate ?? null, latest?.spo2 ?? null, latest?.temperature ?? null);

  const statusMap = {
    normal:  { border: 'border-emerald-200', bg: 'bg-white',      dot: 'bg-emerald-500',        val: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', label: 'Ổn định' },
    warning: { border: 'border-amber-200',   bg: 'bg-amber-50/40', dot: 'bg-amber-400',          val: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700',   label: 'Chú ý' },
    danger:  { border: 'border-red-300',     bg: 'bg-red-50/60',   dot: 'bg-red-500 animate-pulse', val: 'text-red-700', badge: 'bg-red-100 text-red-700',     label: 'Cảnh báo' },
    unknown: { border: 'border-slate-200',   bg: 'bg-slate-50',    dot: 'bg-slate-300',           val: 'text-slate-500', badge: 'bg-slate-100 text-slate-500',  label: 'Chưa có dữ liệu' },
  }[status];

  return (
    <div className={`rounded-2xl border p-4 space-y-3 shadow-sm ${statusMap.border} ${statusMap.bg} ${isActive ? 'ring-2 ring-sky-400 ring-offset-1' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusMap.dot}`} />
            <p className="font-semibold text-slate-800 text-sm">{patientName || 'Bệnh nhân'}</p>
          </div>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{deviceName || deviceId}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusMap.badge}`}>{statusMap.label}</span>
          <button onClick={onFocus} className="text-xs text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded-lg transition">
            Tập trung →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-0.5">Nhịp tim</p>
          <p className={`text-xl font-bold ${statusMap.val}`}>{latest?.heart_rate != null ? Math.round(latest.heart_rate) : '—'}</p>
          <p className="text-xs text-slate-400">bpm</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-0.5">SpO₂</p>
          <p className={`text-xl font-bold ${statusMap.val}`}>{latest?.spo2 != null ? latest.spo2.toFixed(1) : '—'}</p>
          <p className="text-xs text-slate-400">%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-0.5">Nhiệt độ</p>
          <p className={`text-xl font-bold ${statusMap.val}`}>{latest?.temperature != null ? latest.temperature.toFixed(1) : '—'}</p>
          <p className="text-xs text-slate-400">°C</p>
        </div>
      </div>
      {latest?.time && (
        <p className="text-xs text-slate-400 text-right">{new Date(latest.time).toLocaleTimeString('vi-VN')}</p>
      )}
    </div>
  );
}

export default function DoctorMonitorPage() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [live, setLive] = useState<RealtimePayload | null>(null);
  const [events, setEvents] = useState<RealtimePayload[]>([]);
  const [error, setError] = useState('');
  // Read sessions from localStorage via lazy init (same typeof window pattern used in codebase)
  const [sessionsMap, setSessionsMap] = useState<Record<string, SessionEntry>>(() => {
    if (typeof window === 'undefined') return {};
    const isTokenExpired = (token: string): boolean => {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
      } catch { return false; }
    };
    try {
      const raw = localStorage.getItem('consent_sessions_map');
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, SessionEntry>;
        const now = Date.now();
        return Object.fromEntries(
          Object.entries(parsed).filter(([, e]) => {
            if (e.expires_at && new Date(e.expires_at).getTime() <= now) return false;
            if (!e.expires_at && isTokenExpired(e.token)) return false;
            return true;
          })
        );
      }
      const token = localStorage.getItem('consent_session_token');
      const devId = localStorage.getItem('consent_session_device_id');
      if (token && devId && !isTokenExpired(token)) return { [devId]: { token, patient_name: null, patient_id: 0, device_name: null, device_status: null } };
    } catch { /* */ }
    return {};
  });

  const [activeDeviceId, setActiveDeviceId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const raw = localStorage.getItem('consent_sessions_map');
      if (raw) {
        const map = JSON.parse(raw) as Record<string, SessionEntry>;
        const lastDevice = localStorage.getItem('consent_session_device_id');
        if (lastDevice && map[lastDevice]) return lastDevice;
        return Object.keys(map)[0] ?? '';
      }
      return localStorage.getItem('consent_session_device_id') ?? '';
    } catch { return ''; }
  });

  const consentToken = sessionsMap[activeDeviceId]?.token ?? null;
  const deviceId = activeDeviceId || null;

  const socketRef = useRef<Socket | null>(null);
  // Keep a ref to sessionsMap so socket handlers always read the latest value
  // without needing to be in the socket useEffect dependency array.
  const sessionsMapRef = useRef(sessionsMap);
  useEffect(() => { sessionsMapRef.current = sessionsMap; }, [sessionsMap]);

  const [viewMode, setViewMode] = useState<'focus' | 'grid'>('focus');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [deviceOnline, setDeviceOnline] = useState<boolean | null>(null);
  const [revokedNotif, setRevokedNotif] = useState('');

  const handleAddSession = useCallback(async () => {
    if (!/^\d{6}$/.test(addCode)) { setAddError('Mã truy cập phải gồm đúng 6 chữ số'); return; }
    try {
      setAddLoading(true);
      setAddError('');
      const resp = await consentApi.verifyCode(addCode);
      const { session_token, session, patient_summary } = resp.data;
      const devId = patient_summary.device_id;
      const newEntry: SessionEntry = {
        token: session_token,
        session_id: session.session_id,
        patient_name: patient_summary.full_name,
        patient_id: patient_summary.id,
        device_name: patient_summary.device_name,
        device_status: patient_summary.device_status,
        expires_at: session.expires_at,
      };
      const newMap = { ...sessionsMap, [devId]: newEntry };
      localStorage.setItem('consent_session_token', session_token);
      localStorage.setItem('consent_session_device_id', devId);
      localStorage.setItem('consent_sessions_map', JSON.stringify(newMap));
      setSessionsMap(newMap);
      setActiveDeviceId(devId);
      setAddCode('');
      setShowAddForm(false);
      setLive(null);
      setEvents([]);
      setConnected(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Xác thực mã thất bại');
    } finally {
      setAddLoading(false);
    }
  }, [addCode, sessionsMap]);

  const removeSession = useCallback((devId: string) => {
    const removingActive = activeDeviceId === devId;

    setSessionsMap((prev) => {
      const next = { ...prev };
      delete next[devId];
      try {
        localStorage.setItem('consent_sessions_map', JSON.stringify(next));
        const keys = Object.keys(next);
        if (keys.length === 0) {
          localStorage.removeItem('consent_session_token');
          localStorage.removeItem('consent_session_device_id');
        } else if (localStorage.getItem('consent_session_device_id') === devId) {
          localStorage.setItem('consent_session_device_id', keys[0]);
          localStorage.setItem('consent_session_token', next[keys[0]].token);
        }
      } catch { /* */ }
      return next;
    });
    if (removingActive) {
      setActiveDeviceId('');
      setLive(null);
      setEvents([]);
      setConnected(false);
      setDeviceOnline(null);
      setError('');
    }
  }, [activeDeviceId]);

  const closeSession = useCallback(async (devId: string) => {
    const entry = sessionsMapRef.current[devId];
    const sessionId = entry?.session_id || extractSessionIdFromToken(entry?.token);
    if (sessionId) {
      try {
        await consentApi.revokeSession(sessionId, 'Doctor ended monitoring session');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể kết thúc phiên trên server');
      }
    }
    removeSession(devId);
  }, [removeSession]);

  // Auto-switch active device if current one was removed
  useEffect(() => {
    if (activeDeviceId && !sessionsMap[activeDeviceId]) {
      setActiveDeviceId(Object.keys(sessionsMap)[0] ?? '');
    }
  }, [sessionsMap, activeDeviceId]);

  // Periodically purge expired sessions
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setSessionsMap((prev) => {
        const expired = Object.entries(prev).filter(([, e]) => e.expires_at && new Date(e.expires_at).getTime() <= now);
        if (expired.length === 0) return prev;
        const next = { ...prev };
        for (const [d] of expired) delete next[d];
        try { localStorage.setItem('consent_sessions_map', JSON.stringify(next)); } catch { /* */ }
        return next;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-dismiss revoked notification after 6 s
  useEffect(() => {
    if (!revokedNotif) return;
    const t = setTimeout(() => setRevokedNotif(''), 6000);
    return () => clearTimeout(t);
  }, [revokedNotif]);

  const { data: historyResp } = useGetApiHealthHistoryDeviceId(
    deviceId || '',
    { limit: 50 },
    {
      query: {
        enabled: !!deviceId && !!consentToken && !!user && (user.role === 'doctor' || user.role === 'admin'),
        refetchInterval: 20000,
      },
      request: {
        headers: consentToken ? { 'x-consent-session-token': consentToken } : {},
      },
    }
  );

  const history = useMemo<DoctorHistoryRow[]>(() => {
    if (historyResp?.status !== 200) return [];
    return (historyResp.data || []).map((row) => ({
      ...(() => {
        const rawEcgPoints = (row as { ecg_points?: unknown }).ecg_points;
        const normalizedEcgPoints = Array.isArray(rawEcgPoints)
          ? rawEcgPoints.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v))
          : null;

        return {
          ecg_points: normalizedEcgPoints,
        };
      })(),
      time: row.time ? new Date(row.time).toISOString() : new Date().toISOString(),
      device_id: row.device_id || (deviceId || ''),
      heart_rate: toNumber(row.heart_rate),
      spo2: toNumber(row.spo2),
      temperature: toNumber(row.temperature),
      ecg_value: toNumber(row.ecg_value),
      session_id: row.session_id || null,
    }));
  }, [historyResp, deviceId]);

  const { data: trendResp } = useGetApiHealthTrendsDeviceId(
    deviceId || '',
    { hours: 24, bucket_minutes: 15 },
    {
      query: {
        enabled: !!deviceId && !!consentToken && !!user && (user.role === 'doctor' || user.role === 'admin'),
        refetchInterval: 30000,
      },
      request: {
        headers: consentToken ? { 'x-consent-session-token': consentToken } : {},
      },
    }
  );

  const { data: clinicalResp } = useGetApiHealthClinicalSummaryDeviceId(
    deviceId || '',
    { hours: 24 },
    {
      query: {
        enabled: !!deviceId && !!consentToken && !!user && (user.role === 'doctor' || user.role === 'admin'),
        refetchInterval: 30000,
      },
      request: {
        headers: consentToken ? { 'x-consent-session-token': consentToken } : {},
      },
    }
  );

  const { data: aiSummary, isLoading: isAiSummaryLoading, isError: isAiSummaryError } = useQuery({
    queryKey: ['doctor-ai-summary', deviceId, consentToken],
    queryFn: () => aiApi.getSummary(deviceId || '', { limit: 30, consentToken }),
    enabled: !!deviceId && !!consentToken && !!user && (user.role === 'doctor' || user.role === 'admin'),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const trends = useMemo(() => (trendResp?.status === 200 ? trendResp.data : []), [trendResp]);
  const clinical = useMemo(() => (clinicalResp?.status === 200 ? clinicalResp.data : null), [clinicalResp]);

  const latestSnapshot = useMemo(() => {
    const historyLatest = history[0];
    return {
      hr: live?.hr ?? toNumber(historyLatest?.heart_rate),
      spo2: live?.spo2 ?? toNumber(historyLatest?.spo2),
      temp: live?.temp ?? toNumber(historyLatest?.temperature),
    };
  }, [live, history]);

  const historyWithRealtime = useMemo<DoctorHistoryRow[]>(() => {
    const realtimeRows = events
      .filter((e) => e.device_id === deviceId)
      .map((e) => toDoctorHistoryRowFromRealtime(e));

    const merged = [...realtimeRows, ...history];
    const seen = new Set<string>();
    const unique: DoctorHistoryRow[] = [];

    for (const row of merged) {
      const key = toHistoryUniqueKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
      if (unique.length >= 100) break;
    }

    return unique;
  }, [events, history, deviceId]);

  const realtimeChartData = useMemo(
    () =>
      [...historyWithRealtime]
        .slice(0, 60)
        .reverse()
        .map((r) => ({
          time: r.time
            ? new Date(r.time).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 2,
              })
            : '--:--',
          hr: r.heart_rate,
          spo2: r.spo2,
          temp: r.temperature,
        })),
    [historyWithRealtime]
  );

  const realtimeSeriesPointCount = useMemo(
    () => realtimeChartData.filter((p) => p.hr !== null || p.spo2 !== null || p.temp !== null).length,
    [realtimeChartData]
  );

  const doctorMiniTrendData = useMemo(
    () =>
      [...historyWithRealtime]
        .slice(0, 80)
        .reverse()
        .map((r) => ({
          time: r.time
            ? new Date(r.time).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 2,
              })
            : '--:--',
          heart_rate: r.heart_rate,
          spo2: r.spo2,
          temperature: r.temperature,
        })),
    [historyWithRealtime]
  );

  const doctorEcgData = useMemo(() => {
    const points = [...historyWithRealtime]
      .slice(0, 40)
      .reverse()
      .flatMap((r) => {
        const ecgPoints = Array.isArray(r.ecg_points)
          ? r.ecg_points.filter((v) => typeof v === 'number' && Number.isFinite(v))
          : [];
        if (ecgPoints.length) return ecgPoints;
        return typeof r.ecg_value === 'number' ? [r.ecg_value] : [];
      })
      .slice(-300);

    return points.map((value, i) => ({ i, value }));
  }, [historyWithRealtime]);

  useEffect(() => {
    if (!deviceId || !consentToken || !user || (user.role !== 'doctor' && user.role !== 'admin')) return;

    // Reset status when switching to a new device
    setDeviceOnline(null);

    const socket = io(API_URL, {
      transports: ['websocket'],
      auth: {
        consentToken,
      },
      extraHeaders: {
        'x-consent-session-token': consentToken,
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError('');
      socket.emit('subscribe-device', deviceId);
    });

    socket.on('connect_error', (err: { message?: string }) => {
      const msg = err?.message || 'Kết nối realtime thất bại';
      setConnected(false);
      if (/auth failed|expired|revoked|hết hạn|thu hồi|consent/i.test(msg) && deviceId) {
        setRevokedNotif(`Phiên truy cập cho thiết bị ${deviceId} không còn hợp lệ và đã được gỡ.`);
        removeSession(deviceId);
        return;
      }
      setError(msg);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('subscription-error', (payload: { message?: string }) => {
      const msg = payload?.message ?? 'Không thể subscribe realtime';
      if (/expired|revoked|hết hạn|thu hồi/i.test(msg) && deviceId) {
        setRevokedNotif(`Phiên truy cập cho thiết bị ${deviceId} không còn hợp lệ và đã được gỡ.`);
        removeSession(deviceId);
      } else {
        setError(msg);
      }
    });

    socket.on('vitals', (payload: RealtimePayload) => {
      const parsedTs = payload.ts ? new Date(payload.ts).getTime() : NaN;
      const next = { ...payload, received_at: Number.isFinite(parsedTs) ? parsedTs : Date.now() };
      setLive(next);
      setEvents((prev) => [next, ...prev].slice(0, 120));
    });

    socket.on('device-status', (payload: { device_id: string; status: string }) => {
      setDeviceOnline(payload.status === 'online');
    });

    socket.on('session-revoked', (payload: { session_id?: string; device_id?: string; message?: string }) => {
      const revokedDeviceId = payload?.device_id || deviceId;
      const patientName = revokedDeviceId ? sessionsMapRef.current[revokedDeviceId]?.patient_name : null;
      const label = patientName ? `${patientName} (${revokedDeviceId})` : revokedDeviceId;
      setRevokedNotif(`Bệnh nhân đã thu hồi quyền truy cập — thiết bị ${label}`);
      if (revokedDeviceId) removeSession(revokedDeviceId);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [deviceId, consentToken, user, removeSession]);

  const patientStatus = useMemo(() => {
    if (latestSnapshot.hr === null && latestSnapshot.spo2 === null && latestSnapshot.temp === null) return 'Chưa có dữ liệu';
    const danger =
      (latestSnapshot.hr !== null && (latestSnapshot.hr < 50 || latestSnapshot.hr > 120)) ||
      (latestSnapshot.spo2 !== null && latestSnapshot.spo2 < 92) ||
      (latestSnapshot.temp !== null && latestSnapshot.temp > 38.5);
    return danger ? 'Cảnh báo lâm sàng' : 'Ổn định';
  }, [latestSnapshot]);

  // Group sessions by patient so multiple devices of the same patient are visually grouped
  const sessionsByPatient = useMemo(() => {
    const groups = new Map<number, { name: string | null; devices: Array<[string, SessionEntry]> }>();
    for (const [devId, session] of Object.entries(sessionsMap)) {
      if (!groups.has(session.patient_id)) {
        groups.set(session.patient_id, { name: session.patient_name, devices: [] });
      }
      groups.get(session.patient_id)!.devices.push([devId, session]);
    }
    return [...groups.entries()];
  }, [sessionsMap]);

  if (!user || (user.role !== 'doctor' && user.role !== 'admin')) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
          Trang này chỉ dành cho bác sĩ hoặc quản trị viên.
        </div>
      </div>
    );
  }

  if (!consentToken || !deviceId) {
    return (
      <div className="p-6 space-y-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900">Doctor Monitor</h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <p className="text-sm font-medium text-slate-700">Nhập mã 6 số từ bệnh nhân để bắt đầu theo dõi.</p>
          <div className="flex gap-3">
            <input
              value={addCode}
              onChange={(e) => setAddCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-xl tracking-[0.3em] font-semibold text-center"
              placeholder="000000"
              inputMode="numeric"
              autoFocus
            />
            <button
              onClick={() => void handleAddSession()}
              disabled={addLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
            >
              <KeyRound className="w-4 h-4" /> {addLoading ? 'Đang xác thực...' : 'Xác thực'}
            </button>
          </div>
          {addError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{addError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Revoke notification (patient triggered) ── */}
      {revokedNotif && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {revokedNotif}
          </span>
          <button onClick={() => setRevokedNotif('')} className="text-amber-400 hover:text-amber-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* ── Session picker ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-semibold text-slate-700">Phiên bệnh nhân ({Object.keys(sessionsMap).length})</p>
          {Object.keys(sessionsMap).length > 1 && (
            <button
              onClick={() => setViewMode((m) => m === 'focus' ? 'grid' : 'focus')}
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition ${
                viewMode === 'grid'
                  ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {viewMode === 'grid'
                ? <><Maximize2 className="w-3.5 h-3.5" /> Chi tiết</>
                : <><LayoutGrid className="w-3.5 h-3.5" /> Tổng quan</>
              }
            </button>
          )}
          <button
            onClick={() => { setShowAddForm((f) => !f); setAddError(''); setAddCode(''); }}
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 px-2 py-1 rounded-lg hover:bg-sky-50 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm phiên
          </button>
        </div>
        {showAddForm && (
          <div className="flex flex-wrap gap-2 items-center border-t border-slate-100 pt-3 mb-2">
            <input
              value={addCode}
              onChange={(e) => setAddCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-36 rounded-xl border border-slate-300 px-3 py-2 text-lg tracking-[0.25em] font-semibold text-center"
              placeholder="000000"
              inputMode="numeric"
              autoFocus
            />
            <button
              onClick={() => void handleAddSession()}
              disabled={addLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
            >
              <KeyRound className="w-3.5 h-3.5" /> {addLoading ? '...' : 'Xác thực'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setAddError(''); setAddCode(''); }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
            {addError && <p className="text-xs text-red-600">{addError}</p>}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {sessionsByPatient.map(([patientId, group]) => (
            <div
              key={patientId}
              className={group.devices.length > 1 ? 'rounded-2xl border border-slate-200 bg-slate-50/60 p-2 flex flex-col gap-1.5' : undefined}
            >
              {group.devices.length > 1 && (
                <p className="text-xs font-semibold text-slate-500 px-1">{group.name || 'Bệnh nhân'}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                {group.devices.map(([devId, session]) => (
                  <div
                    key={devId}
                    className={`relative rounded-xl border text-left text-sm transition ${
                      activeDeviceId === devId
                        ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-300'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveDeviceId(devId);
                        setLive(null);
                        setEvents([]);
                        setError('');
                        setConnected(false);
                        setDeviceOnline(null);
                      }}
                      className="px-3 py-2 pr-7 text-left w-full"
                    >
                      <p className="font-semibold text-slate-800">
                        {group.devices.length === 1
                          ? (session.patient_name || 'Bệnh nhân')
                          : (session.device_name || devId)}
                      </p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{devId}</p>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void closeSession(devId); }}
                      title="Đóng phiên"
                      className="absolute top-1 right-1 p-0.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Grid overview \u2014 visible only in grid mode \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(sessionsMap).map(([devId, session]) => (
            <DeviceSummaryCard
              key={devId}
              deviceId={devId}
              consentToken={session.token}
              patientName={session.patient_name}
              deviceName={session.device_name}
              isActive={activeDeviceId === devId}
              onFocus={() => {
                setActiveDeviceId(devId);
                setViewMode('focus');
                setLive(null);
                setEvents([]);
                setError('');
                setConnected(false);
                setDeviceOnline(null);
              }}
            />
          ))}
        </div>
      )}

      {/* ── Clinical detail \u2014 visible only in focus mode \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      {viewMode === 'focus' && (<>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Doctor Clinical Monitor</h1>
          <p className="text-sm text-slate-500">
            {sessionsMap[activeDeviceId]?.patient_name && (
              <><span className="font-semibold text-slate-700">{sessionsMap[activeDeviceId]?.patient_name}</span> · </>
            )}
            Thiết bị: <span className="font-mono">{deviceId}</span>
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          <PlugZap className="w-4 h-4" /> {connected ? 'Realtime Connected' : 'Disconnected'}
        </div>
        {deviceOnline !== null && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
            deviceOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              deviceOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
            }`} />
            Thiết bị {deviceOnline ? 'Online' : 'Offline'}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <VitalRealtimeCard
          label="Nhịp tim"
          field="heart_rate"
          value={latestSnapshot.hr}
          data={doctorMiniTrendData}
          dataKey="heart_rate"
          icon={<HeartPulse className="w-4 h-4" />}
        />
        <VitalRealtimeCard
          label="SpO2"
          field="spo2"
          value={latestSnapshot.spo2}
          data={doctorMiniTrendData}
          dataKey="spo2"
          icon={<Activity className="w-4 h-4" />}
        />
        <VitalRealtimeCard
          label="Nhiệt độ"
          field="temperature"
          value={latestSnapshot.temp}
          data={doctorMiniTrendData}
          dataKey="temperature"
          icon={<Activity className="w-4 h-4" />}
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Risk Signal</p>
          <p className={`mt-2 text-lg font-bold ${patientStatus === 'Cảnh báo lâm sàng' ? 'text-red-600' : 'text-emerald-600'}`}>{patientStatus}</p>
          <p className="mt-2 text-xs text-slate-500">Rule-based demo (MVP)</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">ECG (điện tim)</h2>
        {!doctorEcgData.length ? (
          <p className="text-sm text-slate-500">Chưa có dữ liệu ECG realtime.</p>
        ) : (
          <div className="h-28 w-full rounded-xl border border-slate-100 bg-slate-50 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={doctorEcgData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="i" hide />
                <YAxis stroke="#64748b" width={32} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(3)} mV`, 'ECG']} />
                <Line type="monotone" dataKey="value" name="ECG" stroke="#0ea5e9" strokeWidth={1.8} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Risk Score (24h)"
          value={toNumber(clinical?.ai_summary?.risk_score)}
          unit="/10"
          icon={<AlertTriangle className="w-4 h-4" />}
          precision={1}
        />
        <MetricCard
          label="Nhịp tim TB"
          value={toNumber(clinical?.stats?.avg_heart_rate)}
          unit="bpm"
          icon={<HeartPulse className="w-4 h-4" />}
          precision={1}
        />
        <MetricCard
          label="SpO2 thấp nhất"
          value={toNumber(clinical?.stats?.min_spo2)}
          unit="%"
          icon={<Activity className="w-4 h-4" />}
          precision={1}
        />
        <MetricCard
          label="Số mẫu bất thường"
          value={toNumber(clinical?.stats?.abnormal_count)}
          unit="mẫu"
          icon={<AlertTriangle className="w-4 h-4" />}
          precision={0}
        />
      </div>

      {clinical?.ai_summary?.clinical_alert && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-700 text-sm">
          <span className="font-semibold">Clinical Alert:</span> {clinical.ai_summary.clinical_alert}
        </div>
      )}

      <section className={`rounded-2xl border p-5 ${AI_STATUS_STYLES[aiSummary?.overall_status ?? 'unknown'].box}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/80 p-2 border border-white">
              <BrainCircuit className={`w-5 h-5 ${AI_STATUS_STYLES[aiSummary?.overall_status ?? 'unknown'].text}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-800">AI chan doan tong hop</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${AI_STATUS_STYLES[aiSummary?.overall_status ?? 'unknown'].badge}`}>
                  {AI_STATUS_STYLES[aiSummary?.overall_status ?? 'unknown'].label}
                </span>
              </div>
              <p className={`mt-1 text-sm font-medium ${AI_STATUS_STYLES[aiSummary?.overall_status ?? 'unknown'].text}`}>
                {isAiSummaryLoading ? 'Dang tong hop du lieu AI...' : isAiSummaryError ? 'Khong the tai tong hop AI' : aiSummary?.headline || 'Chua co ket qua AI'}
              </p>
              {aiSummary?.summary && <p className="mt-1 text-sm text-slate-600">{aiSummary.summary}</p>}
              {aiSummary?.status_reason && <p className="mt-1 text-xs text-slate-500">Ly do: {aiSummary.status_reason}</p>}
              <p className="mt-1 text-xs text-slate-500">Chi hien thi khi co du lieu doi chieu day du.</p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>{aiSummary?.window.sample_count ?? 0} ket qua AI gan nhat</div>
            {aiSummary?.window.to && <div>Cap nhat {new Date(aiSummary.window.to).toLocaleTimeString('vi-VN')}</div>}
          </div>
        </div>

        {aiSummary && Object.keys(aiSummary.models).length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(aiSummary.models).map(([modelName, model]) => {
              const styles = AI_STATUS_STYLES[model.status];
              const confidence = typeof model.latest.confidence === 'number'
                ? `${Math.round(model.latest.confidence * 100)}%`
                : 'N/A';
              return (
                <div key={modelName} className="rounded-xl border border-white/80 bg-white/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {modelName === 'vitals-risk' ? 'Sinh hieu tong hop' : modelName === 'ecg-arrhythmia' ? 'ECG arrhythmia' : modelName}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles.badge}`}>{styles.label}</span>
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <span className={`text-xl font-bold ${styles.text}`}>{model.latest.prediction_label}</span>
                    <span className="text-xs text-slate-500 mb-1">confidence {confidence}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Ket qua de bac si tham khao, khong phai canh bao tung mau realtime.</p>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          {aiSummary?.disclaimer || 'AI chi ho tro tham khao, can doi chieu voi lam sang va du lieu do thuc te.'}
        </p>
        <a href="/dashboard/ai-diagnosis" className="mt-3 inline-flex text-sm font-semibold text-sky-700 hover:text-sky-800">
          Xem lich su AI va du lieu dau vao
        </a>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Biểu đồ realtime / xu hướng</h2>
        {!realtimeChartData.length ? (
          <p className="text-sm text-slate-500">Chưa có dữ liệu realtime để vẽ biểu đồ.</p>
        ) : (
          <div className="space-y-4">
            {realtimeSeriesPointCount < 2 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Chưa đủ dữ liệu để tạo đường liên tục (cần tối thiểu 2 mẫu). Hệ thống đang hiển thị điểm realtime mới nhất.
              </p>
            )}
            <div className="h-72 w-full rounded-xl border border-slate-100 bg-slate-50 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={realtimeChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" minTickGap={20} stroke="#64748b" />
                  <YAxis yAxisId="left" stroke="#64748b" domain={[40, 140]} />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748b" domain={[85, 100]} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="hr" name="HR realtime" stroke="#ef4444" strokeWidth={2} dot={realtimeSeriesPointCount < 2} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="spo2" name="SpO2 realtime" stroke="#0ea5e9" strokeWidth={2} dot={realtimeSeriesPointCount < 2} connectNulls />
                  <Line yAxisId="left" type="monotone" dataKey="temp" name="Temp realtime" stroke="#f59e0b" strokeWidth={2} dot={realtimeSeriesPointCount < 2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <th className="px-3 py-2 text-left">Bucket</th>
                    <th className="px-3 py-2 text-right">HR TB</th>
                    <th className="px-3 py-2 text-right">SpO2 Min</th>
                    <th className="px-3 py-2 text-right">Temp TB</th>
                    <th className="px-3 py-2 text-right">ECG Samples</th>
                    <th className="px-3 py-2 text-right">Abnormal</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.slice(0, 20).map((t, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-2">{t.bucket_time ? new Date(t.bucket_time).toLocaleString('vi-VN') : '—'}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(toNumber(t.avg_heart_rate), 1)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(toNumber(t.min_spo2), 1)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(toNumber(t.avg_temperature), 1)}</td>
                      <td className="px-3 py-2 text-right">{t.ecg_samples ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{t.abnormal_count ?? '—'}</td>
                    </tr>
                  ))}
                  {!trends.length && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={6} className="px-3 py-3 text-center text-slate-500">
                        Chưa có bucket trend tổng hợp, đang hiển thị biểu đồ realtime bên trên.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Lịch sử gần nhất (API guarded by consent)</h2>
        {!historyWithRealtime.length ? (
          <p className="text-sm text-slate-500">Chưa có dữ liệu lịch sử.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <th className="px-3 py-2 text-left">Thời gian</th>
                  <th className="px-3 py-2 text-right">HR</th>
                  <th className="px-3 py-2 text-right">SpO2</th>
                  <th className="px-3 py-2 text-right">Temp</th>
                  <th className="px-3 py-2 text-right">ECG</th>
                  <th className="px-3 py-2 text-left">Session</th>
                </tr>
              </thead>
              <tbody>
                {historyWithRealtime.slice(0, 20).map((r, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.time ? new Date(r.time).toLocaleString('vi-VN') : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.heart_rate ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{r.spo2 ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{r.temperature ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{r.ecg_value ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.session_id ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Realtime Events</h2>
        {!events.length ? (
          <p className="text-sm text-slate-500">Chưa nhận được gói realtime.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {events.map((e, idx) => (
              <div key={idx} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 flex items-center justify-between gap-2">
                <span>{new Date(e.received_at ?? Date.now()).toLocaleTimeString('vi-VN')}</span>
                <span className="font-mono">HR {e.hr ?? '—'} | SpO2 {e.spo2 ?? '—'} | Temp {e.temp ?? '—'} | ECG {e.ecg ?? '—'}</span>
                {((e.hr ?? 0) > 120 || (e.spo2 ?? 100) < 92 || (e.temp ?? 0) > 38.5) && (
                  <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><AlertTriangle className="w-3 h-3" /> Alert</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      </>)} {/* end viewMode === 'focus' */}
    </div>
  );
}

function MetricCard({ label, value, unit, icon, precision = 1 }: { label: string; value: number | null; unit: string; icon: React.ReactNode; precision?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1">{icon} {label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800">{formatNumber(value, precision)} <span className="text-sm text-slate-500">{unit}</span></p>
    </div>
  );
}

function VitalRealtimeCard({
  label,
  field,
  value,
  data,
  dataKey,
  icon,
}: {
  label: string;
  field: keyof typeof VITAL_CONFIG;
  value: number | null;
  data: Array<{ time: string; heart_rate: number | null; spo2: number | null; temperature: number | null }>;
  dataKey: 'heart_rate' | 'spo2' | 'temperature';
  icon: React.ReactNode;
}) {
  const status = getFieldStatus(field, value);
  const cfg = VITAL_CONFIG[field];

  const badgeClass = status === 'danger'
    ? 'bg-red-100 text-red-700'
    : status === 'warning'
      ? 'bg-amber-100 text-amber-700'
      : status === 'normal'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-slate-100 text-slate-500';

  const chartStroke = status === 'danger' ? '#ef4444' : status === 'warning' ? '#f59e0b' : cfg.stroke;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1">{icon} {label}</p>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
          {status === 'danger' ? 'Cảnh báo' : status === 'warning' ? 'Chú ý' : status === 'normal' ? 'Bình thường' : 'N/A'}
        </span>
      </div>

      <p className="text-3xl font-bold text-slate-800">
        {formatNumber(value, cfg.precision)} <span className="text-sm text-slate-500">{cfg.unit}</span>
      </p>

      <div className="h-20">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.slice(-30)} margin={{ top: 2, right: 2, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="time" hide />
            <YAxis domain={[cfg.min * 0.95, cfg.max * 1.05]} tick={{ fontSize: 9 }} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v) => [`${formatNumber(toNumber(v), cfg.precision)} ${cfg.unit}`, label]}
            />
            <ReferenceLine y={cfg.min} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
            <ReferenceLine y={cfg.max} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
            <Line type="monotone" dataKey={dataKey} stroke={chartStroke} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
