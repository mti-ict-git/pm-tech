import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { biometricLoginGetCredentials, clearAccessToken, clearRefreshToken, getAccessToken, setAuthInvalidListener, setBiometricRefreshToken } from "../lib/auth";
import { apiRegisterDevice, getMe, login, refreshWithToken, type LoginProvider, type User } from "../lib/api";

const PUSH_ENABLED_KEY = "pm-tech-push-enabled";
const PUSH_TOKEN_KEY = "pm-tech-push-token";

const isPushEnabled = (): boolean => {
  try {
    const v = window.localStorage.getItem(PUSH_ENABLED_KEY);
    if (v === "false") return false;
    if (v === "true") return true;
    return true;
  } catch {
    return true;
  }
};

type PushPermissionResult = { receive: string };
type PushRegistrationToken = { value: string };

const registerDeviceToken = async (): Promise<string | null> => {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;

  const existing = (() => {
    try {
      const v = window.localStorage.getItem(PUSH_TOKEN_KEY);
      return v && v.trim() ? v.trim() : null;
    } catch {
      return null;
    }
  })();
  if (existing) return existing;

  const { PushNotifications } = await import("@capacitor/push-notifications");
  const perm = (await PushNotifications.requestPermissions()) as PushPermissionResult;
  if (perm.receive !== "granted") return null;

  const token = await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("push register timeout")), 12_000);
    let regHandle: { remove: () => Promise<void> } | null = null;
    let errHandle: { remove: () => Promise<void> } | null = null;

    const cleanup = () => {
      window.clearTimeout(timeout);
      if (regHandle) void regHandle.remove();
      if (errHandle) void errHandle.remove();
    };

    void (async () => {
      regHandle = await PushNotifications.addListener("registration", (t: PushRegistrationToken) => {
        cleanup();
        resolve(t.value);
      });
      errHandle = await PushNotifications.addListener("registrationError", () => {
        cleanup();
        reject(new Error("push registration error"));
      });
      await PushNotifications.register();
    })();
  });

  try {
    window.localStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch {}
  return token;
};

type AuthContextValue = {
  isAuthenticated: boolean;
  user: User | null;
  login: (identifier: string, password: string, provider: LoginProvider) => Promise<void>;
  biometricLogin: () => Promise<void>;
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
  const pushRegistering = useRef(false);

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

  useEffect(() => {
    if (!user) return;
    if (!isPushEnabled()) return;
    if (pushRegistering.current) return;

    pushRegistering.current = true;
    void (async () => {
      try {
        const token = await registerDeviceToken();
        if (!token) return;
        const { Capacitor } = await import("@capacitor/core");
        const platform = Capacitor.getPlatform();
        await apiRegisterDevice({ platform, token });
      } catch {
      } finally {
        pushRegistering.current = false;
      }
    })();
  }, [user]);

  const doLogin = async (identifier: string, password: string, provider: LoginProvider) => {
    const res = await login(identifier, password, provider);
    setUser(res.user);
    if (res.user.username) {
      await setBiometricRefreshToken({ username: res.user.username, refreshToken: res.refreshToken });
    }
  };

  const biometricLogin = async (): Promise<void> => {
    const creds = await biometricLoginGetCredentials();
    if (!creds) throw new Error("Biometric login not available");
    const refreshed = await refreshWithToken(creds.refreshToken);
    await setBiometricRefreshToken({ username: creds.username, refreshToken: refreshed.refreshToken });
    const me = await getMe();
    setUser(me);
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

  const value = useMemo<AuthContextValue>(() => ({ isAuthenticated, user, login: doLogin, biometricLogin, refreshUser, logout }), [isAuthenticated, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
