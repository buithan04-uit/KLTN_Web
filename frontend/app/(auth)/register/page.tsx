'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { AuthCard } from '@/components/ui/AuthCard';
import { ErrorAlert, SuccessAlert } from '@/components/ui/Alert';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { SubmitButton } from '@/components/ui/SubmitButton';

const INPUT_CLS = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none transition text-sm';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' });
  const [success, setSuccess] = useState('');
  const { loading, error, run } = useAsyncAction();

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const payload: Parameters<typeof authApi.register>[0] = { email: form.email, password: form.password };
      if (form.full_name) payload.full_name = form.full_name;
      if (form.phone) payload.phone = form.phone;
      await authApi.register(payload);
      setSuccess('Tạo tài khoản thành công! Đang chuyển đến trang đăng nhập...');
      setTimeout(() => router.push('/login'), 2000);
    });
  };

  return (
    <AuthCard>
      <h2 className="text-xl font-semibold text-slate-800 mb-6">Tạo tài khoản bệnh nhân</h2>

      <ErrorAlert message={error} />
      <SuccessAlert message={success} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Họ và tên</label>
            <input type="text" placeholder="Nguyễn Văn A" value={form.full_name} onChange={set('full_name')} className={INPUT_CLS} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Số điện thoại</label>
            <input type="tel" placeholder="0901234567" value={form.phone} onChange={set('phone')} className={INPUT_CLS} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email <span className="text-red-400">*</span></label>
          <input type="email" autoComplete="email" placeholder="patient@gmail.com" value={form.email} onChange={set('email')} required className={INPUT_CLS} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Mật khẩu <span className="text-red-400">*</span></label>
          <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" required />
          <PasswordStrength password={form.password} />
        </div>

        <SubmitButton loading={loading} label="Tạo tài khoản" className="mt-2" />
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Đã có tài khoản?{' '}
        <Link href="/login" className="text-sky-600 font-medium hover:text-sky-700 transition">Đăng nhập</Link>
      </p>
    </AuthCard>
  );
}