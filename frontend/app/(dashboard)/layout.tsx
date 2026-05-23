'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Heart, Activity, AlertTriangle, LogOut, User, ChevronRight, Loader2, UserCircle, Cpu, FlaskConical, FileText, BrainCircuit } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

type AppRole = 'admin' | 'doctor' | 'patient';

const navItems = [
  { href: '/dashboard', label: 'Tổng quan', icon: Activity },
  { href: '/dashboard/abnormal', label: 'Cảnh báo', icon: AlertTriangle, roles: ['admin', 'doctor'] as AppRole[] },
  { href: '/dashboard/devices', label: 'Thiết bị của tôi', icon: Cpu, roles: ['patient', 'doctor'] as AppRole[] },
  { href: '/admin/devices', label: 'Quản lý Thiết bị', icon: Cpu, roles: ['admin'] as AppRole[] },
  { href: '/dashboard/ai-diagnosis', label: 'AI Diagnosis', icon: BrainCircuit, roles: ['patient', 'doctor'] as AppRole[] },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: FileText, roles: ['admin'] as AppRole[] },
  { href: '/admin/users', label: 'Quản lý Người dùng', icon: UserCircle, roles: ['admin'] as AppRole[] },
  { href: '/dashboard/privacy', label: 'Privacy Center', icon: UserCircle, roles: ['patient'] as AppRole[] },
  { href: '/dashboard/doctor-monitor', label: 'Doctor Monitor', icon: Heart, roles: ['doctor', 'admin'] as AppRole[] },
  { href: '/dashboard/profile', label: 'Hồ sơ', icon: UserCircle },
  { href: '/dashboard/test', label: 'Test Runner', icon: FlaskConical, roles: ['admin'] as AppRole[] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, token, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !token) router.push('/login');
  }, [isLoading, token, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }
  if (!token) return null;

  const filteredNav = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role as AppRole))
  );

  const roleLabel = { admin: 'Quản trị viên', doctor: 'Bác sĩ', patient: 'Bệnh nhân' };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* ── Sidebar ── */}
      <aside className="w-64 shrink-0 flex flex-col bg-slate-900 text-white">
        {/* Brand */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
          <div className="w-9 h-9 rounded-xl bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/30">
            <Heart className="w-5 h-5 text-white" fill="white" />
          </div>
          <div>
            <p className="font-bold text-white leading-tight">VitalCare</p>
            <p className="text-xs text-slate-400 leading-tight">IoT Health Monitor</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group',
                  active
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-slate-700">
          <Link href="/dashboard/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800 mb-2 hover:bg-slate-700 transition-colors">
            <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.full_name ?? user?.email}</p>
              <p className="text-xs text-slate-400">{user && roleLabel[user.role]}</p>
            </div>
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
