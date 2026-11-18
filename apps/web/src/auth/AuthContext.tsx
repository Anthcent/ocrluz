import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, UNAUTHORIZED_EVENT } from '../lib/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  superadminLogin: (username: string, password: string, pin: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Changes the password and reloads the session (clears a pending forced change). */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser((await api.auth.login(email, password)).user);
  }, []);

  const superadminLogin = useCallback(async (username: string, password: string, pin: string) => {
    setUser((await api.auth.superadminLogin(username, password, pin)).user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    setUser((await api.auth.register(name, email, password)).user);
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.auth.changePassword(currentPassword, newPassword);
    // The server re-issued the cookie; /auth/me tells whether a forced change is still pending.
    setUser((await api.auth.me()).user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, superadminLogin, register, logout, changePassword }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
