/**
 * Admin Users API - Direct implementation while Orval generation is configured
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ListUsersResponse {
  data: User[];
  pagination: PaginationMeta;
}

interface UserDetailResponse {
  message: string;
  user: User;
}

export interface User {
  id: number;
  email: string;
  role: 'admin' | 'doctor' | 'patient';
  full_name?: string | null;
  phone?: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: 'admin' | 'doctor' | 'patient';
  full_name?: string;
  phone?: string;
}

export interface CreateUserResponse {
  message: string;
  user: User;
}

export interface UpdateUserRequest {
  email?: string;
  full_name?: string;
  phone?: string;
}

export interface UpdateUserResponse {
  message: string;
  user: User;
}

export interface ChangeRoleRequest {
  role: 'admin' | 'doctor' | 'patient';
}

export interface ChangeStatusRequest {
  is_active: boolean;
}

export interface ResetPasswordResponse {
  message: string;
  tempPassword: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
const ADMIN_USERS_BASE = `${API_BASE}/api/admin/users`;

const getAuthHeader = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const adminUsersApi = {
  request: async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
    const response = await fetch(input, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.errors?.join(', ') || data?.error || data?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return data as T;
  },

  // List all users with pagination and filtering
  listUsers: async (
    page = 1,
    limit = 20,
    search?: string,
    role?: string,
    status?: string
  ): Promise<ListUsersResponse> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (role) params.append('role', role);
    if (status) params.append('status', status);

    return adminUsersApi.request<ListUsersResponse>(`${ADMIN_USERS_BASE}?${params}`, {
      headers: getAuthHeader(),
    });
  },

  // Get a specific user by ID
  getUserById: async (id: number): Promise<User> => {
    const response = await adminUsersApi.request<UserDetailResponse>(`${ADMIN_USERS_BASE}/${id}`, {
      headers: getAuthHeader(),
    });
    return response.user;
  },

  // Create a new user
  createUser: async (data: CreateUserRequest): Promise<CreateUserResponse> => {
    return adminUsersApi.request<CreateUserResponse>(ADMIN_USERS_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
  },

  // Update user information
  updateUser: async (id: number, data: UpdateUserRequest): Promise<UpdateUserResponse> => {
    return adminUsersApi.request<UpdateUserResponse>(`${ADMIN_USERS_BASE}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
  },

  // Delete/deactivate a user
  deleteUser: async (id: number) => {
    return adminUsersApi.request<{ message: string }>(`${ADMIN_USERS_BASE}/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
  },

  // Change user role
  changeRole: async (id: number, role: 'admin' | 'doctor' | 'patient') => {
    return adminUsersApi.request<UpdateUserResponse>(`${ADMIN_USERS_BASE}/${id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ role }),
    });
  },

  // Change user status (activate/deactivate)
  changeStatus: async (id: number, is_active: boolean) => {
    return adminUsersApi.request<UpdateUserResponse>(`${ADMIN_USERS_BASE}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ is_active }),
    });
  },

  // Reset user password
  resetPassword: async (id: number): Promise<ResetPasswordResponse> => {
    return adminUsersApi.request<ResetPasswordResponse>(`${ADMIN_USERS_BASE}/${id}/reset-password`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
  },
};
