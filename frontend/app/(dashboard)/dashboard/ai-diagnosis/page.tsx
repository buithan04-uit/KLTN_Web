'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, BrainCircuit, CheckCircle2, FileSearch, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGetApiDevicesMy } from '@/lib/orval/api';
import type { AdminDevice } from '@/lib/orval/api';
import { aiApi, type AiPredictionRow, type AiStatus } from '@/lib/api/ai';
import { consentApi } from '@/lib/api/consent';

type SessionEntry = {
  token: string;
  patient_name: string | null;
  patient_id: number;
  device_name: string | null;
  device_status: string | null;
  expires_at?: string;
};

const STATUS_STYLES: Record<AiStatus, { label: string; badge: string; panel: string; icon: typeof CheckCircle2 }> = {
  normal: { label: 'On dinh', badge: 'bg-emerald-100 text-emerald-700', panel: 'border-emerald-200 bg-emerald-50', icon: CheckCircle2 },
  warning: { label: 'Can theo doi', badge: 'bg-amber-100 text-amber-700', panel: 'border-amber-200 bg-amber-50', icon: AlertTriangle },
  danger: { label: 'Can bac si xem xet', badge: 'bg-red-100 text-red-700', panel: 'border-red-200 bg-red-50', icon: AlertTriangle },
  unknown: { label: 'Chua ro', badge: 'bg-slate-100 text-slate-600', panel: 'border-slate-200 bg-white', icon: FileSearch },
};

function getStatus(modelName: string, label: string | null | undefined): AiStatus {
  const value = String(label || '').trim();
  const lower = value.toLowerCase();
  if (!value) return 'unknown';
  if (modelName === 'vitals-risk') {
    if (lower.includes('high') || lower.includes('danger')) return 'danger';
    if (lower.includes('medium') || lower.includes('moderate')) return 'warning';
    if (lower.includes('low') || lower.includes('normal')) return 'normal';
    return 'warning';
  }
  if (modelName === 'ecg-arrhythmia') {
    if (value === 'N' || lower.includes('normal')) return 'normal';
    if (value === 'V' || value === 'F') return 'danger';
    return 'warning';
  }
  return 'unknown';
}

function getModelLabel(modelName: string) {
  if (modelName === 'vitals-risk') return 'Sinh hieu tong hop';
  if (modelName === 'ecg-arrhythmia') return 'Dien tim ECG';
  return modelName;
}

function getReadableDiagnosis(row: AiPredictionRow) {
  if (row.model_name === 'vitals-risk') {
    if (/high/i.test(row.prediction_label)) return 'Nguy co cao theo sinh hieu';
    if (/low/i.test(row.prediction_label)) return 'Nguy co thap theo sinh hieu';
  }
  if (row.model_name === 'ecg-arrhythmia') {
    const map: Record<string, string> = {
      N: 'Nhip tim binh thuong',
      S: 'Nghi ngoai tam thu tren that',
      V: 'Nghi ngoai tam thu that',
      F: 'Nghi nhip hop nhat',
      Q: 'Khac/khong phan loai ro',
    };
    return map[row.prediction_label] || row.prediction_label;
  }
  return row.prediction_label;
}

function readRaw(row: AiPredictionRow): Record<string, unknown> {
  const snapshot = row.input_snapshot || {};
  const raw = snapshot.raw;

  if (Array.isArray(raw)) {
    const names = Array.isArray(snapshot.feature_order)
      ? snapshot.feature_order.map(String)
      : ['spo2', 'temperature', 'heart_rate', 'map', 'age', 'weight', 'height_m', 'bmi', 'gender'];

    return Object.fromEntries(names.map((name, index) => [name, raw[index]]));
  }

  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : snapshot;
}

function fmt(value: unknown, suffix = '') {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'number') return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
  return `${value}${suffix}`;
}

function EvidenceGrid({ row }: { row: AiPredictionRow }) {
  const raw = readRaw(row);
  const facts = [
    ['HR', fmt(raw.heart_rate ?? raw.hr, ' bpm')],
    ['SpO2', fmt(raw.spo2, '%')],
    ['Nhiet do', fmt(raw.temperature ?? raw.temp, ' C')],
    ['Huyet ap', raw.systolic_bp || raw.diastolic_bp ? `${fmt(raw.systolic_bp)}/${fmt(raw.diastolic_bp)} mmHg` : '--'],
    ['MAP', fmt(raw.map, ' mmHg')],
    ['Tuoi/Gioi', `${fmt(raw.age)} / ${fmt(raw.gender)}`],
  ];

  if (row.model_name === 'ecg-arrhythmia') {
    const windowSize = raw.window_size ?? raw.ecg_points_count;
    facts.push(['ECG window', `${fmt(windowSize)} diem`]);
    if (raw.ecg_quality !== null && raw.ecg_quality !== undefined && raw.ecg_quality !== '') {
      facts.push(['Chat luong ECG', String(raw.ecg_quality)]);
    }
    if (raw.sampling_rate !== null && raw.sampling_rate !== undefined) {
      facts.push(['Tan so lay mau', fmt(raw.sampling_rate, ' Hz')]);
    }
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {facts.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">{value}</p>
        </div>
      ))}
    </div>
  );
}

function formatModelProbability(confidence: number | null) {
  if (typeof confidence !== 'number') return 'N/A';
  const percent = confidence * 100;
  if (percent >= 99.5 && percent < 100) return '>=99.5%';
  return `${percent.toFixed(1)}%`;
}

function PredictionCard({ row }: { row: AiPredictionRow }) {
  const status = getStatus(row.model_name, row.prediction_label);
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  const confidence = formatModelProbability(row.confidence);

  return (
    <article className={`rounded-2xl border p-4 ${style.panel}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-white bg-white/80 p-2">
            <Icon className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">{getReadableDiagnosis(row)}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.badge}`}>{style.label}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {getModelLabel(row.model_name)} | Xac suat mo hinh {confidence}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{new Date(row.health_time || row.created_at).toLocaleString('vi-VN')}</div>
          <div>ID #{row.id}</div>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Activity className="h-3.5 w-3.5" />
          Du lieu dung de doi chieu
        </p>
        <EvidenceGrid row={row} />
      </div>
    </article>
  );
}

function loadConsentSessions(): Record<string, SessionEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('consent_sessions_map');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SessionEntry>;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => !value.expires_at || new Date(value.expires_at).getTime() > now)
    );
  } catch {
    return {};
  }
}

export default function AiDiagnosisPage() {
  const { token, user } = useAuth();
  const [deviceId, setDeviceId] = useState('');
  const [modelName, setModelName] = useState('');
  const [page, setPage] = useState(1);
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [sessionsMap, setSessionsMap] = useState<Record<string, SessionEntry>>({});

  useEffect(() => {
    setSessionsMap(loadConsentSessions());
  }, []);

  const { data: myDevicesResp } = useGetApiDevicesMy(
    { include_inactive: false },
    { query: { enabled: !!token && user?.role !== 'admin' } },
  );

  const patientDevices = useMemo(
    () => myDevicesResp?.status === 200 ? ((myDevicesResp.data as { data?: AdminDevice[] }).data ?? []) : [],
    [myDevicesResp],
  );

  const doctorSessions = useMemo(() => Object.entries(sessionsMap), [sessionsMap]);
  const selectedConsentToken = user?.role === 'doctor' ? sessionsMap[deviceId]?.token : null;
  const effectiveDeviceId = deviceId || patientDevices[0]?.device_id || doctorSessions[0]?.[0] || '';

  useEffect(() => {
    if (!deviceId && effectiveDeviceId) setDeviceId(effectiveDeviceId);
  }, [deviceId, effectiveDeviceId]);

  const predictionsQuery = useQuery({
    queryKey: ['ai-predictions-page', effectiveDeviceId, modelName, page, selectedConsentToken],
    queryFn: () => aiApi.getPredictions(effectiveDeviceId, {
      page,
      limit: 12,
      modelName: modelName || undefined,
      token,
      consentToken: selectedConsentToken,
    }),
    enabled: !!token && !!effectiveDeviceId && (user?.role !== 'doctor' || !!selectedConsentToken),
    refetchInterval: 30_000,
  });

  const disclaimerText = predictionsQuery.data?.disclaimer
    || 'Ket qua AI chi de bac si tham khao trong qua trinh kham chua benh, khong thay the chan doan chuyen mon.';

  const handleVerifyCode = async () => {
    if (!/^\d{6}$/.test(accessCode)) {
      setAccessError('Ma truy cap phai gom 6 chu so.');
      return;
    }
    try {
      setIsVerifying(true);
      setAccessError('');
      const resp = await consentApi.verifyCode(accessCode);
      const { session_token, session, patient_summary } = resp.data;
      const next = {
        ...sessionsMap,
        [patient_summary.device_id]: {
          token: session_token,
          patient_name: patient_summary.full_name,
          patient_id: patient_summary.id,
          device_name: patient_summary.device_name,
          device_status: patient_summary.device_status,
          expires_at: session.expires_at,
        },
      };
      localStorage.setItem('consent_sessions_map', JSON.stringify(next));
      localStorage.setItem('consent_session_token', session_token);
      localStorage.setItem('consent_session_device_id', patient_summary.device_id);
      setSessionsMap(next);
      setDeviceId(patient_summary.device_id);
      setAccessCode('');
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Khong xac thuc duoc ma truy cap.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-sky-600" />
            <h1 className="text-2xl font-bold text-slate-900">Ket qua AI chan doan</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Xem lai ket qua du doan kem du lieu dau vao de bac si doi chieu. Bac si chi xem duoc khi benh nhan da cap ma dong thuan.
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <ShieldCheck className="mr-2 inline h-4 w-4" />
          Du lieu AI duoc bao ve theo phien dong thuan
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {disclaimerText}
      </p>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-700">Cach hieu ket qua AI</p>
        <p className="mt-1">1) AI chi chay khi du thong tin (HR, SpO2, nhiet do, MAP/huyet ap, ho so benh nhan, ECG du cua so).</p>
        <p className="mt-1">2) Ket qua duoc tong hop tu nhieu mau gan day, khong phai canh bao tung mau realtime.</p>
        <p className="mt-1">3) Moi ket qua kem theo du lieu doi chieu de bac si xem lai va so sanh.</p>
      </section>

      {user?.role === 'doctor' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="text-sm font-medium text-slate-700">Nhap ma dong thuan cua benh nhan</label>
              <input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 chu so"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </div>
            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={isVerifying}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {isVerifying ? 'Dang xac thuc...' : 'Mo quyen xem'}
            </button>
          </div>
          {accessError && <p className="mt-2 text-sm text-red-600">{accessError}</p>}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Thiet bi
            {user?.role === 'doctor' ? (
              <select
                value={effectiveDeviceId}
                onChange={(e) => { setDeviceId(e.target.value); setPage(1); }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
              >
                {doctorSessions.length === 0 && <option value="">Chua co phien dong thuan</option>}
                {doctorSessions.map(([id, session]) => (
                  <option key={id} value={id}>{session.patient_name || 'Benh nhan'} - {session.device_name || id}</option>
                ))}
              </select>
            ) : (
              <select
                value={effectiveDeviceId}
                onChange={(e) => { setDeviceId(e.target.value); setPage(1); }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
              >
                {patientDevices.length === 0 && <option value="">Chua co thiet bi</option>}
                {patientDevices.map((device) => (
                  <option key={device.device_id} value={device.device_id || ''}>{device.name || device.device_id}</option>
                ))}
              </select>
            )}
          </label>
          <label className="text-sm font-medium text-slate-700">
            Mo hinh
            <select
              value={modelName}
              onChange={(e) => { setModelName(e.target.value); setPage(1); }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
            >
              <option value="">Tat ca mo hinh</option>
              <option value="vitals-risk">Sinh hieu tong hop</option>
              <option value="ecg-arrhythmia">Dien tim ECG</option>
            </select>
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Tong ket</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">
              {predictionsQuery.data?.pagination.total ?? 0} ket qua
            </p>
          </div>
        </div>
      </section>

      {predictionsQuery.isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Dang tai ket qua AI...</div>
      ) : predictionsQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {predictionsQuery.error instanceof Error ? predictionsQuery.error.message : 'Khong tai duoc ket qua AI'}
        </div>
      ) : predictionsQuery.data?.data.length ? (
        <div className="space-y-3">
          {predictionsQuery.data.data.map((row) => <PredictionCard key={row.id} row={row} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <FileSearch className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">Chua co ket qua AI co du lieu doi chieu</p>
          <p className="mt-1 text-sm text-slate-500">Hay dam bao thiet bi gui du du lieu va ho so benh nhan da cap nhat day du.</p>
        </div>
      )}

      {predictionsQuery.data && predictionsQuery.data.pagination.pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            Trang truoc
          </button>
          <span className="text-sm text-slate-500">
            Trang {page}/{predictionsQuery.data.pagination.pages}
          </span>
          <button
            type="button"
            disabled={page >= predictionsQuery.data.pagination.pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            Trang sau
          </button>
        </div>
      )}
    </div>
  );
}
