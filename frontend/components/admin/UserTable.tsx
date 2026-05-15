'use client';

import { User } from '@/lib/api/admin-users';

interface UserTableProps {
  users: User[];
  loading: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onToggleStatus: (user: User) => void;
  onChangeRole: (user: User) => void;
  onResetPassword: (user: User) => void;
  onPageChange: (page: number) => void;
}

export default function UserTable({
  users,
  loading,
  pagination,
  onEdit,
  onDelete,
  onToggleStatus,
  onChangeRole,
  onResetPassword,
  onPageChange,
}: UserTableProps) {
  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'doctor':
        return 'bg-blue-100 text-blue-800';
      case 'patient':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-245">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-slate-700">Email</th>
              <th className="px-6 py-3 text-left font-semibold text-slate-700">Tên hiển thị</th>
              <th className="px-6 py-3 text-left font-semibold text-slate-700">Vai trò</th>
              <th className="px-6 py-3 text-left font-semibold text-slate-700">Trạng thái</th>
              <th className="px-6 py-3 text-left font-semibold text-slate-700">Ngày tạo</th>
              <th className="px-6 py-3 text-right font-semibold text-slate-700">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Không có người dùng phù hợp bộ lọc
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="px-6 py-4 text-slate-700">{user.email}</td>
                  <td className="px-6 py-4 text-slate-700">{user.full_name || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(user.is_active)}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{formatDate(user.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-2 justify-end flex-wrap">
                      <button
                        onClick={() => onEdit(user)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => onToggleStatus(user)}
                        className={`px-2.5 py-1 text-xs font-medium border rounded-lg ${user.is_active ? 'text-amber-700 border-amber-200 hover:bg-amber-50' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}
                      >
                        {user.is_active ? 'Khóa' : 'Mở'}
                      </button>
                      <button
                        onClick={() => onChangeRole(user)}
                        className="px-2.5 py-1 text-xs font-medium text-purple-700 border border-purple-200 hover:bg-purple-50 rounded-lg"
                      >
                        Vai trò
                      </button>
                      <button
                        onClick={() => onResetPassword(user)}
                        className="px-2.5 py-1 text-xs font-medium text-orange-700 border border-orange-200 hover:bg-orange-50 rounded-lg"
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => onDelete(user)}
                        className="px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg"
                      >
                        Vô hiệu
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Hiển thị {(pagination.page - 1) * pagination.limit + 1} -{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} / {pagination.total} người dùng
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Trước
            </button>
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-4 py-2 border rounded-lg ${
                  pagination.page === page
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
