'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { consentApi, type AccessCode, type DoctorAccessSession } from '@/lib/api/consent';
import { useGetApiDevicesMy } from '@/lib/orval/api';
import type { AdminDevice } from '@/lib/orval/api';
import { ShieldCheck, KeyRound, Timer, RefreshCw, Ban, Cpu, Loader2 } from 'lucide-react';

const formatTime = (iso: string) => new Date(iso).toLocaleString('vi-VN');

export default function PrivacyCenterPage() {
  const { user } = useAuth();
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [sessions, setSessions] = useState<DoctorAccessSession[]>([]);
  const [ttlMinutes, setTtlMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPatient = user?.role === 'patient';

  const { data: myDevicesResp } = useGetApiDevicesMy(
    { include_inactive: false },
    { query: { enabled: isPatient } },
  );
  const myDevices = useMemo<AdminDevice[]>(
    () => (myDevicesResp?.status === 200
      ? (myDevicesResp.data as { data?: AdminDevice[] }).data ?? []
      : []),
    [myDevicesResp],
  );

  useEffect(() => {
    if (myDevices.length === 0) return;
    const stillActive = myDevices.find((d) => d.device_id === selectedDeviceId);
    if (!stillActive) {
      setSelectedDeviceId(myDevices[0].device_id ?? '');
    }
  }, [myDevices, selectedDeviceId]);

  const loadData = useCallback(async (silent = false) => {
    if (!isPatient) return;
    try {
      if (!silent) setLoading(true);
      setError('');
      const [codesResp, sessionsResp] = await Promise.all([
        consentApi.listActiveCodes(selectedDeviceId || undefined),
        consentApi.listActiveSessions(),
      ]);
      setCodes(codesResp.data || []);
      setSessions(sessionsResp.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu quyền riêng tư');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isPatient, selectedDeviceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isPatient) return;
    const id = setInterval(() => {
      void loadData(true);
    }, 5000);
    return () => clearInterval(id);
  }, [isPatient, loadData]);

  // Live countdown ticker
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const latestCode = useMemo(() => {
    if (!codes.length) return null;
    return [...codes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [codes]);

  const remainingSeconds = useMemo(() => {
    if (!latestCode) return 0;
    const diff = Math.floor((new Date(latestCode.expires_at).getTime() - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  // tick is the live dependency that drives re-computation every second
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestCode, tick]);

  const handleCreateCode = async () => {
    try {
      setError('');
      setSuccess('');
      setCreating(true);
      const resp = await consentApi.createCode({ ttl_minutes: ttlMinutes, device_id: selectedDeviceId || undefined });
      // Optimistic update: prepend new code immediately — no waiting for loadData
      setCodes((prev) => [resp.data, ...prev.filter((c) => c.id !== resp.data.id)]);
      setSuccess(`${resp.message}. M\u00e3: ${resp.data.code}`);
      // Background sync to get full accurate list
      void loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'T\u1ea1o m\u00e3 tr\u1ee5c c\u1eadp th\u1ea5t b\u1ea1i');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (sessionId: string) => {
    try {
      setError('');
      setSuccess('');
      // Optimistic remove immediately
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      const resp = await consentApi.revokeSession(sessionId, 'Patient manual revoke');
      setSuccess(resp.message);
      // Background sync
      void loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thu hồi phiên thất bại');
      void loadData(true); // restore correct state on error
    }
  };

  if (!isPatient) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
          Trang này chỉ dành cho tài khoản bệnh nhân.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Privacy Center</h1>
        <p className="text-sm text-slate-500">Quản lý quyền truy cập dữ liệu theo cơ chế đồng thuận.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">{success}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <ShieldCheck className="w-5 h-5 text-sky-500" />
          Access Code Generator
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {myDevices.length > 1 && (
            <label className="text-sm text-slate-600 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-400" /> Thiết bị
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="ml-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              >
                {myDevices.map((d) => (
                  <option key={d.device_id} value={d.device_id ?? ''}>
                    {d.name ? `${d.name} (${d.device_id})` : d.device_id}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm text-slate-600">
            TTL (phút)
            <input
              type="number"
              min={1}
              max={60}
              value={ttlMinutes}
              onChange={(e) => setTtlMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 30)))}
              className="ml-2 w-20 rounded-lg border border-slate-300 px-2 py-1"
            />
          </label>
          <button
            onClick={handleCreateCode}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {creating ? 'Đang tạo...' : 'Tạo mã truy cập'}
          </button>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </button>
        </div>

        {latestCode ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Mã mới nhất</p>
            <p className="mt-1 text-4xl font-bold tracking-[0.3em] text-slate-900">{latestCode.code}</p>
            <div className="mt-3 grid gap-1 text-sm text-slate-600">
              <p><Timer className="inline w-4 h-4 mr-1" /> Hết hạn: {formatTime(latestCode.expires_at)}</p>
              <p>Thiết bị: <span className="font-mono">{latestCode.device_id}</span></p>
              <p>Còn lại: <span className="font-semibold">{Math.floor(remainingSeconds / 60)}m {remainingSeconds % 60}s</span></p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Chưa có mã truy cập đang hoạt động.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Active Doctor Sessions</h2>
        {!sessions.length ? (
          <p className="text-sm text-slate-500">Hiện chưa có bác sĩ nào đang truy cập dữ liệu của bạn.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.session_id} className="rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  <p className="font-semibold">{s.doctor_name || s.doctor_email || `Doctor #${s.doctor_id}`}</p>
                  <p>Thiết bị: <span className="font-mono">{s.device_id}</span></p>
                  <p>Hiệu lực đến: {formatTime(s.expires_at)}</p>
                </div>
                <button
                  onClick={() => void handleRevoke(s.session_id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
                >
                  <Ban className="w-4 h-4" /> Ngắt kết nối ngay
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
