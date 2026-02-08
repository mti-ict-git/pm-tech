export const AUTH_TOKEN_STORAGE_KEY = "pm_access_token";
export const REFRESH_TOKEN_STORAGE_KEY = "pm_refresh_token";

let accessTokenMem: string | null = null;
let refreshTokenMem: string | null = null;

const safeGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
};

const safeRemove = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {}
};

export const getAccessToken = (): string | null => accessTokenMem ?? safeGet(AUTH_TOKEN_STORAGE_KEY);
export const setAccessToken = (token: string): void => {
  accessTokenMem = token;
  safeSet(AUTH_TOKEN_STORAGE_KEY, token);
};
export const clearAccessToken = (): void => {
  accessTokenMem = null;
  safeRemove(AUTH_TOKEN_STORAGE_KEY);
};

export const getRefreshToken = (): string | null => refreshTokenMem ?? safeGet(REFRESH_TOKEN_STORAGE_KEY);
export const setRefreshToken = (token: string): void => {
  refreshTokenMem = token;
  safeSet(REFRESH_TOKEN_STORAGE_KEY, token);
};
export const clearRefreshToken = (): void => {
  refreshTokenMem = null;
  safeRemove(REFRESH_TOKEN_STORAGE_KEY);
};

export type JwtClaims = {
  sub: string;
  username: string;
  roles: string[];
};

export type AuthInvalidListener = () => void;
let authInvalidListener: AuthInvalidListener | null = null;
export const setAuthInvalidListener = (fn: AuthInvalidListener | null): void => {
  authInvalidListener = fn;
};
export const notifyAuthInvalid = (): void => {
  if (authInvalidListener) authInvalidListener();
};
