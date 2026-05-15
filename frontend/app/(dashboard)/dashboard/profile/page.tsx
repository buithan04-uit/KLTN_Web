'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { useGetProfile, useUpdateProfile, useUploadAvatar } from '@/lib/orval/api';
import type { GetProfile200, UpdateProfileBody } from '@/lib/orval/api';
import { useAuth } from '@/context/AuthContext';
import {
  User, Camera, Save, Loader2, CheckCircle, AlertCircle,
  Phone, Calendar, Droplets, Ruler, Weight, FileText,
  Briefcase, GraduationCap, Building2, BookOpen,
} from 'lucide-react';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

// Extended types to include doctor/admin fields not yet in orval-generated types
type ExtendedProfile = GetProfile200 & {
  specialty?: string | null;
  license_number?: string | null;
  workplace?: string | null;
  bio?: string | null;
  department?: string | null;
};

type ExtendedUpdateBody = UpdateProfileBody & {
  specialty?: string;
  license_number?: string;
  workplace?: string;
  bio?: string;
  department?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

const normalizeDateForInput = (value?: string | null) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

// ── banner thành công / lỗi ────────────────────────────────────────────────
function StatusBanner({ success, error }: { success: string; error: string }) {
  if (success) return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
      <CheckCircle className="w-4 h-4 shrink-0" /> {success}
    </div>
  );
  if (error) return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0" /> {error}
    </div>
  );
  return null;
}

// ── field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5" /> {label}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder:text-slate-400';

// ── Profile form — receives pre-loaded profile so no effect needed ────────────
function ProfileForm({ profile, onRefetch }: { profile: ExtendedProfile; onRefetch: () => void }) {
  const [form, setForm] = useState<ExtendedUpdateBody>({
    first_name: profile.first_name ?? '',
    last_name: profile.last_name ?? '',
    phone: profile.phone ?? '',
    date_of_birth: normalizeDateForInput(profile.date_of_birth),
    blood_type: (profile.blood_type as UpdateProfileBody['blood_type']) ?? undefined,
    height: profile.height ?? undefined,
    weight: profile.weight ?? undefined,
    underlying_conditions: profile.underlying_conditions ?? '',
    specialty: profile.specialty ?? '',
    license_number: profile.license_number ?? '',
    workplace: profile.workplace ?? '',
    bio: profile.bio ?? '',
    department: profile.department ?? '',
  });
  const [success, setSuccess] = useState('');
  const [err, setErr] = useState('');

  const set = (key: keyof ExtendedUpdateBody, value: string | number | undefined) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    setForm({
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      phone: profile.phone ?? '',
      date_of_birth: normalizeDateForInput(profile.date_of_birth),
      blood_type: (profile.blood_type as UpdateProfileBody['blood_type']) ?? undefined,
      height: profile.height ?? undefined,
      weight: profile.weight ?? undefined,
      underlying_conditions: profile.underlying_conditions ?? '',
      specialty: profile.specialty ?? '',
      license_number: profile.license_number ?? '',
      workplace: profile.workplace ?? '',
      bio: profile.bio ?? '',
      department: profile.department ?? '',
    });
  }, [profile]);

  const updateMutation = useUpdateProfile({
    mutation: {
      onSuccess: () => {
        setSuccess('Cập nhật hồ sơ thành công!');
        setErr('');
        onRefetch();
        setTimeout(() => setSuccess(''), 4000);
      },
      onError: () => {
        setErr('Cập nhật thất bại. Vui lòng thử lại.');
        setSuccess('');
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setSuccess('');
    const payload: ExtendedUpdateBody = {
      ...form,
      date_of_birth: form.date_of_birth ?? '',
      underlying_conditions: form.underlying_conditions ?? '',
      specialty: form.specialty,
      license_number: form.license_number,
      workplace: form.workplace,
      bio: form.bio,
      department: form.department,
    };
    updateMutation.mutate({ data: payload as UpdateProfileBody });
  };

  const isSaving = updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
      <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
        {profile.role === 'patient' ? 'Thông tin sức khỏe' : profile.role === 'doctor' ? 'Thông tin bác sĩ' : 'Thông tin quản trị viên'}
      </h2>

      <StatusBanner success={success} error={err} />

      {/* Họ & Tên */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Họ" icon={User}>
          <input
            type="text"
            placeholder="Nguyễn"
            value={form.last_name ?? ''}
            onChange={(e) => set('last_name', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Tên" icon={User}>
          <input
            type="text"
            placeholder="Văn A"
            value={form.first_name ?? ''}
            onChange={(e) => set('first_name', e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Điện thoại & Ngày sinh */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Số điện thoại" icon={Phone}>
          <input
            type="tel"
            placeholder="0901234567"
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Ngày sinh" icon={Calendar}>
          <input
            type="date"
            value={form.date_of_birth ?? ''}
            onChange={(e) => set('date_of_birth', e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {profile.role === 'patient' && (<>
      {/* Nhóm máu, Chiều cao, Cân nặng */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Nhóm máu" icon={Droplets}>
          <select
            value={form.blood_type ?? ''}
            onChange={(e) => set('blood_type', e.target.value || undefined)}
            className={inputCls}
          >
            <option value="">— Chọn —</option>
            {BLOOD_TYPES.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
          </select>
        </Field>
        <Field label="Chiều cao (cm)" icon={Ruler}>
          <input
            type="number"
            placeholder="170"
            min={50} max={250} step={0.1}
            value={form.height ?? ''}
            onChange={(e) => set('height', e.target.value ? parseFloat(e.target.value) : undefined)}
            className={inputCls}
          />
        </Field>
        <Field label="Cân nặng (kg)" icon={Weight}>
          <input
            type="number"
            placeholder="65"
            min={10} max={300} step={0.1}
            value={form.weight ?? ''}
            onChange={(e) => set('weight', e.target.value ? parseFloat(e.target.value) : undefined)}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Bệnh nền */}
      <Field label="Bệnh nền" icon={FileText}>
        <textarea
          rows={3}
          placeholder="Ví dụ: Tiểu đường type 2, Huyết áp cao..."
          value={form.underlying_conditions ?? ''}
          onChange={(e) => set('underlying_conditions', e.target.value)}
          className={`${inputCls} resize-none`}
        />
      </Field>
      </>)}

      {profile.role === 'doctor' && (<>
      <div className="border-t border-slate-100 pt-4 space-y-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hành nghề bác sĩ</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Chuyên khoa" icon={GraduationCap}>
            <input
              type="text"
              placeholder="Tim mạch, Nội tâm mạch..."
              value={form.specialty ?? ''}
              onChange={(e) => set('specialty', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Số chứng chỉ hành nghề" icon={BookOpen}>
            <input
              type="text"
              placeholder="VD: 001234/BYT-CCHN"
              value={form.license_number ?? ''}
              onChange={(e) => set('license_number', e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Nơi công tác" icon={Building2}>
          <input
            type="text"
            placeholder="Bệnh viện, phòng khám..."
            value={form.workplace ?? ''}
            onChange={(e) => set('workplace', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Giới thiệu" icon={FileText}>
          <textarea
            rows={3}
            placeholder="Mô tả kinh nghiệm, chuyên môn..."
            value={form.bio ?? ''}
            onChange={(e) => set('bio', e.target.value)}
            className={`${inputCls} resize-none`}
          />
        </Field>
      </div>
      </>)}

      {profile.role === 'admin' && (<>
      <div className="border-t border-slate-100 pt-4 space-y-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Thông tin quản trị</h3>
        <Field label="Phòng ban" icon={Briefcase}>
          <input
            type="text"
            placeholder="VD: CNTT, Hành chính..."
            value={form.department ?? ''}
            onChange={(e) => set('department', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Giới thiệu" icon={FileText}>
          <textarea
            rows={3}
            placeholder="Mô tả vai trò, trách nhiệm..."
            value={form.bio ?? ''}
            onChange={(e) => set('bio', e.target.value)}
            className={`${inputCls} resize-none`}
          />
        </Field>
      </div>
      </>)}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 transition disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Đang lưu...' : 'Lưu hồ sơ'}
        </button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarMsg, setAvatarMsg] = useState('');

  const { data: resp, isLoading, refetch } = useGetProfile({
    query: { enabled: !!token },
  });

  const profile: ExtendedProfile | null = resp?.status === 200 ? resp.data as ExtendedProfile : null;

  const avatarMutation = useUploadAvatar({
    mutation: {
      onSuccess: () => {
        setAvatarMsg('Đã cập nhật ảnh đại diện!');
        void refetch();
        setTimeout(() => setAvatarMsg(''), 4000);
      },
      onError: () => setAvatarMsg('Upload ảnh thất bại.'),
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Orval-generated uploadAvatar() builds FormData internally from { avatar: Blob }
    avatarMutation.mutate({ data: { avatar: file } });
  };

  const roleLabel: Record<string, string> = {
    admin: 'Quản trị viên', doctor: 'Bác sĩ', patient: 'Bệnh nhân',
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
    </div>
  );

  const avatarSrc = profile?.avatar_url ? `${API_URL}${profile.avatar_url}` : null;
  const isUploading = avatarMutation.isPending;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Hồ sơ cá nhân</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {profile?.role === 'patient'
            ? 'Quản lý thông tin sức khỏe của bạn'
            : profile?.role === 'doctor'
            ? 'Thông tin hành nghề của bạn'
            : 'Thông tin quản trị viên'}
        </p>
      </div>

      {/* Avatar card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-6 shadow-sm">
        <div className="relative shrink-0">
          <div className="w-24 h-24 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
            {avatarSrc ? (
              <Image src={avatarSrc} alt="avatar" width={96} height={96} className="object-cover w-full h-full" unoptimized />
            ) : (
              <User className="w-10 h-10 text-slate-400" />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md hover:bg-sky-600 transition disabled:opacity-60"
          >
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-slate-800 truncate">
            {profile?.full_name || profile?.email || '—'}
          </p>
          <p className="text-sm text-slate-500">
            {profile?.role ? roleLabel[profile.role] : '—'} · {profile?.email}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Tham gia: {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('vi-VN') : '—'}
          </p>
      {/* Profile info strip — show specialty/workplace for doctor, department for admin */}
      {profile && profile.role === 'doctor' && (profile.specialty || profile.workplace) && (
        <div className="flex flex-wrap gap-3 text-sm text-slate-600">
          {profile.specialty && (
            <span className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 border border-sky-100 px-3 py-1 rounded-full">
              <GraduationCap className="w-3.5 h-3.5" /> {profile.specialty}
            </span>
          )}
          {profile.workplace && (
            <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full">
              <Building2 className="w-3.5 h-3.5" /> {profile.workplace}
            </span>
          )}
          {profile.license_number && (
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full">
              <BookOpen className="w-3.5 h-3.5" /> {profile.license_number}
            </span>
          )}
        </div>
      )}
      {profile && profile.role === 'admin' && profile.department && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 border border-violet-100 px-3 py-1 rounded-full">
            <Briefcase className="w-3.5 h-3.5" /> {profile.department}
          </span>
        </div>
      )}
      {avatarMsg && <p className="text-xs text-sky-600 mt-1">{avatarMsg}</p>}
        </div>
      </div>

      {/* Profile form — key ensures form re-mounts with fresh defaults after refetch */}
      {profile && (
        <ProfileForm key={profile.id} profile={profile} onRefetch={() => void refetch()} />
      )}
    </div>
  );
}
