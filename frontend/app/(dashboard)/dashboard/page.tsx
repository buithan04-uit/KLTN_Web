'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  ecg_points?: number[] | null;
  ecg_lcd_points?: number[] | null;
  type?: string;
  mode?: string;
  fs?: number | null;
  n?: number | null;
  r_peak_index?: number | null;
  normalized?: boolean | null;
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
  ts?: string;
};

function normalizeNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return points.length ? points : null;
}

function getEcgDisplayPoints(record?: HealthRecord | null): Array<number | null> | null {
  const lcdPoints = normalizeNumberArray(record?.ecg_lcd_points);
  if (lcdPoints) return lcdPoints;
  return normalizeNumberArray(record?.ecg_points);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getEcgQuality(clipPct?: number | null) {
  if (typeof clipPct !== 'number') {
    return { label: 'Chưa rõ chất lượng', className: 'bg-slate-100 text-slate-600', hint: 'Chưa có clip_pct từ firmware.' };
  }
  if (clipPct <= 10) {
    return { label: 'Tín hiệu tốt', className: 'bg-emerald-100 text-emerald-700', hint: 'Ít cắt biên, có thể quan sát dạng sóng.' };
  }
  if (clipPct < 30) {
    return { label: 'Nhiễu vừa', className: 'bg-amber-100 text-amber-700', hint: 'Vẫn xem được nhịp, hạn chế đọc biên độ.' };
  }
  return { label: 'Cắt biên mạnh', className: 'bg-red-100 text-red-700', hint: 'Không nên dùng để nhận định ECG chuyên môn.' };
}

function getRecordEcgSummary(record: HealthRecord) {
  const pointsCount = normalizeNumberArray(record.ecg_points)?.length ?? 0;
  const type = record.type || (record.note === 'ecg_frame' ? 'ecg_frame' : record.note === 'ecg_ai_window_normalized' ? 'ecg_ai_window' : null);
  if (type === 'ecg_frame') {
    return {
      label: `ECG frame${pointsCount ? ` (${pointsCount} mau)` : ''}`,
      detail: record.clip_pct !== null && record.clip_pct !== undefined ? `clip ${record.clip_pct.toFixed(0)}%` : 'dang song',
    };
  }
  if (type === 'ecg_ai_window') {
    return { label: 'AI window', detail: pointsCount ? `${pointsCount} mau` : 'input AI' };
  }
  return {
    label: record.ecg_value !== null && record.ecg_value !== undefined ? record.ecg_value.toFixed(2) : '-',
    detail: 'raw/debug',
  };
}

function isEcgAiWindowPayload(payload: RealtimeVitalsPayload) {
  return payload.type === 'ecg_ai_window' || payload.mode === 'ecg_ai';
}

function hasVitalScalarPayload(payload: RealtimeVitalsPayload) {
  return typeof payload.hr === 'number'
    || typeof payload.spo2 === 'number'
    || typeof payload.temp === 'number';
}

function isEcgFramePayload(payload: RealtimeVitalsPayload) {
  return payload.type === 'ecg_frame';
}

function shouldBufferRealtimeRecord(payload: RealtimeVitalsPayload) {
  return isEcgFramePayload(payload) || hasVitalScalarPayload(payload);
}

function mergeRealtimePayload(previous: RealtimeVitalsPayload | undefined, incoming: RealtimeVitalsPayload): RealtimeVitalsPayload {
  if (!previous) return incoming;
  return {
    ...previous,
    ...incoming,
    hr: incoming.hr ?? previous.hr ?? null,
    spo2: incoming.spo2 ?? previous.spo2 ?? null,
    temp: incoming.temp ?? previous.temp ?? null,
    ecg: incoming.ecg ?? previous.ecg ?? null,
    ts: incoming.ts ?? previous.ts,
  };
}

function hasVitalsSummary(record: HealthRecord) {
  return record.heart_rate !== null
    || record.spo2 !== null
    || record.temperature !== null
    || record.systolic_bp !== null
    || record.diastolic_bp !== null
    || record.map !== null;
}

const ECG_SWEEP_CAPACITY = 1500;
const ECG_TARGET_DELAY_SECONDS = 0.45;
const ECG_MAX_DELAY_SECONDS = 0.9;
const ECG_LCD_INVERT = true;

function EcgSweepCanvas({
  frames,
  isLcdDisplay,
  samplingRate,
}: {
  frames: HealthRecord[];
  isLcdDisplay: boolean;
  samplingRate: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const queueRef = useRef<number[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const bufferRef = useRef<number[]>(Array.from({ length: ECG_SWEEP_CAPACITY }, () => NaN));
  const cursorRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const sampleCarryRef = useRef(0);
  const valueRangeRef = useRef({ min: 0, max: 240 });
  const streamKey = frames.at(-1)?.device_id || frames[0]?.device_id || '';

  useEffect(() => {
    queueRef.current = [];
    seenRef.current = new Set();
    bufferRef.current = Array.from({ length: ECG_SWEEP_CAPACITY }, () => NaN);
    cursorRef.current = 0;
    lastFrameTimeRef.current = null;
    sampleCarryRef.current = 0;
  }, [streamKey]);

  useEffect(() => {
    const maxQueuedSamples = Math.max(64, Math.round((samplingRate || 250) * ECG_MAX_DELAY_SECONDS));
    for (const frame of frames) {
      const key = `${frame.device_id}|${frame.ecg_seq ?? frame.time}|${frame.ecg_start_ms ?? ''}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      const points = getEcgDisplayPoints(frame)?.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) || [];
      if (points.length) queueRef.current.push(...points);
    }
    if (queueRef.current.length > maxQueuedSamples) {
      queueRef.current = queueRef.current.slice(-maxQueuedSamples);
    }
    if (seenRef.current.size > 400) {
      seenRef.current = new Set(Array.from(seenRef.current).slice(-200));
    }
  }, [frames, samplingRate]);

  useEffect(() => {
    let animationId = 0;

    const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);
      const minor = 16 * dpr;
      const major = 80 * dpr;
      ctx.lineWidth = 1 * dpr;
      for (let x = 0; x <= width; x += minor) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += minor) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.lineWidth = 1.25 * dpr;
      for (let x = 0; x <= width; x += major) {
        ctx.strokeStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += major) {
        ctx.strokeStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    };

    const draw = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      if (lastFrameTimeRef.current === null) lastFrameTimeRef.current = now;
      const elapsed = Math.min(0.12, (now - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = now;
      const fs = Math.max(1, samplingRate || 250);
      const targetQueuedSamples = Math.max(32, Math.round(fs * ECG_TARGET_DELAY_SECONDS));
      const queueSize = queueRef.current.length;
      const adaptiveRate = queueSize > targetQueuedSamples * 1.5
        ? fs * 1.25
        : queueSize < targetQueuedSamples * 0.45
          ? fs * 0.82
          : fs;
      sampleCarryRef.current += elapsed * adaptiveRate;
      const consumeCount = Math.min(queueRef.current.length, Math.floor(sampleCarryRef.current));
      sampleCarryRef.current -= consumeCount;

      for (let i = 0; i < consumeCount; i += 1) {
        const sample = queueRef.current.shift();
        if (typeof sample !== 'number') break;
        bufferRef.current[cursorRef.current] = sample;
        for (let gap = 1; gap <= 18; gap += 1) {
          bufferRef.current[(cursorRef.current + gap) % ECG_SWEEP_CAPACITY] = NaN;
        }
        cursorRef.current = (cursorRef.current + 1) % ECG_SWEEP_CAPACITY;
      }

      const finite = bufferRef.current.filter((value) => Number.isFinite(value));
      if (finite.length && !isLcdDisplay) {
        const min = Math.min(...finite);
        const max = Math.max(...finite);
        const pad = Math.max(0.25, (max - min) * 0.2);
        valueRangeRef.current = { min: min - pad, max: max + pad };
      } else if (isLcdDisplay) {
        valueRangeRef.current = { min: 0, max: 240 };
      }

      drawGrid(ctx, width, height, dpr);
      const { min, max } = valueRangeRef.current;
      const span = Math.max(1, max - min);
      const xStep = width / (ECG_SWEEP_CAPACITY - 1);
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 1.8 * dpr;
      ctx.beginPath();
      let drawing = false;
      for (let i = 0; i < ECG_SWEEP_CAPACITY; i += 1) {
        const value = bufferRef.current[i];
        if (!Number.isFinite(value)) {
          drawing = false;
          continue;
        }
        const x = i * xStep;
        const y = isLcdDisplay
          ? ECG_LCD_INVERT
            ? height - (value / 240) * height
            : (value / 240) * height
          : height - ((value - min) / span) * height;
        if (!drawing) {
          ctx.moveTo(x, y);
          drawing = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      const cursorX = cursorRef.current * xStep;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.25 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [isLcdDisplay, samplingRate]);

  return <canvas ref={canvasRef} className="h-full w-full rounded-xl" />;
}

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
    ecg_points: normalizeNumberArray(payload.ecg_points),
    ecg_lcd_points: normalizeNumberArray(payload.ecg_lcd_points),
    ecg_sampling_rate: typeof payload.fs === 'number' ? payload.fs : null,
    r_peak_index: typeof payload.r_peak_index === 'number' ? payload.r_peak_index : null,
    normalized: payload.normalized ?? null,
    type: payload.type ?? null,
    mode: payload.mode ?? null,
    ecg_unit: payload.ecg_unit ?? null,
    ecg_source: payload.ecg_source ?? null,
    ecg_display: payload.ecg_display ?? null,
    ecg_seq: typeof payload.ecg_seq === 'number' ? payload.ecg_seq : null,
    ecg_start_ms: typeof payload.ecg_start_ms === 'number' ? payload.ecg_start_ms : null,
    min_mv: typeof payload.min_mv === 'number' ? payload.min_mv : null,
    max_mv: typeof payload.max_mv === 'number' ? payload.max_mv : null,
    p2p_mv: typeof payload.p2p_mv === 'number' ? payload.p2p_mv : null,
    clip_pct: typeof payload.clip_pct === 'number' ? payload.clip_pct : null,
    hr_ecg: typeof payload.hr_ecg === 'number' ? payload.hr_ecg : null,
    hr_ppg: typeof payload.hr_ppg === 'number' ? payload.hr_ppg : null,
    hr_source: payload.hr_source ?? null,
    session_id: null,
    is_abnormal: false,
    note: payload.type === 'ecg_frame' ? 'ecg_frame' : payload.type === 'ecg_ai_window' ? 'ecg_ai_window_normalized' : null,
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
    r.type ?? r.note ?? 'n',
    r.ecg_seq ?? 'n',
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
  const frameRecords = data.filter((r) => (r.type === 'ecg_frame' || r.note === 'ecg_frame') && Array.isArray(r.ecg_points));
  const latestFrameRecord = frameRecords.at(-1);
  const displayFrameRecords = frameRecords;
  const latestWaveRecord = latestFrameRecord;
  const isFrame = latestWaveRecord?.type === 'ecg_frame' || latestWaveRecord?.note === 'ecg_frame';
  const isMeasureAllFrame = latestWaveRecord?.mode === 'measure_all' || latestWaveRecord?.mode === 'measureall';
  const numericPoints = displayFrameRecords
    .flatMap((record) => getEcgDisplayPoints(record)?.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) || []);
  const visibleSampleCount = Math.min(numericPoints.length, ECG_SWEEP_CAPACITY);
  const isLcdDisplay = Boolean(isFrame && normalizeNumberArray(latestWaveRecord?.ecg_lcd_points));
  const unit = isLcdDisplay ? 'LCD px' : latestWaveRecord?.ecg_unit || 'mV';
  const quality = getEcgQuality(latestWaveRecord?.clip_pct);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 col-span-full">
      <div className="flex items-center gap-2.5 mb-3">
        <Activity className="w-5 h-5 text-sky-500" />
        <span className="text-sm font-semibold text-slate-700">ECG (điện tim)</span>
        {isFrame && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${quality.className}`}>{quality.label}</span>}
        {isMeasureAllFrame && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">MeasureAll</span>}
        <span className="ml-auto text-xs text-slate-400">
          {isFrame
            ? `${visibleSampleCount} mau ECG | ${isLcdDisplay ? 'LCD' : 'mV'} | ${latestWaveRecord?.mode ?? 'ecg'} | ${latestWaveRecord?.ecg_sampling_rate ?? 250}Hz | HR ${latestWaveRecord?.heart_rate ?? '-'}`
            : 'Dang cho ECG frame realtime'}
        </span>
      </div>
      {isMeasureAllFrame ? (
        <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-4">
          <span>MQTT: <b className="text-slate-800">receiving</b></span>
          <span>Frame: <b className="text-slate-800">{latestWaveRecord?.ecg_seq ?? '-'}</b></span>
          <span>Samples: <b className="text-slate-800">{latestWaveRecord?.ecg_points?.length ?? latestWaveRecord?.ecg_lcd_points?.length ?? '-'}</b></span>
          <span>HR ECG: <b className="text-slate-800">{latestWaveRecord?.heart_rate ?? '-'}</b></span>
          <span>P2P: <b className="text-slate-800">{latestWaveRecord?.p2p_mv?.toFixed?.(0) ?? '-'} mV</b></span>
          <span>Clip: <b className="text-slate-800">{latestWaveRecord?.clip_pct?.toFixed?.(0) ?? '-'}%</b></span>
          <span>Fs: <b className="text-slate-800">{latestWaveRecord?.ecg_sampling_rate ?? '-'}Hz</b></span>
          <span>{quality.hint}</span>
        </div>
      ) : !numericPoints.length ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
          Chưa có ecg_frame realtime để vẽ sóng ECG.
        </div>
      ) : (
      <div
        className="h-64 w-full rounded-xl border border-slate-100"
      >
        <EcgSweepCanvas
          frames={displayFrameRecords.slice(-80)}
          isLcdDisplay={isLcdDisplay}
          samplingRate={latestWaveRecord?.ecg_sampling_rate ?? 250}
        />
      </div>
      )}
      {isFrame && !isMeasureAllFrame && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
          <span>Biên độ đỉnh-đỉnh: <b>{latestWaveRecord?.p2p_mv?.toFixed?.(0) ?? '-'} mV</b></span>
          <span>Cắt biên: <b>{latestWaveRecord?.clip_pct?.toFixed?.(0) ?? '-'}%</b></span>
          <span>Nguồn nhịp: <b>{latestWaveRecord?.hr_source || '-'}</b></span>
          <span>{quality.hint}</span>
        </div>
      )}
    </div>
  );
}

// ─── Recent table ─────────────────────────────────────────────────────────────
function RecordsTable({ records }: { records: HealthRecord[] }) {
  const recent = [...records].filter(hasVitalsSummary).reverse().slice(0, 10);
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
                  {(() => {
                    const ecg = getRecordEcgSummary(r);
                    return `${ecg.label} | ${ecg.detail}`;
                  })()}
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
  normal: { box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'Ổn định' },
  warning: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: 'Cần theo dõi' },
  danger: { box: 'border-red-200 bg-red-50', text: 'text-red-800', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500', label: 'Cần bác sĩ xem xét' },
  unknown: { box: 'border-slate-200 bg-white', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-300', label: 'Chưa đủ dữ liệu' },
};

const ECG_LABELS: Record<string, string> = {
  N: 'Nhịp tim bình thường',
  S: 'Ngoại tâm thu trên thất',
  V: 'Ngoại tâm thu thất',
  F: 'Nhịp hợp nhất',
  Q: 'Khác/không rõ',
};

function getReadableAiLabel(modelName: string, label: string) {
  if (modelName === 'ecg-arrhythmia') {
    if (/uncertain/i.test(label)) return 'ECG chưa đủ tin cậy';
    if (/possible/i.test(label)) return label.replace(/possible/i, 'Nghi ngờ');
    return ECG_LABELS[label] ? `${label} - ${ECG_LABELS[label]}` : label;
  }
  if (modelName === 'vitals-risk' || modelName === 'vitals-risk-assessment') {
    if (/low/i.test(label)) return 'Low Risk - Ổn định';
    if (/high/i.test(label)) return 'High Risk - Nguy cơ cao';
  }
  return label;
}

function getReadableAiLabelWithConfidence(modelName: string, label: string, confidence?: number | null) {
  if (modelName === 'ecg-arrhythmia' && typeof confidence === 'number' && confidence < 0.6) {
    return `Chưa đủ tin cậy (${label})`;
  }
  return getReadableAiLabel(modelName, label);
}

function normalizeModelStatus(modelName: string, label: string, status: AiStatus, confidence?: number | null): AiStatus {
  const hasConfidence = typeof confidence === 'number';
  if (modelName === 'vitals-risk' || modelName === 'vitals-risk-assessment') {
    if (/low|normal/i.test(label)) return 'normal';
    if (/high|danger/i.test(label)) return 'danger';
  }
  if (modelName === 'ecg-arrhythmia') {
    if (/uncertain/i.test(label)) return 'unknown';
    if (/possible/i.test(label)) return 'warning';
    if (label === 'N' || /normal/i.test(label)) return 'normal';
    if ((label === 'V' || label === 'F') && hasConfidence && confidence < 0.6) return 'unknown';
    if ((label === 'S' || label === 'Q') && hasConfidence && confidence < 0.6) return 'unknown';
  }
  return status;
}

const formatAiConfidence = (value: number | null | undefined) => {
  if (typeof value !== 'number') return 'N/A';
  const pct = value * 100;
  if (pct >= 99.5 && pct < 100) return '>=99.5%';
  return `${pct.toFixed(1)}%`;
};

function AiSummaryPanel({ summary, loading, error }: { summary?: AiSummary; loading: boolean; error: string }) {
  const status = summary?.overall_status ?? 'unknown';
  const styles = AI_STATUS_STYLES[status];
  const models = summary ? Object.entries(summary.models) : [];
  const vitalsModel = summary?.models['vitals-risk-assessment'] || summary?.models['vitals-risk'];
  const ecgModel = summary?.models['ecg-arrhythmia'];
  const vitalsStatus = vitalsModel
    ? normalizeModelStatus(vitalsModel.latest.model_name, vitalsModel.latest.prediction_label, vitalsModel.status, vitalsModel.latest.confidence)
    : undefined;
  const ecgStatus = ecgModel
    ? normalizeModelStatus('ecg-arrhythmia', ecgModel.latest.prediction_label, ecgModel.status, ecgModel.latest.confidence)
    : undefined;
  const hasEcgInput = Boolean(ecgModel && ecgModel.sample_count > 0 && ecgStatus !== 'unknown');
  const hasImportantAlert = status === 'danger' || status === 'warning';

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${hasImportantAlert ? styles.box : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/80 p-2 border border-white">
            <BrainCircuit className={`w-5 h-5 ${styles.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">AI theo dõi</h2>
              {hasImportantAlert && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${styles.badge}`}>
                  <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
                  {styles.label}
                </span>
              )}
            </div>
            <p className={`mt-1 text-sm font-medium ${styles.text}`}>
              {loading
                ? 'Đang tổng hợp dữ liệu gần đây...'
                : error || (hasImportantAlert ? summary?.headline : 'Sinh hiệu đang ổn định. ECG chỉ hiển thị khi có dữ liệu đủ điều kiện.')}
            </p>
            {hasImportantAlert && summary?.summary && <p className="mt-1 text-sm text-slate-600">{summary.summary}</p>}
            {hasImportantAlert && summary?.status_reason && <p className="mt-1 text-xs text-slate-500">Lý do: {summary.status_reason}</p>}
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{summary?.window.sample_count ?? 0} kết quả AI gần nhất</div>
          {summary?.window.to && <div>Cập nhật {new Date(summary.window.to).toLocaleTimeString('vi-VN')}</div>}
        </div>
      </div>

      {models.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {vitalsModel && (() => {
            const modelStyles = AI_STATUS_STYLES[vitalsStatus ?? vitalsModel.status];
            return (
            <div className={`rounded-xl border p-3 ${modelStyles.box}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">Sinh hiệu tổng hợp</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modelStyles.badge}`}>
                  {modelStyles.label}
                </span>
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className={`text-lg font-bold ${modelStyles.text}`}>
                  {getReadableAiLabel(vitalsModel.latest.model_name, vitalsModel.latest.prediction_label)}
                </span>
                <span className="text-xs text-slate-500 mb-0.5">
                  xác suất {formatAiConfidence(vitalsModel.latest.confidence)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Theo dõi nhỏ gọn khi ổn định; chỉ cảnh báo khi sinh hiệu bất thường rõ.
              </p>
            </div>
            );
          })()}
          {hasEcgInput && ecgModel && (() => {
            const modelStyles = AI_STATUS_STYLES[ecgStatus ?? ecgModel.status];
            return (
              <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">Điện tim ECG</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modelStyles.badge}`}>
                    {modelStyles.label}
                  </span>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className={`text-lg font-bold ${modelStyles.text}`}>
                    {getReadableAiLabelWithConfidence('ecg-arrhythmia', ecgModel.latest.prediction_label, ecgModel.latest.confidence)}
                  </span>
                  <span className="text-xs text-slate-500 mb-1">
                    xác suất {formatAiConfidence(ecgModel.latest.confidence)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Tổng hợp {ecgModel.sample_count} kết quả ECG đủ điều kiện trong cửa sổ hiện tại.
                </p>
              </div>
            );
          })()}
          {!vitalsModel && !hasEcgInput && models.map(([modelName, model]) => {
            const modelStyles = AI_STATUS_STYLES[model.status];
            return (
              <div key={modelName} className="rounded-xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {modelName === 'vitals-risk' ? 'Sinh hiệu tổng hợp' : modelName === 'ecg-arrhythmia' ? 'Điện tim ECG' : modelName}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modelStyles.badge}`}>
                    {modelStyles.label}
                  </span>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className={`text-xl font-bold ${modelStyles.text}`}>{getReadableAiLabel(modelName, model.latest.prediction_label)}</span>
                  <span className="text-xs text-slate-500 mb-1">xác suất {formatAiConfidence(model.latest.confidence)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Tổng hợp {model.sample_count} kết quả trong cửa sổ dữ liệu hiện tại.
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        {summary?.disclaimer || 'AI chỉ hỗ trợ tham khảo trong quá trình theo dõi, không thay thế chẩn đoán của bác sĩ.'}
      </p>
      <a href="/dashboard/ai-diagnosis" className="mt-3 inline-flex text-sm font-semibold text-sky-700 hover:text-sky-800">
        Xem lại kết quả và dữ liệu đối chiếu
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
  const liveBufferRef = useRef<Record<string, RealtimeVitalsPayload>>({});
  const recordBufferRef = useRef<Record<string, HealthRecord[]>>({});

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
        const realtimeRecord = toRealtimeHealthRecord(payload, incomingId);
        const isAiWindow = isEcgAiWindowPayload(payload);
        if (!isAiWindow && shouldBufferRealtimeRecord(payload)) {
          liveBufferRef.current[incomingId] = mergeRealtimePayload(liveBufferRef.current[incomingId], payload);
          recordBufferRef.current[incomingId] = [
            ...(recordBufferRef.current[incomingId] || []),
            realtimeRecord,
          ].slice(-120);
        }
      });
    }
    const flushTimer = window.setInterval(() => {
      const liveEntries = Object.entries(liveBufferRef.current);
      const recordEntries = Object.entries(recordBufferRef.current);
      if (!liveEntries.length && !recordEntries.length) return;

      if (liveEntries.length) {
        setLiveByDevice((prev) => {
          const next = { ...prev };
          for (const [incomingId, buffered] of liveEntries) {
            next[incomingId] = mergeRealtimePayload(next[incomingId], buffered);
          }
          return next;
        });
        liveBufferRef.current = {};
      }
      if (recordEntries.length) {
        setRealtimeRecordsByDevice((prev) => {
          const next = { ...prev };
          for (const [incomingId, buffered] of recordEntries) {
            next[incomingId] = [...(next[incomingId] || []), ...buffered].slice(-240);
          }
          return next;
        });
        recordBufferRef.current = {};
      }
    }, 150);
    return () => {
      window.clearInterval(flushTimer);
      sock.disconnect();
    };
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

  const vitalsRecords = records.filter(hasVitalsSummary);
  const latestRecord = vitalsRecords.at(-1) ?? null;
  const latestLive = selectedDeviceId ? liveByDevice[selectedDeviceId] : null;
  const realtimeEcgRecords = selectedDeviceId ? (realtimeRecordsByDevice[selectedDeviceId] || []) : [];
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
              : 'Không thể tải tổng hợp AI'
            : ''
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <VitalCard
          label="Nhịp tim"
          value={latest?.heart_rate ?? null}
          field="heart_rate"
          icon={<Heart className="w-5 h-5" fill="currentColor" />}
          data={vitalsRecords}
          dataKey="heart_rate"
        />
        <VitalCard
          label="SpO₂ (Oxy máu)"
          value={latest?.spo2 ?? null}
          field="spo2"
          icon={<Droplets className="w-5 h-5" />}
          data={vitalsRecords}
          dataKey="spo2"
        />
        <VitalCard
          label="Nhiệt độ cơ thể"
          value={latest?.temperature ?? null}
          field="temperature"
          icon={<Thermometer className="w-5 h-5" />}
          data={vitalsRecords}
          dataKey="temperature"
        />
      </div>

      {/* ── ECG ── */}
      <div className="grid grid-cols-1">
        <EcgCard data={realtimeEcgRecords} />
      </div>

      {/* ── Table ── */}
      <RecordsTable records={records} />
    </div>
  );
}
