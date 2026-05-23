'use client';

import { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import type { HealthRecord } from '@/lib/types';
import { useGetApiHealthHistoryDeviceId, useGetApiDevicesMy } from '@/lib/orval/api';
import type { AdminDevice } from '@/lib/orval/api';
import { aiApi, type AiStatus, type AiSummary } from '@/lib/api/ai';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
import {
  Heart, Activity, Thermometer, Droplets, AlertTriangle,
  Wifi, WifiOff, Cpu, ChevronDown, RefreshCw, BrainCircuit,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';

type RealtimeVitalsPayload = {
  device_id: string;
  hr?: number | null;
  spo2?: number | null;
  temp?: number | null;
  ecg?: number | null;
  ts?: string;
};

function toRealtimeHealthRecord(payload: RealtimeVitalsPayload, fallbackDeviceId: string): HealthRecord {
  const ts = payload.ts && !Number.isNaN(new Date(payload.ts).getTime())
    ? new Date(payload.ts).toISOString()
    : new Date().toISOString();

  return {
    time: ts,
    device_id: payload.device_id || fallbackDeviceId,
    heart_rate: typeof payload.hr === 'number' ? payload.hr : null,
    spo2: typeof payload.spo2 === 'number' ? payload.spo2 : null,
    temperature: typeof payload.temp === 'number' ? payload.temp : null,
    ecg_value: typeof payload.ecg === 'number' ? payload.ecg : null,
    session_id: null,
    is_abnormal: false,
    note: null,
  };
}

function healthRecordKey(r: HealthRecord): string {
  return [
    r.device_id,
    r.time,
    r.heart_rate ?? 'n',
    r.spo2 ?? 'n',
    r.temperature ?? 'n',
    r.ecg_value ?? 'n',
  ].join('|');
}

// ─── Vital thresholds ─────────────────────────────────────────────────────────
const THRESHOLDS = {
  heart_rate: { min: 60, max: 100, unit: 'bpm' },
  spo2: { min: 95, max: 100, unit: '%' },
  temperature: { min: 36.1, max: 37.2, unit: '°C' },
};

function getStatus(field: keyof typeof THRESHOLDS, value: number | null) {
  if (value === null) return 'unknown';
  const { min, max } = THRESHOLDS[field];
  if (value < min || value > max) return 'danger';
  const warnMin = min + (max - min) * 0.1;
  const warnMax = max - (max - min) * 0.1;
  if (value < warnMin || value > warnMax) return 'warning';
  return 'normal';
}

const STATUS_STYLES = {
  normal: { card: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  warning: { card: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  danger: { card: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-500 animate-pulse-ring', badge: 'bg-red-100 text-red-700' },
  unknown: { card: 'bg-slate-50 border-slate-200', text: 'text-slate-500', dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500' },
};

interface VitalCardProps {
  label: string;
  value: number | null;
  field: keyof typeof THRESHOLDS;
  icon: React.ReactNode;
  data: HealthRecord[];
  dataKey: keyof HealthRecord;
}

function VitalCard({ label, value, field, icon, data, dataKey }: VitalCardProps) {
  const status = getStatus(field, value);
  const styles = STATUS_STYLES[status];
  const { unit, min, max } = THRESHOLDS[field];

  const chartData = data.slice(-30).map((r) => ({
    time: new Date(r.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    value: r[dataKey] as number | null,
  }));

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-3 ${styles.card}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`${styles.text}`}>{icon}</div>
          <span className="text-sm font-semibold text-slate-700">{label}</span>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
      </div>

      <div className="flex items-end gap-2">
        <span className={`text-3xl font-bold ${styles.text}`}>
          {value !== null ? value.toFixed(field === 'spo2' ? 1 : field === 'temperature' ? 1 : 0) : '—'}
        </span>
        <span className="text-base text-slate-500 mb-0.5">{unit}</span>
        {status !== 'unknown' && (
          <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
            {status === 'normal' ? 'Bình thường' : status === 'warning' ? 'Chú ý' : 'Cảnh báo'}
          </span>
        )}
      </div>

      <div className="h-20">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 2, right: 2, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="time" hide />
            <YAxis domain={[min * 0.95, max * 1.05]} tick={{ fontSize: 9 }} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              formatter={(v) => [`${(v as number)?.toFixed(1)} ${unit}`, label]}
            />
            <ReferenceLine y={min} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
            <ReferenceLine y={max} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={status === 'danger' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#10b981'}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── ECG mini chart ────────────────────────────────────────────────────────────
function EcgCard({ data }: { data: HealthRecord[] }) {
  const chartData = data
    .slice(-20)
    .flatMap((r) => {
      const points = Array.isArray(r.ecg_points)
        ? r.ecg_points.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        : [];
      if (points.length > 0) return points;
      return typeof r.ecg_value === 'number' ? [r.ecg_value] : [];
    })
    .slice(-240)
    .map((value, i) => ({ i, value }));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 col-span-full">
      <div className="flex items-center gap-2.5 mb-3">
        <Activity className="w-5 h-5 text-sky-500" />
        <span className="text-sm font-semibold text-slate-700">ECG (điện tim)</span>
        <span className="ml-auto text-xs text-slate-400">{data.length} điểm gần nhất</span>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="i" hide />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(v) => [`${(v as number)?.toFixed(3)} mV`, 'ECG']}
            />
            <Line type="monotone" dataKey="value" stroke="#0ea5e9" dot={false} strokeWidth={1.5} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Recent table ─────────────────────────────────────────────────────────────
function RecordsTable({ records }: { records: HealthRecord[] }) {
  const recent = [...records].reverse().slice(0, 10);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Activity className="w-4 h-4 text-slate-500" />
        <span className="font-semibold text-slate-700 text-sm">Bản ghi gần đây</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-5 py-3 text-left font-medium">Thời gian</th>
              <th className="px-4 py-3 text-right font-medium">Nhịp tim</th>
              <th className="px-4 py-3 text-right font-medium">SpO₂</th>
              <th className="px-4 py-3 text-right font-medium">Nhiệt độ</th>
              <th className="px-4 py-3 text-right font-medium">ECG</th>
              <th className="px-4 py-3 text-center font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {recent.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-600 tabular-nums text-xs">
                  {new Date(r.time).toLocaleString('vi-VN')}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">
                  {r.heart_rate?.toFixed(0) ?? '—'} <span className="text-slate-400 text-xs">bpm</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">
                  {r.spo2?.toFixed(1) ?? '—'} <span className="text-slate-400 text-xs">%</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">
                  {r.temperature?.toFixed(1) ?? '—'} <span className="text-slate-400 text-xs">°C</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 text-xs">
                  {r.ecg_value?.toFixed(3) ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.is_abnormal ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" /> Bất thường
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                      Bình thường
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">Chưa có dữ liệu</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
const AI_STATUS_STYLES: Record<AiStatus, { box: string; text: string; badge: string; dot: string; label: string }> = {
  normal: { box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'On dinh' },
  warning: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: 'Can theo doi' },
  danger: { box: 'border-red-200 bg-red-50', text: 'text-red-800', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500', label: 'Can bac si xem xet' },
  unknown: { box: 'border-slate-200 bg-white', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-300', label: 'Chua du du lieu' },
};

function AiSummaryPanel({ summary, loading, error }: { summary?: AiSummary; loading: boolean; error: string }) {
  const status = summary?.overall_status ?? 'unknown';
  const styles = AI_STATUS_STYLES[status];
  const models = summary ? Object.entries(summary.models) : [];

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${styles.box}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/80 p-2 border border-white">
            <BrainCircuit className={`w-5 h-5 ${styles.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Tong hop AI chan doan</h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${styles.badge}`}>
                <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
                {styles.label}
              </span>
            </div>
            <p className={`mt-1 text-sm font-medium ${styles.text}`}>
              {loading ? 'Dang tong hop du lieu gan day...' : error || summary?.headline || 'Chua co ket qua AI'}
            </p>
            {summary?.summary && <p className="mt-1 text-sm text-slate-600">{summary.summary}</p>}
            {summary?.status_reason && <p className="mt-1 text-xs text-slate-500">Ly do: {summary.status_reason}</p>}
            <p className="mt-1 text-xs text-slate-500">Chi hien thi khi co du lieu doi chieu day du.</p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{summary?.window.sample_count ?? 0} ket qua AI gan nhat</div>
          {summary?.window.to && <div>Cap nhat {new Date(summary.window.to).toLocaleTimeString('vi-VN')}</div>}
        </div>
      </div>

      {models.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {models.map(([modelName, model]) => {
            const modelStyles = AI_STATUS_STYLES[model.status];
            const confidence = typeof model.latest.confidence === 'number'
              ? `${Math.round(model.latest.confidence * 100)}%`
              : 'N/A';
            return (
              <div key={modelName} className="rounded-xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {modelName === 'vitals-risk' ? 'Sinh hieu tong hop' : modelName === 'ecg-arrhythmia' ? 'ECG arrhythmia' : modelName}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modelStyles.badge}`}>
                    {modelStyles.label}
                  </span>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className={`text-xl font-bold ${modelStyles.text}`}>{model.latest.prediction_label}</span>
                  <span className="text-xs text-slate-500 mb-1">confidence {confidence}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Tong hop {model.sample_count} ket qua trong cua so du lieu hien tai.
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        {summary?.disclaimer || 'AI chi ho tro tham khao trong qua trinh theo doi, khong thay the chan doan cua bac si.'}
      </p>
      <a href="/dashboard/ai-diagnosis" className="mt-3 inline-flex text-sm font-semibold text-sky-700 hover:text-sky-800">
        Xem lai ket qua va du lieu doi chieu
      </a>
    </div>
  );
}

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [deviceId, setDeviceId] = useState('');
  const [limit, setLimit] = useState(50);

  const { data: myDevicesResp } = useGetApiDevicesMy(
    { include_inactive: false },
    { query: { enabled: !!token } },
  );
  const myDevices = useMemo(
    () =>
      myDevicesResp?.status === 200
        ? ((myDevicesResp.data as { data?: AdminDevice[] }).data ?? [])
        : [],
    [myDevicesResp],
  );
  // Derived: if user hasn't manually chosen yet, auto-use first device
  const selectedDeviceId = deviceId || myDevices[0]?.device_id || '';

  // Real-time device online/offline status via socket.io
  // deviceStatusMap tracks socket-based updates; d.status from REST is the fallback in render
  const [deviceStatusMap, setDeviceStatusMap] = useState<Record<string, 'online' | 'offline'>>({});
  const [liveByDevice, setLiveByDevice] = useState<Record<string, RealtimeVitalsPayload>>({});
  const [realtimeRecordsByDevice, setRealtimeRecordsByDevice] = useState<Record<string, HealthRecord[]>>({});

  // Stable key so the socket only reconnects when the device list changes
  const deviceIdKey = useMemo(
    () => myDevices.map((d) => d.device_id ?? '').filter(Boolean).sort().join(','),
    [myDevices],
  );

  useEffect(() => {
    if (!deviceIdKey) return;
    const devIds = deviceIdKey.split(',');
    const sock = io(API_URL, { transports: ['websocket'] });
    for (const devId of devIds) {
      sock.on(
        `device-status-${devId}`,
        (payload: { device_id: string; status: 'online' | 'offline' }) => {
          setDeviceStatusMap((prev) => ({ ...prev, [payload.device_id]: payload.status }));
        },
      );

      sock.on(`realtime-${devId}`, (payload: RealtimeVitalsPayload) => {
        const incomingId = payload?.device_id || devId;
        setLiveByDevice((prev) => ({ ...prev, [incomingId]: payload }));
        const realtimeRecord = toRealtimeHealthRecord(payload, incomingId);
        setRealtimeRecordsByDevice((prev) => {
          const current = prev[incomingId] || [];
          const next = [...current, realtimeRecord].slice(-180);
          return { ...prev, [incomingId]: next };
        });
      });
    }
    return () => { sock.disconnect(); };
  }, [deviceIdKey]);

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error: queryError,
    refetch,
    dataUpdatedAt,
  } = useGetApiHealthHistoryDeviceId(
    selectedDeviceId,
    { limit },
    { query: { refetchInterval: 15_000, enabled: !!token && !!selectedDeviceId } },
  );

  const {
    data: aiSummary,
    isLoading: isAiSummaryLoading,
    isError: isAiSummaryError,
    error: aiSummaryQueryError,
  } = useQuery({
    queryKey: ['ai-summary', selectedDeviceId],
    queryFn: () => aiApi.getSummary(selectedDeviceId, { limit: 30, token }),
    enabled: !!token && !!selectedDeviceId,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const apiRecords = useMemo<HealthRecord[]>(
    () => (response?.status === 200 ? (response.data as HealthRecord[]) : []),
    [response],
  );
  const records = useMemo<HealthRecord[]>(() => {
    const historyAsc = [...apiRecords].reverse();
    const realtimeAsc = realtimeRecordsByDevice[selectedDeviceId] || [];
    const merged = [...historyAsc, ...realtimeAsc];
    const seen = new Set<string>();
    const unique: HealthRecord[] = [];

    for (const row of merged) {
      const key = healthRecordKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    return unique.slice(-500);
  }, [apiRecords, realtimeRecordsByDevice, selectedDeviceId]);

  const err = queryError as unknown;
  const error = isError ? (err instanceof Error ? err.message : 'Không thể tải dữ liệu') : '';
  const lastUpdated = dataUpdatedAt > 0 ? new Date(dataUpdatedAt) : null;

  const latestRecord = records.at(-1) ?? null;
  const latestLive = selectedDeviceId ? liveByDevice[selectedDeviceId] : null;
  const latest = {
    heart_rate: latestLive?.hr ?? latestRecord?.heart_rate ?? null,
    spo2: latestLive?.spo2 ?? latestRecord?.spo2 ?? null,
    temperature: latestLive?.temp ?? latestRecord?.temperature ?? null,
    ecg_value: latestLive?.ecg ?? latestRecord?.ecg_value ?? null,
    time: latestLive?.ts ?? latestRecord?.time ?? null,
  };
  const abnormalCount = records.filter((r) => r.is_abnormal).length;

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng quan sinh hiệu</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lastUpdated ? `Cập nhật lúc ${lastUpdated.toLocaleTimeString('vi-VN')}` : isLoading ? 'Đang tải...' : 'Chưa có dữ liệu'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* For single-device: show device selector. For multi-device: tab row handles it. */}
          {myDevices.length === 1 && (() => {
            const dev = myDevices[0];
            const isOnline = (deviceStatusMap[dev?.device_id ?? ''] ?? dev?.status) === 'online';
            return (
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm text-sm text-slate-700">
                <Cpu className="w-4 h-4 text-slate-400" />
                <span className="font-medium">{dev?.name || dev?.device_id}</span>
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className={`text-xs ${isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            );
          })()}
          {myDevices.length === 0 && (
            user?.role === 'doctor' || user?.role === 'admin' ? (
              <a
                href="/dashboard/doctor-monitor"
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-sky-300 text-sm text-sky-600 hover:bg-sky-50 transition"
              >
                <Cpu className="w-4 h-4" /> Đến Doctor Monitor →
              </a>
            ) : (
              <a
                href="/dashboard/devices"
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-sky-300 text-sm text-sky-600 hover:bg-sky-50 transition"
              >
                <Cpu className="w-4 h-4" /> Liên kết thiết bị đầu tiên →
              </a>
            )
          )}
          <div className="relative inline-flex items-center">
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="appearance-none bg-white border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-sm text-slate-700 outline-none shadow-sm focus:border-sky-400 cursor-pointer"
            >
              {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n} bản ghi</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={() => { void refetch(); }}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:text-sky-600 hover:border-sky-300 shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* ── Multi-device tabs ── */}
      {myDevices.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {myDevices.map((d) => {
            const isSelected = d.device_id === selectedDeviceId;
            const isOnline = (deviceStatusMap[d.device_id ?? ''] ?? d.status) === 'online';
            return (
              <button
                key={d.device_id}
                type="button"
                onClick={() => setDeviceId(d.device_id ?? '')}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium shrink-0 transition-all ${
                  isSelected
                    ? 'bg-sky-600 border-sky-600 text-white shadow-md shadow-sky-200'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-sky-300 hover:text-sky-600 shadow-sm'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 shrink-0" />
                <span>{d.name || d.device_id}</span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  isOnline
                    ? (isSelected ? 'bg-white animate-pulse' : 'bg-emerald-500 animate-pulse')
                    : (isSelected ? 'bg-white/40' : 'bg-slate-300')
                }`} />
                {!isSelected && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-normal ${
                    isOnline ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 bg-slate-50'
                  }`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Status bar ── */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
        {error ? (
          <WifiOff className="w-4 h-4 text-red-500" />
        ) : (
          <Wifi className="w-4 h-4 text-emerald-500" />
        )}
        <span className="text-sm text-slate-600">
          Thiết bị: <strong className="text-slate-800 font-mono">
            {myDevices.find((d) => d.device_id === selectedDeviceId)?.name || selectedDeviceId || '—'}
          </strong>
        </span>
        <span className="text-slate-300">|</span>
        <span className="text-sm text-slate-600">
          {records.length} bản ghi
        </span>
        {abnormalCount > 0 && (
          <>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              {abnormalCount} cảnh báo
            </span>
          </>
        )}
        {error && (
          <>
            <span className="text-slate-300">|</span>
            <span className="text-sm text-red-600">{error}</span>
          </>
        )}
      </div>

      {/* ── Vital cards ── */}
      <AiSummaryPanel
        summary={aiSummary}
        loading={isAiSummaryLoading}
        error={
          isAiSummaryError
            ? aiSummaryQueryError instanceof Error
              ? aiSummaryQueryError.message
              : 'Khong the tai tong hop AI'
            : ''
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <VitalCard
          label="Nhịp tim"
          value={latest?.heart_rate ?? null}
          field="heart_rate"
          icon={<Heart className="w-5 h-5" fill="currentColor" />}
          data={records}
          dataKey="heart_rate"
        />
        <VitalCard
          label="SpO₂ (Oxy máu)"
          value={latest?.spo2 ?? null}
          field="spo2"
          icon={<Droplets className="w-5 h-5" />}
          data={records}
          dataKey="spo2"
        />
        <VitalCard
          label="Nhiệt độ cơ thể"
          value={latest?.temperature ?? null}
          field="temperature"
          icon={<Thermometer className="w-5 h-5" />}
          data={records}
          dataKey="temperature"
        />
      </div>

      {/* ── ECG ── */}
      <div className="grid grid-cols-1">
        <EcgCard data={records} />
      </div>

      {/* ── Table ── */}
      <RecordsTable records={records} />
    </div>
  );
}
