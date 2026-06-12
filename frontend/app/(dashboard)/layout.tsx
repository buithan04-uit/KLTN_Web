'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileText,
  FlaskConical,
  Heart,
  Loader2,
  LogOut,
  User,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type AppRole = 'admin' | 'doctor' | 'patient';

const navItems = [
  { href: '/dashboard', label: 'Tổng quan', icon: Activity },
  { href: '/dashboard/abnormal', label: 'Cảnh báo', icon: AlertTriangle, roles: ['admin', 'doctor'] as AppRole[] },
  { href: '/dashboard/devices', label: 'Thiết bị của tôi', icon: Cpu, roles: ['patient', 'doctor'] as AppRole[] },
  { href: '/admin/devices', label: 'Quản lý thiết bị', icon: Cpu, roles: ['admin'] as AppRole[] },
  { href: '/dashboard/ai-diagnosis', label: 'Nguy cơ sinh hiệu', icon: BrainCircuit, roles: ['patient', 'doctor'] as AppRole[] },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: FileText, roles: ['admin'] as AppRole[] },
  { href: '/admin/users', label: 'Quản lý người dùng', icon: UserCircle, roles: ['admin'] as AppRole[] },
  { href: '/dashboard/privacy', label: 'Privacy Center', icon: UserCircle, roles: ['patient'] as AppRole[] },
  { href: '/dashboard/doctor-monitor', label: 'Doctor Monitor', icon: Heart, roles: ['doctor', 'admin'] as AppRole[] },
  { href: '/dashboard/profile', label: 'Hồ sơ', icon: UserCircle },
  { href: '/dashboard/test', label: 'Test Runner', icon: FlaskConical, roles: ['admin'] as AppRole[] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, token, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
    (item) => !item.roles || (user && item.roles.includes(user.role as AppRole)),
  );

  const roleLabel = { admin: 'Quản trị viên', doctor: 'Bác sĩ', patient: 'Bệnh nhân' };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <aside
        className={clsx(
          'relative z-20 shrink-0 flex flex-col overflow-visible bg-slate-900 text-white transition-[width] duration-200',
          sidebarOpen ? 'w-64' : 'w-20',
        )}
      >
        <div
          className={clsx(
            'relative flex items-center border-b border-slate-700 py-5',
            sidebarOpen ? 'gap-3 px-6' : 'justify-center px-3',
          )}
        >
          <div className="w-9 h-9 rounded-xl bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/30">
            <Heart className="w-5 h-5 text-white" fill="white" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="font-bold text-white leading-tight">VitalCare</p>
              <p className="text-xs text-slate-400 leading-tight">IoT Health Monitor</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            title={sidebarOpen ? 'Thu gọn menu' : 'Mở rộng menu'}
            aria-label={sidebarOpen ? 'Thu gọn menu' : 'Mở rộng menu'}
            className="absolute -right-3 top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 shadow-lg shadow-slate-950/40 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={clsx(
                  'flex items-center rounded-xl text-sm font-medium transition-all group',
                  sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5',
                  active
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span className="flex-1">{item.label}</span>}
                {active && sidebarOpen && <ChevronRight className="w-3.5 h-3.5" />}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-slate-700">
          <Link
            href="/dashboard/profile"
            title="Hồ sơ"
            className={clsx(
              'flex items-center rounded-xl bg-slate-800 mb-2 hover:bg-slate-700 transition-colors',
              sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5',
            )}
          >
            <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold shrink-0">
              <User className="w-4 h-4" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.full_name ?? user?.email}</p>
                <p className="text-xs text-slate-400">{user && roleLabel[user.role]}</p>
              </div>
            )}
          </Link>
          <button
            onClick={logout}
            title="Đăng xuất"
            className={clsx(
              'w-full flex items-center rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all',
              sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5',
            )}
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && 'Đăng xuất'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
