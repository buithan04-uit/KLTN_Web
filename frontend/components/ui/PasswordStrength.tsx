const rules = [
  { label: 'Ít nhất 8 ký tự', test: (p: string) => p.length >= 8 },
  { label: 'Có chữ thường (a-z)', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Có chữ hoa (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Có chữ số (0-9)', test: (p: string) => /\d/.test(p) },
];

/**
 * Hiển thị indicator 4 tiêu chí mật khẩu mạnh bên dưới input.
 * Tự ẩn nếu password rỗng.
 */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-1">
      {rules.map((rule) => {
        const ok = rule.test(password);
        return (
          <div
            key={rule.label}
            className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {rule.label}
          </div>
        );
      })}
    </div>
  );
}
