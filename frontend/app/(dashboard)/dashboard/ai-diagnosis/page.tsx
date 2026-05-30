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
  normal: { label: 'Ổn định', badge: 'bg-emerald-100 text-emerald-700', panel: 'border-emerald-200 bg-emerald-50', icon: CheckCircle2 },
  warning: { label: 'Cần theo dõi', badge: 'bg-amber-100 text-amber-700', panel: 'border-amber-200 bg-amber-50', icon: AlertTriangle },
  danger: { label: 'Cần bác sĩ xem xét', badge: 'bg-red-100 text-red-700', panel: 'border-red-200 bg-red-50', icon: AlertTriangle },
  unknown: { label: 'Chưa rõ', badge: 'bg-slate-100 text-slate-600', panel: 'border-slate-200 bg-white', icon: FileSearch },
};

function getStatus(modelName: string, label: string | null | undefined, confidence?: number | null): AiStatus {
  const value = String(label || '').trim();
  const lower = value.toLowerCase();
  const hasConfidence = typeof confidence === 'number';
  if (!value) return 'unknown';
  if (modelName === 'vitals-risk') {
    if (lower.includes('high') || lower.includes('danger')) {
      return !hasConfidence || confidence >= 0.75 ? 'danger' : 'warning';
    }
    if (lower.includes('medium') || lower.includes('moderate')) return 'warning';
    if (lower.includes('low') || lower.includes('normal')) return 'normal';
    return 'warning';
  }
  if (modelName === 'ecg-arrhythmia') {
    if (value === 'N' || lower.includes('normal')) return 'normal';
    if (value === 'V' || value === 'F') {
      if (hasConfidence && confidence < 0.6) return 'unknown';
      return !hasConfidence || confidence >= 0.8 ? 'danger' : 'warning';
    }
    return hasConfidence && confidence < 0.6 ? 'unknown' : 'warning';
  }
  return 'unknown';
}

function getModelLabel(modelName: string) {
  if (modelName === 'vitals-risk') return 'Sinh hiệu tổng hợp';
  if (modelName === 'ecg-arrhythmia') return 'Điện tim ECG';
  return modelName;
}

function getReadableDiagnosis(row: AiPredictionRow) {
  if (row.model_name === 'vitals-risk') {
    if (/high/i.test(row.prediction_label)) return 'High Risk - Nguy cơ cao theo sinh hiệu';
    if (/low/i.test(row.prediction_label)) return 'Low Risk - Ổn định theo sinh hiệu';
  }
  if (row.model_name === 'ecg-arrhythmia') {
    const map: Record<string, string> = {
      N: 'Nhịp tim bình thường',
      S: 'Nghi ngoại tâm thu trên thất',
      V: 'Nghi ngoại tâm thu thất',
      F: 'Nghi nhịp hợp nhất',
      Q: 'Khác/không phân loại rõ',
    };
    return map[row.prediction_label]
      ? `${row.prediction_label} - ${map[row.prediction_label]}`
      : row.prediction_label;
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
    ['Nhiệt độ', fmt(raw.temperature ?? raw.temp, ' C')],
    ['Huyết áp', raw.systolic_bp || raw.diastolic_bp ? `${fmt(raw.systolic_bp)}/${fmt(raw.diastolic_bp)} mmHg` : '--'],
    ['MAP', fmt(raw.map, ' mmHg')],
    ['Tuổi/Giới', `${fmt(raw.age)} / ${fmt(raw.gender)}`],
  ];

  if (row.model_name === 'ecg-arrhythmia') {
    const windowSize = raw.window_size ?? raw.ecg_points_count;
    facts.push(['Cửa sổ ECG', `${fmt(windowSize)} điểm`]);
    if (raw.ecg_quality !== null && raw.ecg_quality !== undefined && raw.ecg_quality !== '') {
      facts.push(['Chất lượng ECG', String(raw.ecg_quality)]);
    }
    if (raw.sampling_rate !== null && raw.sampling_rate !== undefined) {
      facts.push(['Tần số lấy mẫu', fmt(raw.sampling_rate, ' Hz')]);
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
  const status = getStatus(row.model_name, row.prediction_label, row.confidence);
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
              {getModelLabel(row.model_name)} | Xác suất mô hình {confidence}
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
          Dữ liệu dùng để đối chiếu
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
    || 'Kết quả AI chỉ để bác sĩ tham khảo trong quá trình khám chữa bệnh, không thay thế chẩn đoán chuyên môn.';

  const handleVerifyCode = async () => {
    if (!/^\d{6}$/.test(accessCode)) {
      setAccessError('Mã truy cập phải gồm 6 chữ số.');
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
      setAccessError(err instanceof Error ? err.message : 'Không xác thực được mã truy cập.');
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
            <h1 className="text-2xl font-bold text-slate-900">Kết quả AI chẩn đoán</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Xem lại kết quả dự đoán kèm dữ liệu đầu vào để bác sĩ đối chiếu. Bác sĩ chỉ xem được khi bệnh nhân đã cấp mã đồng thuận.
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <ShieldCheck className="mr-2 inline h-4 w-4" />
          Dữ liệu AI được bảo vệ theo phiên đồng thuận
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {disclaimerText}
      </p>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-700">Cách hiểu kết quả AI</p>
        <p className="mt-1">1) AI chỉ chạy khi đủ thông tin (HR, SpO2, nhiệt độ, MAP/huyết áp, hồ sơ bệnh nhân, ECG đủ cửa sổ).</p>
        <p className="mt-1">2) Kết quả được tổng hợp từ nhiều mẫu gần đây, không phải cảnh báo từng mẫu realtime.</p>
        <p className="mt-1">3) Mỗi kết quả kèm theo dữ liệu đối chiếu để bác sĩ xem lại và so sánh.</p>
      </section>

      {user?.role === 'doctor' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="text-sm font-medium text-slate-700">Nhap ma dong thuan cua benh nhan</label>
              <input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 chữ số"
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
              {isVerifying ? 'Đang xác thực...' : 'Mở quyền xem'}
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
                {doctorSessions.length === 0 && <option value="">Chưa có phiên đồng thuận</option>}
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
                {patientDevices.length === 0 && <option value="">Chưa có thiết bị</option>}
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
              <option value="vitals-risk">Sinh hiệu tổng hợp</option>
              <option value="ecg-arrhythmia">Điện tim ECG</option>
            </select>
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Tổng kết</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">
              {predictionsQuery.data?.pagination.total ?? 0} kết quả
            </p>
          </div>
        </div>
      </section>

      {predictionsQuery.isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Đang tải kết quả AI...</div>
      ) : predictionsQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {predictionsQuery.error instanceof Error ? predictionsQuery.error.message : 'Không tải được kết quả AI'}
        </div>
      ) : predictionsQuery.data?.data.length ? (
        <div className="space-y-3">
          {predictionsQuery.data.data.map((row) => <PredictionCard key={row.id} row={row} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <FileSearch className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">Chưa có kết quả AI có dữ liệu đối chiếu</p>
          <p className="mt-1 text-sm text-slate-500">Hãy đảm bảo thiết bị gửi đủ dữ liệu và hồ sơ bệnh nhân đã cập nhật đầy đủ.</p>
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
