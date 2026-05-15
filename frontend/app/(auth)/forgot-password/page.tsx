'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowLeft, Mail, KeyRound } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { AuthCard } from '@/components/ui/AuthCard';
import { ErrorAlert } from '@/components/ui/Alert';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Step = 'request' | 'verify' | 'reset' | 'done';

const INPUT_CLS = 'w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none transition text-sm';

const STEP_META = [{ label: 'Nhập email' }, { label: 'Xác thực mã' }, { label: 'Mật khẩu mới' }];

function StepIndicator({ current }: { current: Step }) {
  const idx = current === 'request' ? 0 : current === 'verify' ? 1 : 2;
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEP_META.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2 flex-1 last:flex-none">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all
            ${i < idx ? 'bg-sky-500 text-white' : i === idx ? 'bg-sky-500 text-white ring-4 ring-sky-500/20' : 'bg-slate-100 text-slate-400'}`}>
            {i < idx ? '✓' : i + 1}
          </div>
          <span className={`text-xs font-medium hidden sm:inline truncate ${i === idx ? 'text-sky-600' : 'text-slate-400'}`}>
            {s.label}
          </span>
          {i < STEP_META.length - 1 && (
            <div className={`h-px flex-1 mx-1 ${i < idx ? 'bg-sky-400' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { loading, error, setError, run } = useAsyncAction();

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await authApi.forgotPassword(email);
      setStep('verify');
    });
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const data = await authApi.verifyResetToken(token.trim());
      setVerifiedEmail(data.email);
      setStep('reset');
    });
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await authApi.resetPassword(token.trim(), newPassword);
      setStep('done');
    });
  };

  return (
    <AuthCard subtitle="Đặt lại mật khẩu">
      {step !== 'done' && <StepIndicator current={step} />}

      <ErrorAlert message={error} />

      {step === 'request' && (
        <form onSubmit={handleRequest} className="space-y-4">
          <div>
            <p className="text-slate-600 text-sm mb-4">
              Nhập email tài khoản của bạn. Chúng tôi sẽ gửi link và mã OTP để đặt lại mật khẩu.
            </p>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="email" placeholder="patient@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={INPUT_CLS} />
            </div>
          </div>
          <SubmitButton loading={loading} label="Gửi hướng dẫn đặt lại" loadingLabel="Đang gửi..." />
        </form>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="bg-sky-50 rounded-xl p-4 text-sm text-sky-700 border border-sky-100">
            <p className="font-medium mb-1">📧 Email đã được gửi!</p>
            <p>Kiểm tra hộp thư của <strong>{email}</strong>. Nhập mã OTP 6 chữ số hoặc token từ link email.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Mã xác thực (OTP hoặc Token)</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="123456 hoặc token từ email" value={token} onChange={(e) => setToken(e.target.value)} required className={`${INPUT_CLS} font-mono`} />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Mã có hiệu lực trong <strong>15 phút</strong></p>
          </div>
          <SubmitButton loading={loading} label="Xác thực mã" loadingLabel="Đang xác thực..." />
          <button type="button" onClick={() => { setStep('request'); setError(''); }}
            className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm flex items-center justify-center gap-1.5 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Quay lại
          </button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={handleReset} className="space-y-4">
          {verifiedEmail && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-sm text-emerald-700">
              ✓ Đang đặt lại mật khẩu cho <strong>{verifiedEmail}</strong>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Mật khẩu mới <span className="text-red-400">*</span></label>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
            <p className="text-xs text-slate-400 mt-1.5">Tối thiểu 8 ký tự, có chữ hoa, chữ thường và số</p>
          </div>
          <SubmitButton loading={loading} label="Đặt mật khẩu mới" loadingLabel="Đang cập nhật..." />
        </form>
      )}

      {step === 'done' && (
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Thành công!</h3>
          <p className="text-slate-500 text-sm mb-6">Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại với mật khẩu mới.</p>
          <button onClick={() => router.push('/login')}
            className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl shadow-md shadow-sky-500/20 transition">
            Đăng nhập ngay
          </button>
        </div>
      )}

      {step !== 'done' && (
        <p className="text-center text-sm text-slate-500 mt-6">
          <Link href="/login" className="text-sky-600 font-medium hover:text-sky-700 transition flex items-center justify-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Quay lại đăng nhập
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
