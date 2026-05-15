'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  useGetApiAdminUsers,
  usePostApiAdminUsers,
  usePutApiAdminUsersId,
  useDeleteApiAdminUsersId,
  usePatchApiAdminUsersIdRole,
  usePatchApiAdminUsersIdStatus,
  usePostApiAdminUsersIdResetPassword,
  type User as OrvalUser,
  type GetApiAdminUsersRole,
  type GetApiAdminUsersStatus,
  type PostApiAdminUsersBody,
  type PutApiAdminUsersIdBody,
  type PatchApiAdminUsersIdRoleBody,
} from '@/lib/orval/api';
import type { User, CreateUserRequest, UpdateUserRequest } from '@/lib/api/admin-users';
import UserTable from '@/components/admin/UserTable';
import UserForm from '@/components/admin/UserForm';

type DialogType = 'create' | 'edit' | 'delete' | 'role' | 'password' | 'status' | null;

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const limit = 20;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  const [openDialog, setOpenDialog] = useState<DialogType>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [authLoading, user, router]);

  const queryParams = {
    page,
    limit,
    search: searchTerm || undefined,
    role: (roleFilter || undefined) as GetApiAdminUsersRole | undefined,
    status: (statusFilter || undefined) as GetApiAdminUsersStatus | undefined,
  };

  const {
    data: usersResp,
    isLoading: loading,
    refetch,
  } = useGetApiAdminUsers(queryParams, {
    query: {
      enabled: !authLoading && user?.role === 'admin',
      refetchOnWindowFocus: false,
    },
  });

  const users = useMemo<User[]>(() => {
    const raw = usersResp?.status === 200 ? usersResp.data?.data : undefined;
    const rows = (raw || []) as OrvalUser[];
    return rows
      .filter((r) => r.id !== undefined && r.email && r.role)
      .map((r) => ({
        id: r.id as number,
        email: r.email as string,
        role: r.role as User['role'],
        full_name: r.full_name ?? null,
        phone: r.phone ?? null,
        is_active: Boolean(r.is_active),
        is_verified: Boolean(r.is_verified),
        created_at: r.created_at || new Date().toISOString(),
      }));
  }, [usersResp]);

  const pagination = useMemo(() => {
    const meta = usersResp?.status === 200 ? usersResp.data?.pagination : undefined;
    return {
      page: meta?.page ?? page,
      limit: meta?.limit ?? limit,
      total: meta?.total ?? users.length,
      pages: meta?.pages ?? 1,
    };
  }, [usersResp, page, limit, users.length]);

  const refreshUsers = useCallback(async () => {
    setError(null);
    try {
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
  }, [refetch]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const createMutation = usePostApiAdminUsers();
  const updateMutation = usePutApiAdminUsersId();
  const deleteMutation = useDeleteApiAdminUsersId();
  const roleMutation = usePatchApiAdminUsersIdRole();
  const statusMutation = usePatchApiAdminUsersIdStatus();
  const resetPasswordMutation = usePostApiAdminUsersIdResetPassword();

  if (authLoading) return null;
  if (user && user.role !== 'admin') return null;

  const handleCreateUser = async (formData: CreateUserRequest | UpdateUserRequest) => {
    try {
      setError(null);
      await createMutation.mutateAsync({ data: formData as PostApiAdminUsersBody });
      setSuccess('Tạo người dùng thành công');
      setOpenDialog(null);
      setPage(1);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo người dùng');
    }
  };

  const handleUpdateUser = async (formData: CreateUserRequest | UpdateUserRequest) => {
    if (!selectedUser) return;
    try {
      setError(null);
      await updateMutation.mutateAsync({
        id: selectedUser.id,
        data: formData as PutApiAdminUsersIdBody,
      });
      setSuccess('Cập nhật người dùng thành công');
      setOpenDialog(null);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật người dùng');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      setError(null);
      await deleteMutation.mutateAsync({ id: selectedUser.id });
      setSuccess('Vô hiệu hóa người dùng thành công');
      setOpenDialog(null);
      setPage(1);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể vô hiệu hóa người dùng');
    }
  };

  const handleChangeRole = async (newRole: string) => {
    if (!selectedUser) return;
    try {
      setError(null);
      await roleMutation.mutateAsync({
        id: selectedUser.id,
        data: { role: newRole as PatchApiAdminUsersIdRoleBody['role'] },
      });
      setSuccess('Cập nhật vai trò thành công');
      setOpenDialog(null);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đổi vai trò');
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    try {
      setError(null);
      const result = await resetPasswordMutation.mutateAsync({ id: selectedUser.id });
      const tempPass = result.data?.tempPassword;
      setSuccess(tempPass ? `Mật khẩu tạm thời: ${tempPass}` : 'Đặt lại mật khẩu thành công');
      setOpenDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu');
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedUser) return;
    try {
      setError(null);
      await statusMutation.mutateAsync({
        id: selectedUser.id,
        data: { is_active: !selectedUser.is_active },
      });
      setSuccess(!selectedUser.is_active ? 'Đã kích hoạt người dùng' : 'Đã vô hiệu hóa người dùng');
      setOpenDialog(null);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý người dùng</h1>
            <p className="text-slate-500 mt-1">Quản lý tài khoản, vai trò và trạng thái hoạt động trong hệ thống</p>
        </div>
        <button
          onClick={() => {
            setSelectedUser(null);
            setOpenDialog('create');
          }}
            className="px-4 py-2.5 bg-sky-600 text-white rounded-xl hover:bg-sky-700 shadow-sm"
        >
          + Tạo người dùng
        </button>
      </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-4 underline hover:no-underline text-sm"
          >
            Đóng
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800">
          {success}
          <button
            onClick={() => setSuccess(null)}
            className="ml-4 underline hover:no-underline text-sm"
          >
            Đóng
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="text"
          placeholder="Tìm theo email hoặc tên..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2.5 border border-slate-300 rounded-xl"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2.5 border border-slate-300 rounded-xl"
        >
          <option value="">Tất cả vai trò</option>
          <option value="admin">Quản trị viên</option>
          <option value="doctor">Bác sĩ</option>
          <option value="patient">Bệnh nhân</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2.5 border border-slate-300 rounded-xl"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã vô hiệu</option>
          <option value="verified">Đã xác minh</option>
          <option value="unverified">Chưa xác minh</option>
        </select>
      </div>

      <UserTable
        users={users}
        loading={loading}
        pagination={pagination}
        onEdit={(target) => {
          setSelectedUser(target);
          setOpenDialog('edit');
        }}
        onDelete={(target) => {
          setSelectedUser(target);
          setOpenDialog('delete');
        }}
        onToggleStatus={(target) => {
          setSelectedUser(target);
          setOpenDialog('status');
        }}
        onChangeRole={(target) => {
          setSelectedUser(target);
          setOpenDialog('role');
        }}
        onResetPassword={(target) => {
          setSelectedUser(target);
          setOpenDialog('password');
        }}
        onPageChange={(page) => {
          setPage(page);
        }}
      />

      {openDialog === 'create' && (
        <UserForm
          isOpen={true}
          mode="create"
          onClose={() => setOpenDialog(null)}
          onSubmit={handleCreateUser}
        />
      )}

      {openDialog === 'edit' && selectedUser && (
        <UserForm
          isOpen={true}
          mode="edit"
          user={selectedUser}
          onClose={() => setOpenDialog(null)}
          onSubmit={handleUpdateUser}
        />
      )}

      {openDialog === 'delete' && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h2 className="text-xl font-bold mb-4">Deactivate User</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to deactivate user <strong>{selectedUser.email}</strong>?
            </p>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setOpenDialog(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {openDialog === 'role' && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h2 className="text-xl font-bold mb-4">Change Role</h2>
            <p className="text-gray-600 mb-4">
              Current role: <strong>{selectedUser.role}</strong>
            </p>
            <select
              defaultValue={selectedUser.role}
              onChange={(e) => {
                void handleChangeRole(e.target.value);
              }}
              className="w-full px-3 py-2 border rounded-lg mb-6"
            >
              <option value="admin">Admin</option>
              <option value="doctor">Doctor</option>
              <option value="patient">Patient</option>
            </select>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setOpenDialog(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {openDialog === 'password' && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h2 className="text-xl font-bold mb-4">Reset Password</h2>
            <p className="text-gray-600 mb-6">
              Reset password for <strong>{selectedUser.email}</strong>?
            </p>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setOpenDialog(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleResetPassword();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {openDialog === 'status' && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h2 className="text-xl font-bold mb-4">Change Account Status</h2>
            <p className="text-gray-600 mb-6">
              {selectedUser.is_active
                ? `Disable account ${selectedUser.email}?`
                : `Enable account ${selectedUser.email}?`}
            </p>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setOpenDialog(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleToggleStatus();
                }}
                className={`px-4 py-2 text-white rounded-lg ${selectedUser.is_active ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {selectedUser.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
