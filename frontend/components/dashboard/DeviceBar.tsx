import { Search, RefreshCw, ChevronDown } from 'lucide-react';

interface DeviceBarProps {
  inputDeviceId: string;
  onInputChange: (value: string) => void;
  onSearch: (e: React.FormEvent) => void;
  loading: boolean;
  onRefresh: () => void;
  /** Nếu truyền vào thì hiển thị limit selector */
  limit?: number;
  onLimitChange?: (n: number) => void;
}

const LIMIT_OPTIONS = [20, 50, 100, 200];

/**
 * Thanh công cụ cho dashboard: ô tìm device ID, chọn limit (tùy chọn), nút làm mới.
 */
export function DeviceBar({
  inputDeviceId,
  onInputChange,
  onSearch,
  loading,
  onRefresh,
  limit,
  onLimitChange,
}: DeviceBarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Device search */}
      <form
        onSubmit={onSearch}
        className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm"
      >
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={inputDeviceId}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Device ID"
          className="w-28 text-sm outline-none bg-transparent text-slate-700 placeholder:text-slate-400"
        />
        <button
          type="submit"
          className="text-xs text-sky-600 font-medium hover:text-sky-700 transition"
        >
          Tìm
        </button>
      </form>

      {/* Limit selector (tùy chọn) */}
      {limit !== undefined && onLimitChange && (
        <div className="relative inline-flex items-center">
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="appearance-none bg-white border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-sm text-slate-700 outline-none shadow-sm focus:border-sky-400 cursor-pointer"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} bản ghi</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      )}

      {/* Refresh */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:text-sky-600 hover:border-sky-300 shadow-sm transition disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        Làm mới
      </button>
    </div>
  );
}
