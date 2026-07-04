'use client';

import { useState } from 'react';
import {
  AuditLog,
  GetApiAdminSystemAuditLogsActorRole,
  useGetApiAdminSystemAuditLogs,
} from '@/lib/orval/api';
import { useAuth } from '@/context/AuthContext';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

type ActorRoleFilter = '' | 'admin' | 'doctor' | 'patient';

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
};

const roleBadgeClass: Record<string, string> = {
  admin: 'bg-red-50 text-red-700 border-red-100',
  doctor: 'bg-sky-50 text-sky-700 border-sky-100',
  patient: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

function RoleBadge({ role }: { role?: string | null }) {
  const className = role
    ? roleBadgeClass[role] ?? 'bg-slate-50 text-slate-600 border-slate-100'
    : 'bg-slate-50 text-slate-500 border-slate-100';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${className}`}>
      {role || 'system'}
    </span>
  );
}

function ActionBadge({ action }: { action?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
      <ShieldCheck className="w-3.5 h-3.5" />
      {action || '-'}
    </span>
  );
}

function MetaViewer({ meta }: { meta: AuditLog['meta'] }) {
  const [expanded, setExpanded] = useState(false);

  if (!meta || Object.keys(meta as object).length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  let preview = '';
  let formatted = '';
  try {
    preview = JSON.stringify(meta);
    formatted = JSON.stringify(meta, null, 2);
  } catch {
    preview = '[unreadable meta]';
    formatted = preview;
  }

  return (
    <div className="space-y-1">
      <code
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(ev) => { if (ev.key === 'Enter') setExpanded((e) => !e); }}
        className="block max-w-xs truncate rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
        title="Nhấn để xem đầy đủ"
      >
        {preview}
      </code>
      {expanded && (
        <pre className="rounded-xl bg-slate-900 p-3 text-xs text-emerald-300 overflow-x-auto max-w-sm whitespace-pre leading-relaxed">
          {formatted}
        </pre>
      )}
    </div>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
      <td className="px-4 py-3 align-top">
        <div className="flex flex-col gap-1">
          <ActionBadge action={log.action} />
          <span className="text-xs text-slate-400">#{log.id ?? '-'}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-col gap-1">
          <RoleBadge role={log.actor_role} />
          <span className="text-xs text-slate-500">ID: {log.actor_id ?? '-'}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="text-sm text-slate-700">{log.target_type ?? '-'}</div>
        <div className="text-xs text-slate-400 font-mono">{log.target_id ?? '-'}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="text-xs text-slate-500">{log.ip ?? '-'}</div>
        <div className="max-w-xs truncate text-xs text-slate-400" title={log.user_agent ?? ''}>
          {log.user_agent ?? '-'}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <MetaViewer meta={log.meta} />
      </td>
      <td className="px-4 py-3 align-top text-xs text-slate-500 whitespace-nowrap">
        {formatDateTime(log.created_at)}
      </td>
    </tr>
  );
}

export default function AdminAuditLogsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [actionInput, setActionInput] = useState('');
  const [action, setAction] = useState('');
  const [actorRole, setActorRole] = useState<ActorRoleFilter>('');

  const queryParams = {
    page,
    limit: 15,
    ...(action ? { action } : {}),
    ...(actorRole ? { actor_role: GetApiAdminSystemAuditLogsActorRole[actorRole] } : {}),
  };

  const { data, isLoading, isFetching, error, refetch } = useGetApiAdminSystemAuditLogs(
    queryParams,
    { query: { staleTime: 30_000 } }
  );

  const response = data?.data;
  const logs: AuditLog[] = response && 'data' in response ? response.data ?? [] : [];
  const pagination = response && 'pagination' in response ? response.pagination : undefined;
  const totalPages = pagination?.pages ?? 1;
  const currentPage = pagination?.page ?? page;
  const total = pagination?.total ?? logs.length;

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAction(actionInput.trim());
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center text-slate-500">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-sky-500" />
            Audit Logs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi hành động quan trọng trong hệ thống consent, doctor access và quản trị.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{total}</p>
              <p className="text-xs text-slate-500">Tổng log theo bộ lọc</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              <UserRound className="w-4 h-4" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{actorRole || 'all'}</p>
              <p className="text-xs text-slate-500">Actor role</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {logs[0]?.created_at ? formatDateTime(logs[0].created_at) : '-'}
              </p>
              <p className="text-xs text-slate-500">Log mới nhất</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2.5">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={actionInput}
              onChange={(event) => setActionInput(event.target.value)}
              placeholder="Lọc theo action, ví dụ: consent, revoke, access..."
              className="min-w-0 flex-1 text-sm outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={actorRole}
              onChange={(event) => {
                setActorRole(event.target.value as ActorRoleFilter);
                setPage(1);
              }}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="">Tất cả role</option>
              <option value="admin">Admin</option>
              <option value="doctor">Doctor</option>
              <option value="patient">Patient</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 transition-colors"
          >
            Áp dụng
          </button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error instanceof Error ? error.message : 'Không tải được audit logs.'}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-14 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Không có audit log phù hợp</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-260">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Action
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Actor
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Target
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Client
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Meta
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Thoi gian
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <AuditRow key={log.id ?? `${log.action}-${log.created_at}`} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Trang {currentPage} / {totalPages} - {total} logs
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Trang trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Trang sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
