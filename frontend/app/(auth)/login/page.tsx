'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { AuthCard } from '@/components/ui/AuthCard';
import { ErrorAlert } from '@/components/ui/Alert';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { SubmitButton } from '@/components/ui/SubmitButton';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const { loading, error, run } = useAsyncAction();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const data = await authApi.login(form);
      login(data.token, data.user);
      router.push('/dashboard');
    });
  };

  return (
    <AuthCard>
      <h2 className="text-xl font-semibold text-slate-800 mb-6">Đăng nhập</h2>

      <ErrorAlert message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
          <input
            type="email"
            autoComplete="email"
            placeholder="patient@gmail.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none transition text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Mật khẩu</label>
          <PasswordInput
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <div className="flex justify-end mt-1.5">
            <Link href="/forgot-password" className="text-xs text-sky-600 hover:text-sky-700 transition">
              Quên mật khẩu?
            </Link>
          </div>
        </div>

        <SubmitButton loading={loading} label="Đăng nhập" loadingLabel="Đang đăng nhập..." className="mt-2" />
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Chưa có tài khoản?{' '}
        <Link href="/register" className="text-sky-600 font-medium hover:text-sky-700 transition">
          Đăng ký ngay
        </Link>
      </p>
    </AuthCard>
  );
}
