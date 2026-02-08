import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getAccessToken, clearAccessToken, clearRefreshToken, setAuthInvalidListener } from "../lib/auth";
import { getMe, login, type LoginProvider, type User } from "../lib/api";

type AuthContextValue = {
  isAuthenticated: boolean;
  user: User | null;
  login: (identifier: string, password: string, provider: LoginProvider) => Promise<void>;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext not found");
  return ctx;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const isAuthenticated = !!user;

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    void getMe().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    setAuthInvalidListener(() => {
      setUser(null);
    });
    return () => {
      setAuthInvalidListener(null);
    };
  }, []);

  const doLogin = async (identifier: string, password: string, provider: LoginProvider) => {
    const res = await login(identifier, password, provider);
    setUser(res.user);
  };

  const refreshUser = async (): Promise<User | null> => {
    try {
      const next = await getMe();
      setUser(next);
      return next;
    } catch {
      return null;
    }
  };

  const logout = () => {
    clearAccessToken();
    clearRefreshToken();
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(() => ({ isAuthenticated, user, login: doLogin, refreshUser, logout }), [isAuthenticated, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
