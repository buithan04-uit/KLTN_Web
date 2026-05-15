'use client';

import { useState, useCallback } from 'react';
import {
  useGetApiAdminSystemDevices,
  useGetApiAdminSystemOverview,
  usePatchApiAdminSystemDevicesDeviceIdActive,
  usePatchApiAdminSystemDevicesDeviceIdOwner,
  GetApiAdminSystemDevicesStatus,
} from '@/lib/orval/api';
import type { AdminDevice, AdminSystemOverview } from '@/lib/orval/api';
import {
  Cpu, Search, RefreshCw, Wifi, WifiOff, Power, PowerOff,
  UserCheck, UserX, CheckCircle, AlertCircle, Loader2,
  Users, Activity, Server, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

// ── helpers ────────────────────────────────────────────────────────────────

const formatDate = (v?: string | null) =>
  v ? new Date(v).toLocaleString('vi-VN') : '—';

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

function StatusBadge({ active, status }: { active?: boolean; status?: string | null }) {
  if (!active)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
        <PowerOff className="w-3 h-3" /> Vô hiệu
      </span>
    );
  return status === 'online' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
      <Wifi className="w-3 h-3" /> Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <WifiOff className="w-3 h-3" /> Offline
    </span>
  );
}

// ── Overview cards ─────────────────────────────────────────────────────────

function OverviewCards({ overview }: { overview?: AdminSystemOverview }) {
  const stats = [
    {
      label: 'Tổng thiết bị',
      value: overview?.devices?.total_devices ?? '—',
      sub: `${overview?.devices?.active_devices ?? 0} hoạt động · ${overview?.devices?.online_devices ?? 0} online`,
      icon: Cpu,
      color: 'sky',
    },
    {
      label: 'Người dùng',
      value: overview?.users?.total_users ?? '—',
      sub: `${overview?.users?.doctors ?? 0} bác sĩ · ${overview?.users?.patients ?? 0} bệnh nhân`,
      icon: Users,
      color: 'violet',
    },
    {
      label: 'Server uptime',
      value: overview?.server?.uptime_seconds != null
        ? `${Math.floor(overview.server.uptime_seconds / 3600)}h`
        : '—',
      sub: overview?.server?.timestamp
        ? `Lúc ${new Date(overview.server.timestamp).toLocaleTimeString('vi-VN')}`
        : '',
      icon: Server,
      color: 'emerald',
    },
    {
      label: 'MQTT',
      value: overview?.mqtt?.connected ? 'Kết nối' : (overview?.mqtt?.connected === false ? 'Ngắt kết nối' : '—'),
      sub: overview?.mqtt?.last_message_at
        ? `Lần cuối: ${new Date(overview.mqtt.last_message_at).toLocaleTimeString('vi-VN')}`
        : '',
      icon: Activity,
      color: overview?.mqtt?.connected ? 'emerald' : 'red',
    },
  ];

  const colorMap: Record<string, string> = {
    sky: 'bg-sky-50 border-sky-100 text-sky-600',
    violet: 'bg-violet-50 border-violet-100 text-violet-600',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    red: 'bg-red-50 border-red-100 text-red-500',
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3 ${colorMap[s.color]}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{String(s.value)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            <p className="text-xs text-slate-400 mt-1 truncate">{s.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Assign owner modal ─────────────────────────────────────────────────────

function AssignOwnerModal({
  device,
  onClose,
  onSave,
  saving,
}: {
  device: AdminDevice;
  onClose: () => void;
  onSave: (ownerId: number | null) => void;
  saving: boolean;
}) {
  const [value, setValue] = useState<string>(device.owner_id ? String(device.owner_id) : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="font-semibold text-slate-800 mb-1">Gán chủ sở hữu</h3>
        <p className="text-xs text-slate-500 mb-4 font-mono">{device.device_id}</p>
        {device.owner_email && (
          <p className="text-sm text-slate-600 mb-4">
            Hiện tại: <span className="font-medium">{device.owner_name ?? device.owner_email}</span>
          </p>
        )}
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          ID người dùng mới
        </label>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Để trống để huỷ gán"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent mb-4 placeholder:text-slate-400"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Huỷ
          </button>
          <button
            onClick={() => onSave(value ? Number(value) : null)}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Device table row ───────────────────────────────────────────────────────

function DeviceRow({
  device,
  onToggleActive,
  onAssign,
  togglingId,
}: {
  device: AdminDevice;
  onToggleActive: (d: AdminDevice) => void;
  onAssign: (d: AdminDevice) => void;
  togglingId: string | null;
}) {
  const isToggling = togglingId === device.device_id;
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-slate-800 text-sm font-mono">{device.device_id}</p>
          {device.name && <p className="text-xs text-slate-500 mt-0.5">{device.name}</p>}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{device.type ?? '—'}</td>
      <td className="px-4 py-3">
        <StatusBadge active={device.is_active} status={device.status} />
      </td>
      <td className="px-4 py-3">
        {device.owner_email ? (
          <div>
            <p className="text-sm text-slate-700 font-medium">
              {device.owner_name ?? device.owner_email}
            </p>
            <p className="text-xs text-slate-400">{device.owner_email}</p>
          </div>
        ) : (
          <span className="text-slate-400 text-sm italic">Chưa có</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(device.last_seen_at)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Toggle active */}
          <button
            onClick={() => onToggleActive(device)}
            disabled={isToggling}
            title={device.is_active ? 'Vô hiệu hoá' : 'Kích hoạt'}
            className={`p-1.5 rounded-lg transition-colors ${
              device.is_active
                ? 'text-red-500 hover:bg-red-50'
                : 'text-emerald-600 hover:bg-emerald-50'
            } disabled:opacity-50`}
          >
            {isToggling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : device.is_active ? (
              <Power className="w-4 h-4" />
            ) : (
              <PowerOff className="w-4 h-4" />
            )}
          </button>

          {/* Assign owner */}
          <button
            onClick={() => onAssign(device)}
            title={device.owner_id ? 'Đổi chủ sở hữu' : 'Gán chủ sở hữu'}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            {device.owner_id ? (
              <UserCheck className="w-4 h-4" />
            ) : (
              <UserX className="w-4 h-4" />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminDevicesPage() {
  const { user, token } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'online' | 'offline' | ''>('');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceType, setNewDeviceType] = useState('wearable');
  const [isCreatingDevice, setIsCreatingDevice] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [assignDevice, setAssignDevice] = useState<AdminDevice | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');

  // Queries
  const { data: devicesData, isLoading, refetch, isFetching } = useGetApiAdminSystemDevices(
    {
      page,
      limit: 15,
      ...(search ? { search } : {}),
      ...(statusFilter ? { status: statusFilter === 'online' ? GetApiAdminSystemDevicesStatus.online : GetApiAdminSystemDevicesStatus.offline } : {}),
    },
    { query: { staleTime: 30_000 } }
  );

  const { data: overviewData } = useGetApiAdminSystemOverview({
    query: { staleTime: 60_000 },
  });

  // Mutations
  const { mutate: toggleActive } = usePatchApiAdminSystemDevicesDeviceIdActive({
    mutation: {
      onSuccess: (res) => {
        setTogglingId(null);
        setActionMsg((res?.data as { message?: string })?.message ?? 'Đã cập nhật trạng thái.');
        setActionError('');
        void refetch();
      },
      onError: (err: { message?: string; response?: { data?: { message?: string } } }) => {
        setTogglingId(null);
        setActionError(err?.response?.data?.message ?? err?.message ?? 'Cập nhật thất bại.');
        setActionMsg('');
      },
    },
  });

  const { mutate: assignOwner, isPending: isAssigning } = usePatchApiAdminSystemDevicesDeviceIdOwner({
    mutation: {
      onSuccess: (res) => {
        setAssignDevice(null);
        setActionMsg((res?.data as { message?: string })?.message ?? 'Đã cập nhật chủ sở hữu.');
        setActionError('');
        void refetch();
      },
      onError: (err: { message?: string; response?: { data?: { message?: string } } }) => {
        setAssignDevice(null);
        setActionError(err?.response?.data?.message ?? err?.message ?? 'Gán chủ sở hữu thất bại.');
        setActionMsg('');
      },
    },
  });

  // Handlers
  const handleToggleActive = useCallback(
    (device: AdminDevice) => {
      if (!device.device_id) return;
      setTogglingId(device.device_id);
      setActionMsg('');
      setActionError('');
      toggleActive({ deviceId: device.device_id, data: { is_active: !device.is_active } });
    },
    [toggleActive]
  );

  const handleAssignSave = useCallback(
    (ownerId: number | null) => {
      if (!assignDevice?.device_id) return;
      assignOwner({ deviceId: assignDevice.device_id, data: { owner_id: ownerId } });
    },
    [assignDevice, assignOwner]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setActionError('Thiếu token xác thực. Vui lòng đăng nhập lại.');
      setActionMsg('');
      return;
    }

    const device_id = newDeviceId.trim();
    const name = newDeviceName.trim();
    const type = newDeviceType.trim().toLowerCase();

    if (!/^[A-Za-z0-9_-]{3,64}$/.test(device_id)) {
      setActionError('Device ID không hợp lệ (3-64 ký tự, chỉ gồm chữ/số/_/-).');
      setActionMsg('');
      return;
    }
    if (!name) {
      setActionError('Tên thiết bị là bắt buộc.');
      setActionMsg('');
      return;
    }

    setIsCreatingDevice(true);
    setActionError('');
    setActionMsg('');

    try {
      const res = await fetch(`${API_URL}/api/admin/system/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ device_id, name, type }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(json?.error ?? json?.message ?? 'Thêm thiết bị thất bại.');
        return;
      }

      setActionMsg(json?.message ?? 'Đã thêm thiết bị vào hệ thống.');
      setNewDeviceId('');
      setNewDeviceName('');
      setNewDeviceType('wearable');
      void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Thêm thiết bị thất bại.');
    } finally {
      setIsCreatingDevice(false);
    }
  };

  const devicesResponse = devicesData?.data;
  const overviewResponse = overviewData?.data;
  const devices: AdminDevice[] =
    devicesResponse && 'data' in devicesResponse ? devicesResponse.data ?? [] : [];
  const pagination =
    devicesResponse && 'pagination' in devicesResponse ? devicesResponse.pagination : undefined;
  const totalPages = pagination?.pages ?? 1;
  const currentPage = pagination?.page ?? 1;
  const totalDevices = pagination?.total ?? devices.length;
  const overview: AdminSystemOverview | undefined =
    overviewResponse && 'devices' in overviewResponse ? overviewResponse : undefined;

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center text-slate-500">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-sky-500" /> Quản lý Thiết bị
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Toàn bộ thiết bị IoT trong hệ thống.
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

      {/* Overview */}
      <OverviewCards overview={overview} />

      {/* Alerts */}
      {actionMsg && <Alert type="success" msg={actionMsg} />}
      {actionError && <Alert type="error" msg={actionError} />}

      {/* Create device */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <form onSubmit={handleCreateDevice} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-44">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Device ID
            </label>
            <input
              value={newDeviceId}
              onChange={(e) => setNewDeviceId(e.target.value)}
              placeholder="VD: ESP32_A1B2"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <div className="flex-1 min-w-44">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Tên thiết bị
            </label>
            <input
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="VD: Cảm biến ECG"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <div className="min-w-40">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Loại
            </label>
            <select
              value={newDeviceType}
              onChange={(e) => setNewDeviceType(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="wearable">Wearable</option>
              <option value="patch">Patch</option>
              <option value="gateway">Gateway</option>
              <option value="sensor">Sensor</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isCreatingDevice}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isCreatingDevice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            {isCreatingDevice ? 'Đang thêm...' : 'Thêm thiết bị'}
          </button>
        </form>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-48">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo ID, tên, email chủ…"
              className="flex-1 text-sm outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'online' | 'offline' | '');
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors"
          >
            Tìm kiếm
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : devices.length === 0 ? (
          <div className="py-12 text-center">
            <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Không tìm thấy thiết bị nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Thiết bị
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Loại
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Trạng thái
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Chủ sở hữu
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Lần cuối
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <DeviceRow
                    key={d.device_id}
                    device={d}
                    onToggleActive={handleToggleActive}
                    onAssign={setAssignDevice}
                    togglingId={togglingId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Trang {currentPage} / {totalPages} &nbsp;·&nbsp; {totalDevices} thiết bị
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assign owner modal */}
      {assignDevice && (
        <AssignOwnerModal
          device={assignDevice}
          onClose={() => setAssignDevice(null)}
          onSave={handleAssignSave}
          saving={isAssigning}
        />
      )}
    </div>
  );
}
