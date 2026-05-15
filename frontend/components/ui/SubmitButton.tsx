import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
  loading: boolean;
  label: string;
  /** Nhãn hiển thị khi đang loading. Mặc định: "Đang xử lý..." */
  loadingLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Nút submit dùng chung: disabled + spinner khi loading.
 */
export function SubmitButton({ loading, label, loadingLabel = 'Đang xử lý...', disabled, className = '' }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className={`w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-semibold rounded-xl shadow-md shadow-sky-500/20 transition flex items-center justify-center gap-2 ${className}`}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {loading ? loadingLabel : label}
    </button>
  );
}
