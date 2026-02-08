export const AUTH_TOKEN_STORAGE_KEY = "pm_access_token";
export const REFRESH_TOKEN_STORAGE_KEY = "pm_refresh_token";

export const BIOMETRIC_TOKEN_SERVER = "com.merdekatsingshan.pmtech";

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

export type BiometricAvailableResult = { isAvailable: boolean };

export const isBiometricAvailable = async (): Promise<boolean> => {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    const res = (await NativeBiometric.isAvailable()) as BiometricAvailableResult;
    return res.isAvailable === true;
  } catch {
    return false;
  }
};

export const setBiometricRefreshToken = async (input: { username: string; refreshToken: string }): Promise<void> => {
  if (!(await isBiometricAvailable())) return;
  const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
  await NativeBiometric.setCredentials({
    username: input.username,
    password: input.refreshToken,
    server: BIOMETRIC_TOKEN_SERVER,
  });
};

export type BiometricCredentials = { username: string; refreshToken: string };

export const biometricLoginGetCredentials = async (): Promise<BiometricCredentials | null> => {
  if (!(await isBiometricAvailable())) return null;
  const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
  try {
    await NativeBiometric.verifyIdentity({ reason: "Unlock to sign in" });
    const creds = await NativeBiometric.getCredentials({ server: BIOMETRIC_TOKEN_SERVER });
    const username = typeof creds?.username === "string" ? creds.username : null;
    const refreshToken = typeof creds?.password === "string" ? creds.password : null;
    if (!username || !username.trim()) return null;
    if (!refreshToken || !refreshToken.trim()) return null;
    return { username, refreshToken };
  } catch {
    return null;
  }
};
