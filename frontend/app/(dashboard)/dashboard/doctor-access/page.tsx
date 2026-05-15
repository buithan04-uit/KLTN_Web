'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { consentApi } from '@/lib/api/consent';
import { KeyRound, UserCheck, ShieldCheck } from 'lucide-react';

export default function DoctorAccessPage() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    session_token: string;
    patient_summary: {
      id: number;
      full_name: string | null;
      age: number | null;
      device_id: string;
      device_name: string | null;
      device_status: string | null;
    };
  } | null>(null);

  const isDoctorOrAdmin = user?.role === 'doctor' || user?.role === 'admin';

  const handleVerify = async () => {
    try {
      setError('');
      setResult(null);
      if (!/^\d{6}$/.test(code)) {
        setError('Mã truy cập phải gồm đúng 6 chữ số');
        return;
      }

      setLoading(true);
      const resp = await consentApi.verifyCode(code);
      setResult({
        session_token: resp.data.session_token,
        patient_summary: resp.data.patient_summary,
      });
      localStorage.setItem('consent_session_token', resp.data.session_token);
      localStorage.setItem('consent_session_device_id', resp.data.patient_summary.device_id);
      // Save to multi-session map so doctor can monitor multiple patients
      try {
        const sessionsMap = JSON.parse(localStorage.getItem('consent_sessions_map') || '{}');
        sessionsMap[resp.data.patient_summary.device_id] = {
          token: resp.data.session_token,
          session_id: resp.data.session.session_id,
          patient_name: resp.data.patient_summary.full_name,
          patient_id: resp.data.patient_summary.id,
          device_name: resp.data.patient_summary.device_name,
          device_status: resp.data.patient_summary.device_status,
          expires_at: resp.data.session.expires_at,
        };
        localStorage.setItem('consent_sessions_map', JSON.stringify(sessionsMap));
      } catch {
        // ignore storage errors
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xác thực mã thất bại');
    } finally {
      setLoading(false);
    }
  };

  if (!isDoctorOrAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
          Trang này chỉ dành cho bác sĩ hoặc quản trị viên.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Access Gate</h1>
        <p className="text-sm text-slate-500">Nhập mã 6 số từ bệnh nhân để nhận session token truy cập tạm thời.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <label className="text-sm font-medium text-slate-700">Mã truy cập (6 chữ số)</label>
        <div className="flex gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-xl tracking-[0.3em] font-semibold text-center"
            placeholder="000000"
            inputMode="numeric"
          />
          <button
            onClick={() => void handleVerify()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4" /> {loading ? 'Đang xác thực...' : 'Xác thực'}
          </button>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</div>}
      </div>

      {result && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold">
            <ShieldCheck className="w-5 h-5" /> Xác thực thành công
          </div>
          <div className="rounded-xl bg-white border border-emerald-100 p-4 text-sm text-slate-700 space-y-1">
            <p className="font-semibold flex items-center gap-2"><UserCheck className="w-4 h-4" /> Tóm tắt bệnh nhân</p>
            <p>Tên: <strong>{result.patient_summary.full_name || 'Chưa cập nhật'}</strong></p>
            <p>Tuổi: <strong>{result.patient_summary.age ?? 'N/A'}</strong></p>
            <p>Thiết bị: <span className="font-mono">{result.patient_summary.device_id}</span></p>
            <p>Trạng thái thiết bị: <strong>{result.patient_summary.device_status || 'unknown'}</strong></p>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500">Phiên đã lưu. Bạn có thể thêm nhiều bệnh nhân bằng cách nhập thêm mã khác.</p>
            <a
              href="/dashboard/doctor-monitor"
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition"
            >
              Đến Doctor Monitor →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
