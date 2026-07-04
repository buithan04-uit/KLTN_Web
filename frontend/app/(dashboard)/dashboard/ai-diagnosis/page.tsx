'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, BrainCircuit, CheckCircle2, FileSearch, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGetApiDevicesMy } from '@/lib/orval/api';
import type { AdminDevice } from '@/lib/orval/api';
import { aiApi, type AiCoverage, type AiPredictionRow, type AiRuleBasedAssessment, type AiStatus } from '@/lib/api/ai';
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
  if (modelName === 'vitals-risk' || modelName === 'vitals-risk-assessment') {
    if (lower.includes('high') || lower.includes('danger')) {
      return !hasConfidence || confidence >= 0.75 ? 'danger' : 'warning';
    }
    if (lower.includes('medium') || lower.includes('moderate')) return 'warning';
    if (lower.includes('low') || lower.includes('normal')) return 'normal';
    return 'warning';
  }
  if (modelName === 'ecg-arrhythmia') {
    if (lower.includes('uncertain') || lower.includes('chưa đủ')) return 'unknown';
    if (lower.includes('possible')) return 'warning';
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
  if (modelName === 'vitals-risk' || modelName === 'vitals-risk-assessment') return 'Đánh giá nguy cơ sinh hiệu';
  if (modelName === 'ecg-arrhythmia') return 'Điện tim ECG';
  return modelName;
}

function getReadableDiagnosis(row: AiPredictionRow) {
  if (row.model_name === 'vitals-risk' || row.model_name === 'vitals-risk-assessment') {
    if (/high/i.test(row.prediction_label)) return 'Nguy cơ cao theo sinh hiệu';
    if (/moderate|medium/i.test(row.prediction_label)) return 'Nguy cơ trung bình theo sinh hiệu';
    if (/low/i.test(row.prediction_label)) return 'Nguy cơ thấp theo sinh hiệu';
  }
  if (row.model_name === 'ecg-arrhythmia') {
    if (/uncertain/i.test(row.prediction_label)) return 'ECG chưa đủ tin cậy để phân loại';
    if (/possible/i.test(row.prediction_label)) {
      const raw = row.prediction_label.replace(/possible/i, '').trim();
      return `ECG nghi ngờ ${raw || 'bất thường'} - cần đối chiếu thêm`;
    }
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

function readCoverage(row: AiPredictionRow): AiCoverage {
  const snapshot = row.input_snapshot || {};
  const coverage = snapshot.coverage;
  return coverage && typeof coverage === 'object' ? coverage as AiCoverage : {};
}

function readRuleBased(row: AiPredictionRow): AiRuleBasedAssessment | null {
  const snapshot = row.input_snapshot || {};
  const ruleBased = snapshot.rule_based;
  return ruleBased && typeof ruleBased === 'object' ? ruleBased as AiRuleBasedAssessment : null;
}

function getCoverageLabel(mode?: string) {
  if (mode === 'full') return 'Full';
  if (mode === 'partial') return 'Partial';
  if (mode === 'sensor-only') return 'Sensor-only';
  return 'Chưa rõ';
}

function getFieldLabel(field: string) {
  const labels: Record<string, string> = {
    spo2: 'SpO2',
    temperature: 'Nhiệt độ',
    heart_rate: 'Nhịp tim',
    systolic_bp: 'Huyết áp tâm thu',
    diastolic_bp: 'Huyết áp tâm trương',
    date_of_birth: 'Ngày sinh',
    weight: 'Cân nặng',
    height: 'Chiều cao',
    gender: 'Giới tính',
  };
  return labels[field] || field;
}

function fmt(value: unknown, suffix = '') {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'number') return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
  return `${value}${suffix}`;
}

function EvidenceGrid({ row }: { row: AiPredictionRow }) {
  const raw = readRaw(row);
  const coverage = readCoverage(row);
  const facts = [
    ['HR', fmt(raw.heart_rate ?? raw.hr, ' bpm')],
    ['SpO2', fmt(raw.spo2, '%')],
    ['Nhiệt độ', fmt(raw.temperature ?? raw.temp, ' C')],
    ['Huyết áp', raw.systolic_bp || raw.diastolic_bp ? `${fmt(raw.systolic_bp)}/${fmt(raw.diastolic_bp)} mmHg (nhập ngoài)` : '--'],
    ['MAP', fmt(raw.map, ' mmHg')],
    ['Tuổi/Giới', `${fmt(raw.age)} / ${fmt(raw.gender)}`],
    ['Mức dữ liệu', getCoverageLabel(coverage.mode)],
    ['Hiệu chỉnh nhiệt độ', raw.temperature_corrected ? `Corrected ${fmt(raw.temperature_calibration_version)}` : 'Raw/chưa rõ'],
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700">{value}</p>
          </div>
        ))}
      </div>

      {(coverage.available_fields?.length || coverage.missing_fields?.length) && (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-emerald-600">Dữ liệu đã sử dụng</p>
            <p className="mt-1 text-sm text-slate-700">
              {(coverage.available_fields || []).map(getFieldLabel).join(', ') || '--'}
            </p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-amber-600">Còn thiếu để chạy model full</p>
            <p className="mt-1 text-sm text-slate-700">
              {(coverage.missing_fields || []).map(getFieldLabel).join(', ') || 'Không thiếu'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatModelProbability(confidence: number | null) {
  if (typeof confidence !== 'number') return 'N/A';
  const percent = confidence * 100;
  if (percent >= 99.5 && percent < 100) return '>=99.5%';
  return `${percent.toFixed(1)}%`;
}

function PredictionCard({ row, patientLabel }: { row: AiPredictionRow; patientLabel?: string }) {
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
          {patientLabel && <div className="font-semibold text-slate-600">{patientLabel}</div>}
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

function RiskAssessmentCard({ row, patientLabel }: { row: AiPredictionRow; patientLabel?: string }) {
  const status = getStatus(row.model_name, row.prediction_label, row.confidence);
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  const coverage = readCoverage(row);
  const ruleBased = readRuleBased(row);
  const modelPrediction = row.input_snapshot?.model_prediction as { skipped?: boolean; reason?: string; label?: string } | undefined;
  const primarySource = row.input_snapshot?.primary_source as string | undefined;

  if (row.model_name !== 'vitals-risk-assessment') {
    return <PredictionCard row={row} patientLabel={patientLabel} />;
  }

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
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                {getCoverageLabel(coverage.mode)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Đánh giá nguy cơ sinh hiệu | Điểm rule-based {ruleBased?.total_score ?? '--'}
            </p>
            <div className="mt-2 grid gap-1.5 text-xs text-slate-500 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-slate-600">Rule-based:</span>{' '}
                {ruleBased?.label || '--'} (luôn chạy khi có dữ liệu cảm biến)
              </p>
              <p>
                <span className="font-semibold text-slate-600">Model AI:</span>{' '}
                {modelPrediction?.skipped
                  ? `chưa chạy (${modelPrediction.reason === 'model_requires_full_profile_and_blood_pressure' ? 'thiếu hồ sơ/huyết áp' : modelPrediction.reason || 'thiếu dữ liệu'})`
                  : modelPrediction?.label || '--'}
              </p>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Kết luận badge phía trên lấy theo {primarySource === 'model' ? 'Model AI' : 'Rule-based'} (ưu tiên mức độ nghiêm trọng hơn giữa 2 nguồn).
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          {patientLabel && <div className="font-semibold text-slate-600">{patientLabel}</div>}
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

      {ruleBased?.components?.length ? (
        <div className="mt-4 rounded-xl border border-white/80 bg-white/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thành phần điểm nguy cơ</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {ruleBased.components.map((item) => (
              <div key={item.field} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-600">
                  {item.label || getFieldLabel(item.field)}: {fmt(item.value)}{item.unit ? ` ${item.unit}` : ''}
                  {item.source === 'manual_input' ? ' (nhập ngoài)' : ''}
                </span>
                <span className="font-semibold text-slate-800">+{item.score ?? 0}</span>
              </div>
            ))}
          </div>
          {ruleBased.interpretation && <p className="mt-2 text-sm text-slate-600">{ruleBased.interpretation}</p>}
        </div>
      ) : null}
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

const ALL_PATIENTS = '__all_patients__';
const MERGED_PAGE_SIZE = 12;

export default function AiDiagnosisPage() {
  const { token, user } = useAuth();
  const [deviceId, setDeviceId] = useState('');
  const [modelName, setModelName] = useState('');
  const [statusFilter, setStatusFilter] = useState<AiStatus | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRunningAssessment, setIsRunningAssessment] = useState(false);
  const [runMessage, setRunMessage] = useState('');
  const [systolicBp, setSystolicBp] = useState('');
  const [diastolicBp, setDiastolicBp] = useState('');
  const [bpMessage, setBpMessage] = useState('');
  const [bpMessageType, setBpMessageType] = useState<'success' | 'error' | ''>('');
  const [isSavingBp, setIsSavingBp] = useState(false);
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
  const effectiveDeviceId = deviceId || patientDevices[0]?.device_id || doctorSessions[0]?.[0] || '';
  const isMergedView = user?.role === 'doctor' && effectiveDeviceId === ALL_PATIENTS;
  const selectedConsentToken = user?.role === 'doctor' && !isMergedView ? sessionsMap[deviceId]?.token : null;

  useEffect(() => {
    if (!deviceId && effectiveDeviceId) setDeviceId(effectiveDeviceId);
  }, [deviceId, effectiveDeviceId]);

  const predictionsQuery = useQuery({
    queryKey: ['ai-predictions-page', effectiveDeviceId, modelName, statusFilter, page, selectedConsentToken, fromDate, toDate],
    queryFn: () => aiApi.getPredictions(effectiveDeviceId, {
      page,
      limit: 12,
      modelName: modelName || undefined,
      status: statusFilter || undefined,
      from: fromDate ? `${fromDate}T00:00:00` : undefined,
      to: toDate ? `${toDate}T23:59:59` : undefined,
      token,
      consentToken: selectedConsentToken,
    }),
    enabled: !isMergedView && !!token && !!effectiveDeviceId && (user?.role !== 'doctor' || !!selectedConsentToken),
    refetchInterval: 30_000,
  });

  // Doctor "Tất cả bệnh nhân" view: fan out one request per active consent session
  // (backend's consent gate is per-device, so this merges client-side instead of
  // changing the consent model) and merge+sort the results by measurement time.
  const mergedQueries = useQueries({
    queries: isMergedView
      ? doctorSessions.map(([devId, session]) => ({
          queryKey: ['ai-predictions-merged', devId, modelName, statusFilter, fromDate, toDate, session.token],
          queryFn: () => aiApi.getPredictions(devId, {
            page: 1,
            limit: 50,
            modelName: modelName || undefined,
            status: statusFilter || undefined,
            from: fromDate ? `${fromDate}T00:00:00` : undefined,
            to: toDate ? `${toDate}T23:59:59` : undefined,
            token,
            consentToken: session.token,
          }),
          enabled: !!token,
          refetchInterval: 30_000,
        }))
      : [],
  });

  const mergedRows = useMemo(() => {
    if (!isMergedView) return [];
    const rows: Array<AiPredictionRow & { _patientLabel: string }> = [];
    doctorSessions.forEach(([devId, session], idx) => {
      const data = mergedQueries[idx]?.data?.data || [];
      const label = `${session.patient_name || 'Bệnh nhân'} · ${session.device_name || devId}`;
      data.forEach((row) => rows.push({ ...row, _patientLabel: label }));
    });
    return rows.sort((a, b) => {
      const at = new Date(a.health_time || a.created_at).getTime();
      const bt = new Date(b.health_time || b.created_at).getTime();
      return bt - at;
    });
  }, [isMergedView, doctorSessions, mergedQueries]);

  const mergedIsLoading = isMergedView && mergedQueries.some((q) => q.isLoading);
  const mergedFailedCount = mergedQueries.filter((q) => q.isError).length;
  const mergedIsError = isMergedView && mergedQueries.length > 0 && mergedFailedCount === mergedQueries.length;
  const mergedPages = Math.max(1, Math.ceil(mergedRows.length / MERGED_PAGE_SIZE));
  const mergedPageRows = mergedRows.slice((page - 1) * MERGED_PAGE_SIZE, page * MERGED_PAGE_SIZE);

  const displayedRows: Array<AiPredictionRow & { _patientLabel?: string }> = isMergedView
    ? mergedPageRows
    : (predictionsQuery.data?.data ?? []);
  const displayedTotal = isMergedView ? mergedRows.length : (predictionsQuery.data?.pagination.total ?? 0);
  const displayedPages = isMergedView ? mergedPages : (predictionsQuery.data?.pagination.pages ?? 1);
  const isLoading = isMergedView ? mergedIsLoading : predictionsQuery.isLoading;
  const isError = isMergedView ? mergedIsError : predictionsQuery.isError;

  const disclaimerText = (isMergedView ? mergedQueries.find((q) => q.data?.disclaimer)?.data?.disclaimer : predictionsQuery.data?.disclaimer)
    || 'Kết quả AI chỉ hỗ trợ theo dõi và đánh giá nguy cơ sinh hiệu, không thay thế chẩn đoán hoặc quyết định điều trị.';

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

  const handleRunAssessment = async () => {
    if (!effectiveDeviceId) return;
    try {
      setIsRunningAssessment(true);
      setRunMessage('');
      const resp = await aiApi.predictLatest(effectiveDeviceId, {
        token,
        consentToken: selectedConsentToken,
      });
      setRunMessage(`Đã tạo ${resp.persisted_count} kết quả đánh giá mới.`);
      await predictionsQuery.refetch();
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : 'Không chạy được đánh giá AI.');
    } finally {
      setIsRunningAssessment(false);
    }
  };

  const handleSaveBloodPressure = async () => {
    if (!effectiveDeviceId) return;
    const systolic = Number(systolicBp);
    const diastolic = Number(diastolicBp);

    if (!Number.isFinite(systolic) || systolic < 50 || systolic > 260) {
      setBpMessageType('error');
      setBpMessage('Huyết áp tâm thu phải nằm trong khoảng 50-260 mmHg.');
      return;
    }
    if (!Number.isFinite(diastolic) || diastolic < 30 || diastolic > 180) {
      setBpMessageType('error');
      setBpMessage('Huyết áp tâm trương phải nằm trong khoảng 30-180 mmHg.');
      return;
    }
    if (diastolic >= systolic) {
      setBpMessageType('error');
      setBpMessage('Huyết áp tâm trương phải nhỏ hơn huyết áp tâm thu.');
      return;
    }

    try {
      setIsSavingBp(true);
      setBpMessage('');
      setBpMessageType('');
      await aiApi.recordManualBloodPressure(
        effectiveDeviceId,
        { systolic_bp: systolic, diastolic_bp: diastolic },
        { token, consentToken: selectedConsentToken },
      );
      setBpMessageType('success');
      setBpMessage('Đã lưu huyết áp nhập ngoài. Bạn có thể chạy lại đánh giá mới nhất.');
      setSystolicBp('');
      setDiastolicBp('');
    } catch (err) {
      setBpMessageType('error');
      setBpMessage(err instanceof Error ? err.message : 'Không lưu được huyết áp.');
    } finally {
      setIsSavingBp(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-sky-600" />
            <h1 className="text-2xl font-bold text-slate-900">Đánh giá nguy cơ sinh hiệu</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Xem lại điểm nguy cơ rule-based, trạng thái dữ liệu partial/full và kết quả mô hình khi đủ dữ liệu. Bác sĩ chỉ xem được khi bệnh nhân đã cấp mã đồng thuận.
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
        <p className="font-semibold text-slate-700">Cách hiểu đánh giá nguy cơ</p>
        <p className="mt-1">1) Rule-based score luôn chạy khi có dữ liệu cảm biến như SpO2, nhịp tim hoặc nhiệt độ.</p>
        <p className="mt-1">2) Model AI chỉ chạy full khi đủ hồ sơ bệnh nhân và huyết áp nhập ngoài; nếu thiếu sẽ hiển thị sensor-only hoặc partial.</p>
        <p className="mt-1">3) Hệ thống không tính NEWS2 đầy đủ, chỉ dùng điểm nguy cơ sinh hiệu một phần và luôn hiển thị dữ liệu còn thiếu.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <label className="text-sm font-medium text-slate-700">
              Huyết áp tâm thu
              <input
                value={systolicBp}
                onChange={(e) => setSystolicBp(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
                placeholder="120"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </label>
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="text-sm font-medium text-slate-700">
              Huyết áp tâm trương
              <input
                value={diastolicBp}
                onChange={(e) => setDiastolicBp(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
                placeholder="80"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleSaveBloodPressure}
            disabled={isMergedView || !effectiveDeviceId || isSavingBp || (user?.role === 'doctor' && !selectedConsentToken)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSavingBp ? 'Đang lưu...' : 'Lưu huyết áp nhập ngoài'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Huyết áp hiện được nhập ngoài, không phải số đo trực tiếp từ thiết bị. Giá trị này giúp chuyển đánh giá từ sensor-only sang partial/full khi hồ sơ đã đủ.
        </p>
        {bpMessage && (
          <div
            className={`mt-3 rounded-xl border px-4 py-3 text-sm font-medium ${
              bpMessageType === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {bpMessage}
          </div>
        )}
      </section>

      {user?.role === 'doctor' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="text-sm font-medium text-slate-700">Nhập mã đồng thuận của bệnh nhân</label>
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            Thiết bị
            {user?.role === 'doctor' ? (
              <select
                value={effectiveDeviceId}
                onChange={(e) => { setDeviceId(e.target.value); setPage(1); }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
              >
                {doctorSessions.length === 0 && <option value="">Chưa có phiên đồng thuận</option>}
                {doctorSessions.length > 1 && (
                  <option value={ALL_PATIENTS}>Tất cả bệnh nhân ({doctorSessions.length})</option>
                )}
                {doctorSessions.map(([id, session]) => (
                  <option key={id} value={id}>{session.patient_name || 'Bệnh nhân'} - {session.device_name || id}</option>
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
            Mô hình
            <select
              value={modelName}
              onChange={(e) => { setModelName(e.target.value); setPage(1); }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
            >
              <option value="">Tất cả mô hình</option>
              <option value="vitals-risk-assessment">Đánh giá nguy cơ sinh hiệu</option>
              <option value="ecg-arrhythmia">Điện tim ECG</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Mức độ
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as AiStatus | ''); setPage(1); }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
            >
              <option value="">Tất cả mức độ</option>
              <option value="danger">Cần bác sĩ xem xét</option>
              <option value="warning">Cần theo dõi</option>
              <option value="normal">Ổn định</option>
              <option value="unknown">Chưa rõ</option>
            </select>
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Tổng kết</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">
              {displayedTotal} kết quả{isMergedView ? ` · ${doctorSessions.length} bệnh nhân` : ''}
            </p>
          </div>
        </div>
        {mergedFailedCount > 0 && mergedFailedCount < mergedQueries.length && (
          <p className="mt-2 text-xs text-amber-600">
            Không tải được kết quả của {mergedFailedCount}/{mergedQueries.length} bệnh nhân (phiên đồng thuận có thể đã hết hạn).
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Từ ngày
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Đến ngày
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
            />
          </label>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => { setFromDate(''); setToDate(''); setPage(1); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Xóa lọc ngày
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRunAssessment}
            disabled={isMergedView || !effectiveDeviceId || isRunningAssessment || (user?.role === 'doctor' && !selectedConsentToken)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            <BrainCircuit className="h-4 w-4" />
            {isRunningAssessment ? 'Đang đánh giá...' : 'Chạy đánh giá mới nhất'}
          </button>
          {isMergedView && (
            <p className="text-sm text-slate-500">Chọn một bệnh nhân cụ thể để chạy đánh giá mới hoặc nhập huyết áp.</p>
          )}
          {runMessage && <p className="text-sm text-slate-600">{runMessage}</p>}
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Đang tải kết quả AI...</div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {isMergedView
            ? 'Không tải được kết quả AI cho bất kỳ bệnh nhân nào (phiên đồng thuận có thể đã hết hạn).'
            : predictionsQuery.error instanceof Error ? predictionsQuery.error.message : 'Không tải được kết quả AI'}
        </div>
      ) : displayedRows.length ? (
        <div className="space-y-3">
          {displayedRows.map((row) => (
            <RiskAssessmentCard key={`${row.device_id}-${row.id}`} row={row} patientLabel={row._patientLabel} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <FileSearch className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">Chưa có kết quả AI có dữ liệu đối chiếu</p>
          <p className="mt-1 text-sm text-slate-500">Hãy đảm bảo thiết bị gửi đủ dữ liệu và hồ sơ bệnh nhân đã cập nhật đầy đủ.</p>
        </div>
      )}

      {displayedPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            Trang trước
          </button>
          <span className="text-sm text-slate-500">
            Trang {page}/{displayedPages}
          </span>
          <button
            type="button"
            disabled={page >= displayedPages}
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
