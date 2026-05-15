'use client';

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import {
  useGetApiDevicesMy,
  usePostApiDevicesRegister,
  usePatchApiDevicesDeviceId,
} from '@/lib/orval/api';
import type { AdminDevice } from '@/lib/orval/api';
import {
  Cpu, Plus, RefreshCw, Wifi, WifiOff, Power, PowerOff,
  CheckCircle, AlertCircle, Loader2, Clock, Tag, Unlink, AlertTriangle,
} from 'lucide-react';
import { deviceApi } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

// ── helpers ───────────────────────────────────────────────────────────────────

const formatDate = (v?: string | null) =>
  v ? new Date(v).toLocaleString('vi-VN') : '—';

function StatusBadge({ active, status }: { active?: boolean; status?: string | null }) {
  if (!active)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
        <PowerOff className="w-3 h-3" /> Vô hiệu
      </span>
    );
  if (status === 'online')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
        <Wifi className="w-3 h-3" /> Online
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <WifiOff className="w-3 h-3" /> Offline
    </span>
  );
}

function Alert({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  if (!msg) return null;
  return type === 'success' ? (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
      <CheckCircle className="w-4 h-4 shrink-0" /> {msg}
    </div>
  ) : (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0" /> {msg}
    </div>
  );
}

// ── Device card ───────────────────────────────────────────────────────────────

function DeviceCard({
  device,
  onToggle,
  toggling,
  onUnlink,
  unlinking,
}: {
  device: AdminDevice;
  onToggle: (device: AdminDevice) => void;
  toggling: boolean;
  onUnlink: (device: AdminDevice) => void;
  unlinking: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-sky-500" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate">
              {device.name ?? device.device_id}
            </p>
            <p className="text-xs text-slate-500 font-mono truncate">{device.device_id}</p>
          </div>
        </div>
        <StatusBadge active={device.is_active} status={device.status} />
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
        {device.type && (
          <div className="flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-slate-400" />
            <span>{device.type}</span>
          </div>
        )}
        {device.firmware_version && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">fw</span>
            <span>{device.firmware_version}</span>
          </div>
        )}
        {device.last_seen_at && (
          <div className="flex items-center gap-1.5 col-span-2">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Lần cuối: {formatDate(device.last_seen_at)}</span>
          </div>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={() => onToggle(device)}
        disabled={toggling}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
          device.is_active
            ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
        } disabled:opacity-50`}
      >
        {toggling ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : device.is_active ? (
          <><PowerOff className="w-4 h-4" /> Vô hiệu hoá</>
        ) : (
          <><Power className="w-4 h-4" /> Kích hoạt</>
        )}
      </button>
      {/* Unlink button */}
      <button
        onClick={() => onUnlink(device)}
        disabled={unlinking || toggling}
        className="w-full flex items-center justify-center gap-2 py-1.5 rounded-xl text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-100 hover:border-red-200 transition-colors disabled:opacity-40"
      >
        {unlinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Unlink className="w-3.5 h-3.5" /> Huỷ liên kết</>}
      </button>
    </div>
  );
}

// ── Claim form ────────────────────────────────────────────────────────────────

function ClaimDeviceForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [deviceId, setDeviceId] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { mutate: claim, isPending } = usePostApiDevicesRegister({
    mutation: {
      onSuccess: (res) => {
        setSuccess((res?.data as { message?: string })?.message ?? 'Đã claim thiết bị thành công!');
        setDeviceId('');
        onSuccess();
      },
      onError: (err: Error) => {
        const msg = err?.message ?? '';
        if (msg.includes('chưa có trong hệ thống') || msg.includes('chỉ admin'))
          setError('Thiết bị chưa có trong hệ thống. Liên hệ admin để thêm mới.');
        else if (msg.includes('thuộc sở hữu người dùng khác'))
          setError('Thiết bị này đã thuộc về người dùng khác.');
        else
          setError(msg || 'Claim thất bại.');
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId.trim()) return;
    setSuccess('');
    setError('');
    claim({ data: { device_id: deviceId.trim() } });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Plus className="w-4 h-4 text-sky-500" /> Claim thiết bị
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Thiết bị phải được admin đăng ký trước. Nhập ID thiết bị để liên kết với tài khoản của bạn.
      </p>

      {success && <div className="mb-3"><Alert type="success" msg={success} /></div>}
      {error && <div className="mb-3"><Alert type="error" msg={error} /></div>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          placeholder="VD: DEV-001, SENSOR-ABC"
          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={isPending || !deviceId.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 disabled:opacity-50 transition-colors shrink-0"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Claim
        </button>
      </form>
    </div>
  );
}

// ── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  device,
  onConfirm,
  onCancel,
  loading,
}: {
  device: AdminDevice;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 max-w-sm w-full space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">Huỷ liên kết thiết bị?</p>
            <p className="text-sm text-slate-500 mt-0.5">
              <span className="font-mono text-slate-700">{device.name ?? device.device_id}</span>
              {' '}sẽ không còn thuộc về bạn.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60 transition flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
            Xác nhận huỷ
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyDevicesPage() {
  const { user, token } = useAuth();
  const [toggleMsg, setToggleMsg] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [unlinkMsg, setUnlinkMsg] = useState('');
  const [unlinkError, setUnlinkError] = useState('');
  const [confirmDevice, setConfirmDevice] = useState<AdminDevice | null>(null);
  // liveStatus: override device.status từ API bằng sự kiện socket real-time
  const [liveStatus, setLiveStatus] = useState<Record<string, string>>({});
  const socketRef = useRef<Socket | null>(null);

  // Khởi tạo socket connection một lần
  useEffect(() => {
    const socket = io(API_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, []);

  const {
    data,
    isLoading,
    error: loadError,
    refetch,
    isFetching,
  } = useGetApiDevicesMy({ include_inactive: true });

  const { mutate: patchDevice } = usePatchApiDevicesDeviceId({
    mutation: {
      onSuccess: (res) => {
        setTogglingId(null);
        setToggleMsg((res?.data as { message?: string })?.message ?? 'Đã cập nhật thiết bị.');
        setToggleError('');
        void refetch();
      },
      onError: (err: Error) => {
        setTogglingId(null);
        setToggleError(err?.message ?? 'Cập nhật thất bại.');
        setToggleMsg('');
      },
    },
  });

  const handleToggle = (device: AdminDevice) => {
    if (!device.device_id) return;
    setTogglingId(device.device_id);
    setToggleMsg('');
    setToggleError('');
    patchDevice({ deviceId: device.device_id, data: { is_active: !device.is_active } });
  };

  const handleUnlink = (device: AdminDevice) => {
    if (!device.device_id || !token) return;
    setConfirmDevice(device);
  };

  const doUnlink = async () => {
    if (!confirmDevice?.device_id || !token) return;
    setUnlinkingId(confirmDevice.device_id);
    setUnlinkMsg('');
    setUnlinkError('');
    try {
      await deviceApi.unlink(confirmDevice.device_id, token);
      setUnlinkMsg(`Đã huỷ liên kết "${confirmDevice.name ?? confirmDevice.device_id}"`);
      void refetch();
    } catch (err) {
      setUnlinkError((err as Error)?.message ?? 'Huỷ liên kết thất bại');
    } finally {
      setUnlinkingId(null);
      setConfirmDevice(null);
    }
  };

  const devices: AdminDevice[] = (data?.status === 200
    ? (data.data as { data?: AdminDevice[] }).data
    : undefined) ?? [];

  // Đăng ký socket listener cho từng device khi danh sách thay đổi
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || devices.length === 0) return;
    const ids = devices.map((d) => d.device_id!).filter(Boolean);
    const handler = (payload: { device_id: string; status: string }) => {
      setLiveStatus((prev) => ({ ...prev, [payload.device_id]: payload.status }));
    };
    ids.forEach((id) => socket.on(`device-status-${id}`, handler));
    return () => { ids.forEach((id) => socket.off(`device-status-${id}`, handler)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.map((d) => d.device_id).join(',')]);

  const allowed = user?.role === 'patient' || user?.role === 'doctor';

  if (!allowed) {
    return (
      <div className="p-8 text-center text-slate-500">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {confirmDevice && (
        <ConfirmDialog
          device={confirmDevice}
          onConfirm={() => { void doUnlink(); }}
          onCancel={() => setConfirmDevice(null)}
          loading={unlinkingId === confirmDevice.device_id}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-sky-500" /> Thiết bị của tôi
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý thiết bị IoT được liên kết với tài khoản của bạn.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Status alerts */}
      {toggleMsg && <Alert type="success" msg={toggleMsg} />}
      {toggleError && <Alert type="error" msg={toggleError} />}
      {unlinkMsg && <Alert type="success" msg={unlinkMsg} />}
      {unlinkError && <Alert type="error" msg={unlinkError} />}

      {/* Claim form */}
      <ClaimDeviceForm onSuccess={() => refetch()} />

      {/* Device list */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Thiết bị đã liên kết ({devices.length})
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : loadError ? (
          <div className="py-8 text-center text-red-500 text-sm">
            Không thể tải danh sách thiết bị.
          </div>
        ) : devices.length === 0 ? (
          <div className="py-12 text-center">
            <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Chưa có thiết bị nào</p>
            <p className="text-slate-400 text-sm mt-1">
              Nhập ID thiết bị ở trên để claim và kích hoạt.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((d) => (
              <DeviceCard
                key={d.device_id}
                device={
                  liveStatus[d.device_id!]
                    ? { ...d, status: liveStatus[d.device_id!] }
                    : d
                }
                onToggle={handleToggle}
                toggling={togglingId === d.device_id}
                onUnlink={handleUnlink}
                unlinking={unlinkingId === d.device_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
