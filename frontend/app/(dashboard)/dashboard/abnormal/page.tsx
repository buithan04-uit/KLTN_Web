'use client';

import { useEffect } from 'react';
import { useGetApiHealthAbnormalDeviceId } from '@/lib/orval/api';
import { useAuth } from '@/context/AuthContext';
import type { HealthRecord } from '@/lib/types';
import { AlertTriangle, ShieldAlert, Clock, Cpu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDeviceSearch } from '@/hooks/useDeviceSearch';
import { DeviceBar } from '@/components/dashboard/DeviceBar';
import { ErrorAlert } from '@/components/ui/Alert';

function AbnormalBadge({ field, value }: { field: string; value: number | null }) {
  if (value === null) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-mono font-medium">
      {value.toFixed(field === 'ecg_value' ? 3 : 1)}
    </span>
  );
}

export default function AbnormalPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const { deviceId, inputDeviceId, setInputDeviceId, handleSearch } = useDeviceSearch();

  // Role guard
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'doctor') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error: queryError,
    refetch,
    dataUpdatedAt,
  } = useGetApiHealthAbnormalDeviceId(
    deviceId,
    { query: { refetchInterval: 20_000, enabled: !!token && !!user && (user.role === 'admin' || user.role === 'doctor') } },
  );

  const records = (response?.status === 200 ? response.data : []) as HealthRecord[];
  const err = queryError as unknown;
  const error = isError ? (err instanceof Error ? err.message : 'Không thể tải dữ liệu') : '';
  const lastUpdated = dataUpdatedAt > 0 ? new Date(dataUpdatedAt) : null;

  const sorted = [...records].sort((a, b) => new Date(b.time!).getTime() - new Date(a.time!).getTime());

  if (user && user.role !== 'admin' && user.role !== 'doctor') return null;

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-red-100 p-2.5 rounded-xl">
            <ShieldAlert className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cảnh báo bất thường</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {lastUpdated ? `Cập nhật: ${lastUpdated.toLocaleTimeString('vi-VN')}` : isLoading ? 'Đang tải...' : 'Chưa có dữ liệu'}
            </p>
          </div>
        </div>

        <DeviceBar
          inputDeviceId={inputDeviceId}
          onInputChange={setInputDeviceId}
          onSearch={handleSearch}
          loading={isFetching}
          onRefresh={() => { void refetch(); }}
        />
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-4">
          <AlertTriangle className="w-8 h-8 text-red-500 shrink-0" />
          <div>
            <p className="text-3xl font-bold text-red-700">{records.length}</p>
            <p className="text-sm text-red-600 font-medium">Sự kiện bất thường</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
          <Cpu className="w-8 h-8 text-sky-500 shrink-0" />
          <div>
            <p className="text-lg font-bold text-slate-800 font-mono">{deviceId}</p>
            <p className="text-sm text-slate-500">Thiết bị đang theo dõi</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
          <Clock className="w-8 h-8 text-slate-400 shrink-0" />
          <div>
            <p className="text-base font-bold text-slate-700">
              {sorted[0] ? new Date(sorted[0].time).toLocaleString('vi-VN') : '—'}
            </p>
            <p className="text-sm text-slate-500">Cảnh báo gần nhất</p>
          </div>
        </div>
      </div>

      <ErrorAlert message={error} />

      {/* ── Table ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="font-semibold text-slate-700 text-sm">Danh sách cảnh báo</span>
          <span className="ml-auto text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{records.length} bản ghi</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-5 py-3 text-left font-medium">Thời gian</th>
                <th className="px-4 py-3 text-left font-medium">Phiên</th>
                <th className="px-4 py-3 text-right font-medium">Nhịp tim</th>
                <th className="px-4 py-3 text-right font-medium">SpO₂</th>
                <th className="px-4 py-3 text-right font-medium">Nhiệt độ</th>
                <th className="px-4 py-3 text-right font-medium">ECG</th>
                <th className="px-4 py-3 text-left font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map((r, i) => (
                <tr key={i} className="hover:bg-red-50/40 transition-colors">
                  <td className="px-5 py-3 text-slate-600 tabular-nums text-xs whitespace-nowrap">
                    {new Date(r.time).toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                    {r.session_id ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AbnormalBadge field="heart_rate" value={r.heart_rate} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AbnormalBadge field="spo2" value={r.spo2} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AbnormalBadge field="temperature" value={r.temperature} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AbnormalBadge field="ecg_value" value={r.ecg_value} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-50 truncate">
                    {r.note ?? <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertTriangle className="w-8 h-8 text-slate-200" />
                      <p className="text-slate-400 text-sm">Không có cảnh báo nào cho thiết bị này</p>
                    </div>
                  </td>
                </tr>
              )}
              {isLoading && sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">Đang tải...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
