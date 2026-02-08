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
type PushTapEvent = { notification?: unknown };

const readString = (obj: Record<string, unknown>, key: string): string | null => {
  const raw = obj[key];
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length > 0 ? v : null;
};

const getPushText = (value: unknown): { title: string; body: string } | null => {
  if (typeof value !== "object" || value === null) return null;
  if (!("notification" in value)) return null;
  const notification = (value as PushTapEvent).notification;
  if (typeof notification !== "object" || notification === null) return null;

  const notificationObj = notification as Record<string, unknown>;

  const data =
    "data" in notificationObj && typeof notificationObj.data === "object" && notificationObj.data !== null
      ? (notificationObj.data as Record<string, unknown>)
      : null;

  const titleCandidates = [
    readString(notificationObj, "title"),
    data ? readString(data, "title") : null,
    data ? readString(data, "dataTitle") : null,
    data ? readString(data, "gcm.notification.title") : null,
    data ? readString(data, "google.c.a.c_l") : null,
  ];

  const bodyCandidates = [
    readString(notificationObj, "body"),
    data ? readString(data, "body") : null,
    data ? readString(data, "dataBody") : null,
    data ? readString(data, "message") : null,
    data ? readString(data, "gcm.notification.body") : null,
    data ? readString(data, "google.c.a.c_id") : null,
  ];

  const title = titleCandidates.find((v): v is string => typeof v === "string") ?? null;
  const body = bodyCandidates.find((v): v is string => typeof v === "string") ?? null;

  if (!title && !body) return null;
  return { title: title ?? "Notification", body: body ?? "" };
};

export const registerDeviceToken = async (): Promise<string | null> => {
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
  const [pushPopup, setPushPopup] = useState<{ title: string; body: string } | null>(null);
  const pushOkRef = useRef<HTMLButtonElement | null>(null);

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
    let handle: { remove: () => Promise<void> } | null = null;
    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { PushNotifications } = await import("@capacitor/push-notifications");

      handle = await PushNotifications.addListener("pushNotificationActionPerformed", (event: unknown) => {
        const text = getPushText(event);
        if (!text) return;
        setPushPopup(text);
      });
    })();

    return () => {
      if (handle) void handle.remove();
    };
  }, []);

  useEffect(() => {
    if (!pushPopup) return;
    pushOkRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setPushPopup(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pushPopup]);

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
  return (
    <AuthContext.Provider value={value}>
      {children}
      {pushPopup ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="push-popup-title"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setPushPopup(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 id="push-popup-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {pushPopup.title}
                </h2>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  onClick={() => setPushPopup(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              {pushPopup.body.trim() ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{pushPopup.body}</p>
              ) : null}

              <div className="mt-4 flex justify-end">
                <button
                  ref={pushOkRef}
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={() => setPushPopup(null)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
};
