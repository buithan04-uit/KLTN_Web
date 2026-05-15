import { Heart } from 'lucide-react';

interface AuthCardProps {
  /** Dòng phụ đề bên dưới logo. Mặc định: "Hệ thống theo dõi sức khỏe IoT" */
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Wrapper dùng chung cho tất cả trang auth (login, register, forgot/reset password).
 * Chứa: background gradient, căn giữa, logo VitalCare, white card.
 */
export function AuthCard({ subtitle = 'Hệ thống theo dõi sức khỏe IoT', children }: AuthCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-sky-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-md animate-fadeIn">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500 shadow-lg shadow-sky-500/30 mb-4">
            <Heart className="w-8 h-8 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">VitalCare</h1>
          <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
