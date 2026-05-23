'use client';

import { createContext, useContext, useCallback, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/types';

interface AuthContextValue {
  user: Pick<User, 'id' | 'email' | 'role' | 'full_name'> | null;
  token: string | null;
  login: (token: string, user: AuthContextValue['user']) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_CHANGED_EVENT = 'auth-storage-changed';
const EMPTY_AUTH_SNAPSHOT = JSON.stringify({ token: null, user: null });

const readStoredAuth = (): Pick<AuthContextValue, 'token' | 'user'> => {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }

  const storedToken = localStorage.getItem('token');
  const storedUser = localStorage.getItem('user');
  if (!storedToken || !storedUser) {
    return { token: null, user: null };
  }

  try {
    return { token: storedToken, user: JSON.parse(storedUser) };
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return { token: null, user: null };
  }
};

const getAuthSnapshot = () => JSON.stringify(readStoredAuth());
const getServerAuthSnapshot = () => EMPTY_AUTH_SNAPSHOT;

const subscribeAuth = (onStoreChange: () => void) => {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(AUTH_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(AUTH_CHANGED_EVENT, onStoreChange);
  };
};

const subscribeHydration = (onStoreChange: () => void) => {
  queueMicrotask(onStoreChange);
  return () => {};
};

const emitAuthChanged = () => {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const authSnapshot = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getServerAuthSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const { token, user } = useMemo(
    () => JSON.parse(authSnapshot) as Pick<AuthContextValue, 'token' | 'user'>,
    [authSnapshot],
  );
  const isLoading = !hydrated;

  const login = useCallback((newToken: string, newUser: AuthContextValue['user']) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    emitAuthChanged();
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    emitAuthChanged();
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
