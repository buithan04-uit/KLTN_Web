'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { AuthCard } from '@/components/ui/AuthCard';
import { ErrorAlert } from '@/components/ui/Alert';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { SubmitButton } from '@/components/ui/SubmitButton';

const INPUT_CLS = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none transition text-sm font-mono';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';

  const [token, setToken] = useState(tokenFromUrl);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [verifying, setVerifying] = useState(!!tokenFromUrl);
  const { loading, error, setError, run } = useAsyncAction();

  useEffect(() => {
    if (!tokenFromUrl) return;
    (async () => {
      try {
        const data = await authApi.verifyResetToken(tokenFromUrl);
        setVerifiedEmail(data.email);
      } catch {
        setError('Link \u0111\u00e3 h\u1ebft h\u1ea1n ho\u1eb7c kh\u00f4ng h\u1ee3p l\u1ec7. Vui l\u00f2ng y\u00eau c\u1ea7u \u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u l\u1ea1i.');
      } finally {
        setVerifying(false);
      }
    })();
  }, [tokenFromUrl, setError]);

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await authApi.resetPassword(token.trim(), newPassword);
      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    });
  };

  return (
    <AuthCard subtitle="Đặt mật khẩu mới">
      {verifying ? (
        <div className="flex flex-col items-center py-8 gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <span className="text-sm">Đang xác thực liên kết...</span>
        </div>
      ) : success ? (
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Đặt lại mật khẩu thành công!</h3>
          <p className="text-slate-500 text-sm mb-2">Đang chuyển đến trang đăng nhập...</p>
          <Loader2 className="w-4 h-4 animate-spin text-sky-500 mx-auto" />
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-800 mb-1">Đặt mật khẩu mới</h2>
          {verifiedEmail && (
            <p className="text-sm text-slate-500 mb-4">Tài khoản: <strong className="text-slate-700">{verifiedEmail}</strong></p>
          )}

          <ErrorAlert message={error} />

          {!tokenFromUrl && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Token / Mã OTP</label>
              <input type="text" placeholder="Nhập token hoặc mã OTP từ email" value={token} onChange={(e) => setToken(e.target.value)} required className={INPUT_CLS} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Mật khẩu mới <span className="text-red-400">*</span></label>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
            <p className="text-xs text-slate-400 mt-1.5">Tối thiểu 8 ký tự, có chữ hoa, chữ thường và số</p>
          </div>

          <SubmitButton loading={loading} label="Xác nhận mật khẩu mới" loadingLabel="Đang cập nhật..." disabled={!!error} />
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
