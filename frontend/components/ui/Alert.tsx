import { AlertCircle, CheckCircle } from 'lucide-react';

/** Thông báo lỗi dạng banner (ẩn tự động nếu message rỗng). */
export function ErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3.5 mb-5 text-sm">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/** Thông báo thành công dạng banner (ẩn tự động nếu message rỗng). */
export function SuccessAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3.5 mb-5 text-sm">
      <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
