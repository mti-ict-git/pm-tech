import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearAccessToken, clearRefreshToken, notifyAuthInvalid } from "./auth";
import { Capacitor, registerPlugin } from "@capacitor/core";

const defaultApiBaseUrl = import.meta.env.PROD ? "https://preventivepm.justanapi.my.id" : "http://localhost:3001";
const fallbackApiBaseUrl = ((import.meta.env.VITE_API_FALLBACK_BASE_URL ?? import.meta.env.VITE_API_BASE_URL) ?? defaultApiBaseUrl).replace(/\/+$/, "");
const defaultDiscoveryUrl = "";
const discoveryUrl = (((import.meta.env.VITE_DISCOVERY_URL as string | undefined) ?? "").trim() || defaultDiscoveryUrl).trim();
const requestTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? "15000");
const discoveryTimeoutMs = Number(import.meta.env.VITE_API_DISCOVERY_TIMEOUT_MS ?? "4000");
const discoveryRefreshMs = Number(import.meta.env.VITE_API_DISCOVERY_REFRESH_MS ?? "60000");

let primaryApiBase: string | null = null;
let preferFallback = false;
let lastDiscoveryAttempt = 0;

const cachePrefix = "pmtech.cache.v1:";
const cacheLastWriteAtKey = "pmtech.cacheLastWriteAt";

const mutationQueueKey = "pmtech.mutationQueue.v1";

type MutationQueueMethod = "POST";
type MutationQueueItem = {
  id: string;
  method: MutationQueueMethod;
  path: string;
  body: string | null;
  createdAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
};

const readMutationQueue = (): MutationQueueItem[] => {
  try {
    const raw = localStorage.getItem(mutationQueueKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: MutationQueueItem[] = [];
    for (const v of parsed) {
      if (!isRecord(v)) continue;
      const idRaw = v.id;
      const methodRaw = v.method;
      const pathRaw = v.path;
      const bodyRaw = v.body;
      const createdAtRaw = v.createdAt;
      const attemptCountRaw = v.attemptCount;
      const lastAttemptAtRaw = v.lastAttemptAt;
      const lastErrorRaw = v.lastError;

      if (typeof idRaw !== "string" || !idRaw.trim()) continue;
      if (typeof methodRaw !== "string" || methodRaw !== "POST") continue;
      if (typeof pathRaw !== "string" || !pathRaw.startsWith("/api/")) continue;
      const body = bodyRaw === null || bodyRaw === undefined ? null : typeof bodyRaw === "string" ? bodyRaw : null;
      if (bodyRaw !== null && bodyRaw !== undefined && typeof bodyRaw !== "string") continue;
      if (typeof createdAtRaw !== "string" || !createdAtRaw.trim()) continue;
      if (typeof attemptCountRaw !== "number" || !Number.isFinite(attemptCountRaw) || attemptCountRaw < 0) continue;
      const lastAttemptAt = typeof lastAttemptAtRaw === "string" && lastAttemptAtRaw.trim() ? lastAttemptAtRaw : null;
      if (lastAttemptAtRaw !== null && lastAttemptAtRaw !== undefined && typeof lastAttemptAtRaw !== "string") continue;
      const lastError = typeof lastErrorRaw === "string" && lastErrorRaw.trim() ? lastErrorRaw : null;
      if (lastErrorRaw !== null && lastErrorRaw !== undefined && typeof lastErrorRaw !== "string") continue;

      out.push({
        id: idRaw,
        method: "POST",
        path: pathRaw,
        body,
        createdAt: createdAtRaw,
        attemptCount: attemptCountRaw,
        lastAttemptAt,
        lastError,
      });
    }
    return out;
  } catch {
    return [];
  }
};

const writeMutationQueue = (items: MutationQueueItem[]): void => {
  try {
    localStorage.setItem(mutationQueueKey, JSON.stringify(items));
  } catch {
    return;
  }
};

const makeId = (): string => {
  try {
    const uuid = crypto.randomUUID();
    if (typeof uuid === "string" && uuid.trim()) return uuid;
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getPendingMutationCount = (): number => readMutationQueue().length;

export type MutationQueueMeta = {
  id: string;
  path: string;
  taskId: string | null;
  createdAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
};

export const listMutationQueueMeta = (): MutationQueueMeta[] => {
  return readMutationQueue().map((m) => ({
    id: m.id,
    path: m.path,
    taskId: extractTaskIdFromPath(m.path),
    createdAt: m.createdAt,
    attemptCount: m.attemptCount,
    lastAttemptAt: m.lastAttemptAt,
    lastError: m.lastError,
  }));
};

const enqueueMutation = (input: { method: MutationQueueMethod; path: string; body: string | null }): string => {
  const id = makeId();
  const next: MutationQueueItem = {
    id,
    method: input.method,
    path: input.path,
    body: input.body,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  const items = readMutationQueue();
  items.push(next);
  writeMutationQueue(items);
  return id;
};

export const processMutationQueue = async (): Promise<{ processed: number; failed: number; remaining: number }> => {
  const items = readMutationQueue();
  if (items.length === 0) return { processed: 0, failed: 0, remaining: 0 };
  let processed = 0;
  let failed = 0;
  const remaining: MutationQueueItem[] = [];
  for (const item of items) {
    const attemptAt = new Date().toISOString();
    try {
      await apiFetchJson<unknown>(item.path, { method: item.method, body: item.body ?? undefined });
      processed += 1;
    } catch (e) {
      if (e instanceof ApiError && isNonRetryableSyncError(e.status)) {
        failed += 1;
        appendSyncConflict({
          kind: "mutation",
          queueId: item.id,
          path: item.path,
          createdAt: item.createdAt,
          detectedAt: attemptAt,
          status: e.status,
          message: e.message,
        });
        continue;
      }

      const errMessage = e instanceof ApiError ? `${e.status}: ${e.message}` : e instanceof Error ? e.message : "Sync failed";
      failed += 1;
      remaining.push({ ...item, attemptCount: item.attemptCount + 1, lastAttemptAt: attemptAt, lastError: errMessage });
    }
  }
  writeMutationQueue(remaining);
  return { processed, failed, remaining: remaining.length };
};

const evidenceOutboxMetaKey = "pmtech.evidenceOutboxMeta.v1";
const evidenceOutboxDbName = "pmtech";
const evidenceOutboxStore = "evidenceOutbox";

export type EvidenceOutboxKind = "task" | "checklist";
export type EvidenceOutboxMeta = {
  id: string;
  kind: EvidenceOutboxKind;
  taskId: string;
  templateChecklistItemId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
};

type EvidenceOutboxRecord = EvidenceOutboxMeta & { blob: Blob };

const readEvidenceOutboxMeta = (): EvidenceOutboxMeta[] => {
  try {
    const raw = localStorage.getItem(evidenceOutboxMetaKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: EvidenceOutboxMeta[] = [];
    for (const v of parsed) {
      if (!isRecord(v)) continue;
      const idRaw = v.id;
      const kindRaw = v.kind;
      const taskIdRaw = v.taskId;
      const templateChecklistItemIdRaw = v.templateChecklistItemId;
      const fileNameRaw = v.fileName;
      const contentTypeRaw = v.contentType;
      const sizeBytesRaw = v.sizeBytes;
      const createdAtRaw = v.createdAt;
      const lastAttemptAtRaw = v.lastAttemptAt;
      const lastErrorRaw = v.lastError;

      if (typeof idRaw !== "string" || !idRaw.trim()) continue;
      if (kindRaw !== "task" && kindRaw !== "checklist") continue;
      if (typeof taskIdRaw !== "string" || !taskIdRaw.trim()) continue;
      const templateChecklistItemId =
        typeof templateChecklistItemIdRaw === "string" && templateChecklistItemIdRaw.trim() ? templateChecklistItemIdRaw : null;
      if (templateChecklistItemIdRaw !== null && templateChecklistItemIdRaw !== undefined && typeof templateChecklistItemIdRaw !== "string") {
        continue;
      }
      if (typeof fileNameRaw !== "string" || !fileNameRaw.trim()) continue;
      if (typeof contentTypeRaw !== "string") continue;
      if (typeof sizeBytesRaw !== "number" || !Number.isFinite(sizeBytesRaw) || sizeBytesRaw < 0) continue;
      if (typeof createdAtRaw !== "string" || !createdAtRaw.trim()) continue;
      const lastAttemptAt = typeof lastAttemptAtRaw === "string" && lastAttemptAtRaw.trim() ? lastAttemptAtRaw : null;
      if (lastAttemptAtRaw !== null && lastAttemptAtRaw !== undefined && typeof lastAttemptAtRaw !== "string") continue;
      const lastError = typeof lastErrorRaw === "string" && lastErrorRaw.trim() ? lastErrorRaw : null;
      if (lastErrorRaw !== null && lastErrorRaw !== undefined && typeof lastErrorRaw !== "string") continue;

      out.push({
        id: idRaw,
        kind: kindRaw,
        taskId: taskIdRaw,
        templateChecklistItemId,
        fileName: fileNameRaw,
        contentType: contentTypeRaw,
        sizeBytes: sizeBytesRaw,
        createdAt: createdAtRaw,
        lastAttemptAt,
        lastError,
      });
    }
    return out;
  } catch {
    return [];
  }
};

const writeEvidenceOutboxMeta = (items: EvidenceOutboxMeta[]): void => {
  try {
    localStorage.setItem(evidenceOutboxMetaKey, JSON.stringify(items));
  } catch {
    return;
  }
};

export const listEvidenceOutboxMeta = (): EvidenceOutboxMeta[] => readEvidenceOutboxMeta();

export const getQueuedChecklistEvidenceCount = (taskId: string, templateChecklistItemId: string): number => {
  const normalizedTaskId = taskId.trim();
  const normalizedItemId = templateChecklistItemId.trim();
  if (!normalizedTaskId || !normalizedItemId) return 0;
  return readEvidenceOutboxMeta().filter(
    (m) => m.kind === "checklist" && m.taskId === normalizedTaskId && m.templateChecklistItemId === normalizedItemId,
  ).length;
};

export const getQueuedTaskEvidenceCount = (taskId: string): number => {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) return 0;
  return readEvidenceOutboxMeta().filter((m) => m.kind === "task" && m.taskId === normalizedTaskId).length;
};

export const getPendingEvidenceCount = (): number => readEvidenceOutboxMeta().length;

const openEvidenceOutboxDb = async (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(evidenceOutboxDbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(evidenceOutboxStore)) {
        db.createObjectStore(evidenceOutboxStore, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open DB"));
  });
};

const idbPutEvidence = async (record: EvidenceOutboxRecord): Promise<void> => {
  const db = await openEvidenceOutboxDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(evidenceOutboxStore, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("DB write failed"));
    tx.objectStore(evidenceOutboxStore).put(record);
  });
};

const idbGetEvidence = async (id: string): Promise<EvidenceOutboxRecord | null> => {
  const db = await openEvidenceOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(evidenceOutboxStore, "readonly");
    const req = tx.objectStore(evidenceOutboxStore).get(id);
    req.onsuccess = () => {
      const v: unknown = req.result as unknown;
      if (!v || typeof v !== "object") {
        resolve(null);
        return;
      }
      resolve(v as EvidenceOutboxRecord);
    };
    req.onerror = () => reject(req.error ?? new Error("DB read failed"));
  });
};

const idbDeleteEvidence = async (id: string): Promise<void> => {
  const db = await openEvidenceOutboxDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(evidenceOutboxStore, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("DB delete failed"));
    tx.objectStore(evidenceOutboxStore).delete(id);
  });
};

const enqueueEvidenceUpload = async (input: {
  kind: EvidenceOutboxKind;
  taskId: string;
  templateChecklistItemId: string | null;
  file: File;
}): Promise<string> => {
  const id = makeId();
  const meta: EvidenceOutboxMeta = {
    id,
    kind: input.kind,
    taskId: input.taskId,
    templateChecklistItemId: input.templateChecklistItemId,
    fileName: input.file.name || "file",
    contentType: input.file.type || "application/octet-stream",
    sizeBytes: input.file.size,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    lastError: null,
  };
  const existing = readEvidenceOutboxMeta();
  existing.push(meta);
  writeEvidenceOutboxMeta(existing);
  await idbPutEvidence({ ...meta, blob: input.file });
  return id;
};

export const processEvidenceOutbox = async (): Promise<{ processed: number; failed: number; remaining: number }> => {
  const items = readEvidenceOutboxMeta();
  if (items.length === 0) return { processed: 0, failed: 0, remaining: 0 };
  let processed = 0;
  let failed = 0;
  const remaining: EvidenceOutboxMeta[] = [];

  for (const meta of items) {
    const attemptAt = new Date().toISOString();
    try {
      const record = await idbGetEvidence(meta.id);
      if (!record) {
        processed += 1;
        continue;
      }
      const path =
        meta.kind === "task"
          ? `/api/tasks/${encodeURIComponent(meta.taskId)}/evidence/upload`
          : `/api/tasks/${encodeURIComponent(meta.taskId)}/checklist-items/${encodeURIComponent(
              meta.templateChecklistItemId ?? "",
            )}/evidence/upload`;
      const res = await apiFetchWithAuthRetry(path, {
        method: "POST",
        headers: {
          "Content-Type": meta.contentType || "application/octet-stream",
          "x-filename": meta.fileName,
        },
        body: record.blob,
      });
      if (!res.ok) throw await parseError(res);
      await idbDeleteEvidence(meta.id);
      processed += 1;
    } catch (e) {
      if (e instanceof ApiError && isNonRetryableSyncError(e.status)) {
        failed += 1;
        appendSyncConflict({
          kind: "evidence",
          queueId: meta.id,
          path: meta.kind === "task" ? `/api/tasks/${meta.taskId}/evidence/upload` : `/api/tasks/${meta.taskId}/checklist-items/${meta.templateChecklistItemId ?? ""}/evidence/upload`,
          createdAt: meta.createdAt,
          detectedAt: attemptAt,
          status: e.status,
          message: e.message,
        });
        await idbDeleteEvidence(meta.id);
        continue;
      }

      const errMessage = e instanceof ApiError ? `${e.status}: ${e.message}` : e instanceof Error ? e.message : "Upload failed";
      failed += 1;
      remaining.push({ ...meta, lastAttemptAt: attemptAt, lastError: errMessage });
    }
  }

  writeEvidenceOutboxMeta(remaining);
  return { processed, failed, remaining: remaining.length };
};

type CacheEntry<T> = { savedAt: string; value: T };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const syncConflictsKey = "pmtech.syncConflicts.v1";

export type SyncConflict = {
  id: string;
  kind: "mutation" | "evidence";
  queueId: string;
  path: string;
  taskId: string | null;
  createdAt: string;
  detectedAt: string;
  status: number;
  message: string;
};

const extractTaskIdFromPath = (path: string): string | null => {
  const match = /^\/api\/tasks\/([^/]+)\//.exec(path);
  const taskId = match?.[1];
  return typeof taskId === "string" && taskId.trim() ? taskId : null;
};

const readSyncConflicts = (): SyncConflict[] => {
  try {
    const raw = localStorage.getItem(syncConflictsKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SyncConflict[] = [];
    for (const v of parsed) {
      if (!isRecord(v)) continue;
      const idRaw = v.id;
      const kindRaw = v.kind;
      const queueIdRaw = v.queueId;
      const pathRaw = v.path;
      const taskIdRaw = v.taskId;
      const createdAtRaw = v.createdAt;
      const detectedAtRaw = v.detectedAt;
      const statusRaw = v.status;
      const messageRaw = v.message;

      if (typeof idRaw !== "string" || !idRaw.trim()) continue;
      if (kindRaw !== "mutation" && kindRaw !== "evidence") continue;
      if (typeof queueIdRaw !== "string" || !queueIdRaw.trim()) continue;
      if (typeof pathRaw !== "string" || !pathRaw.trim()) continue;
      const taskId = typeof taskIdRaw === "string" && taskIdRaw.trim() ? taskIdRaw : null;
      if (taskIdRaw !== null && taskIdRaw !== undefined && typeof taskIdRaw !== "string") continue;
      if (typeof createdAtRaw !== "string" || !createdAtRaw.trim()) continue;
      if (typeof detectedAtRaw !== "string" || !detectedAtRaw.trim()) continue;
      if (typeof statusRaw !== "number" || !Number.isFinite(statusRaw)) continue;
      if (typeof messageRaw !== "string") continue;

      out.push({
        id: idRaw,
        kind: kindRaw,
        queueId: queueIdRaw,
        path: pathRaw,
        taskId,
        createdAt: createdAtRaw,
        detectedAt: detectedAtRaw,
        status: statusRaw,
        message: messageRaw,
      });
    }
    return out;
  } catch {
    return [];
  }
};

const writeSyncConflicts = (items: SyncConflict[]): void => {
  try {
    localStorage.setItem(syncConflictsKey, JSON.stringify(items));
  } catch {
    return;
  }
};

export const listSyncConflicts = (): SyncConflict[] => readSyncConflicts();

export const clearSyncConflicts = (): void => {
  try {
    localStorage.removeItem(syncConflictsKey);
  } catch {
    return;
  }
};

export const getSyncConflictCount = (): number => readSyncConflicts().length;

export const getSyncConflictCountForTask = (taskId: string): number => {
  const normalized = taskId.trim();
  if (!normalized) return 0;
  return readSyncConflicts().filter((c) => c.taskId === normalized).length;
};

const appendSyncConflict = (input: Omit<SyncConflict, "id" | "taskId">): void => {
  const item: SyncConflict = { ...input, id: makeId(), taskId: extractTaskIdFromPath(input.path) };
  const existing = readSyncConflicts();
  const next = [item, ...existing].slice(0, 100);
  writeSyncConflicts(next);
};

const isNonRetryableSyncError = (status: number): boolean => {
  return status === 400 || status === 403 || status === 404 || status === 409 || status === 422;
};

const shouldCachePath = (path: string): boolean => {
  if (!path.startsWith("/api/")) return false;
  if (path.startsWith("/api/auth/")) return false;
  if (path.includes("/evidence/") && path.endsWith("/download")) return false;
  if (path.includes("/image")) return false;
  return (
    path.startsWith("/api/tasks") ||
    path.startsWith("/api/assets") ||
    path.startsWith("/api/work-orders") ||
    path.startsWith("/api/dashboard") ||
    path.startsWith("/api/system") ||
    path.startsWith("/api/facilities")
  );
};

const cacheKeyFor = (path: string): string => `${cachePrefix}${path}`;

const readCache = <T>(path: string): CacheEntry<T> | null => {
  try {
    const raw = localStorage.getItem(cacheKeyFor(path));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const savedAt = parsed.savedAt;
    if (typeof savedAt !== "string" || !savedAt.trim()) return null;
    if (!("value" in parsed)) return null;
    return { savedAt, value: (parsed as { value: T }).value };
  } catch {
    return null;
  }
};

const writeCache = <T>(path: string, value: T): void => {
  try {
    const savedAt = new Date().toISOString();
    const entry: CacheEntry<T> = { savedAt, value };
    localStorage.setItem(cacheKeyFor(path), JSON.stringify(entry));
    localStorage.setItem(cacheLastWriteAtKey, savedAt);
  } catch {
    return;
  }
};

export const getOfflineCacheLastWriteAt = (): string | null => {
  try {
    const raw = localStorage.getItem(cacheLastWriteAtKey);
    return typeof raw === "string" && raw.trim() ? raw : null;
  } catch {
    return null;
  }
};

const normalizeBase = (base: string): string => base.replace(/\/+$/, "");

export const API_BASE_URL = fallbackApiBaseUrl;

const getApiBase = (): string => {
  if (preferFallback || !primaryApiBase) return fallbackApiBaseUrl;
  return primaryApiBase;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init ?? {}), signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const loadDiscovery = async (): Promise<boolean> => {
  if (!discoveryUrl) return false;
  lastDiscoveryAttempt = Date.now();
  const res = await fetchWithTimeout(discoveryUrl, { method: "GET", headers: { Accept: "application/json" } }, discoveryTimeoutMs);
  if (!res.ok) return false;
  const json = (await res.json()) as unknown;
  const next =
    typeof json === "object" && json !== null && "apiBaseUrl" in json && typeof (json as { apiBaseUrl?: unknown }).apiBaseUrl === "string"
      ? (json as { apiBaseUrl: string }).apiBaseUrl
      : "";
  if (!next || !next.trim()) return false;
  primaryApiBase = normalizeBase(next);
  preferFallback = false;
  return true;
};

const ensureDiscovery = async (): Promise<void> => {
  if (!discoveryUrl) return;
  const now = Date.now();
  if (primaryApiBase && now - lastDiscoveryAttempt < discoveryRefreshMs) return;
  try {
    await loadDiscovery();
  } catch {}
};

const shouldFallback = (res: Response): boolean => res.status === 502 || res.status === 503 || res.status === 504;

const fetchWithFallback = async (path: string, init: RequestInit): Promise<Response> => {
  await ensureDiscovery();
  const base = getApiBase();
  const url = `${base}${path}`;
  try {
    const res = await fetchWithTimeout(url, init, requestTimeoutMs);
    if (shouldFallback(res) && base !== fallbackApiBaseUrl) {
      preferFallback = true;
      return fetchWithTimeout(`${fallbackApiBaseUrl}${path}`, init, requestTimeoutMs);
    }
    return res;
  } catch {
    if (base !== fallbackApiBaseUrl) {
      preferFallback = true;
      return fetchWithTimeout(`${fallbackApiBaseUrl}${path}`, init, requestTimeoutMs);
    }
    throw new Error("Network error");
  }
};

export type LoginProvider = "ldap" | "local";

export type User = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  roles: string[];
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

export type ApiErrorDetail = { field?: string | null; message?: string | null };
export class ApiError extends Error {
  status: number;
  code: string | null;
  details: ApiErrorDetail[] | null;
  constructor(status: number, message: string, code?: string | null, details?: ApiErrorDetail[] | null) {
    super(message);
    this.status = status;
    this.code = code ?? null;
    this.details = details ?? null;
  }
}

const parseError = async (res: Response): Promise<ApiError> => {
  let message = "Request failed";
  let code: string | null = null;
  let details: ApiErrorDetail[] | null = null;
  try {
    const body = await res.json();
    if (typeof body?.message === "string") message = body.message;
    if (typeof body?.code === "string") code = body.code;
    if (Array.isArray(body?.details)) details = body.details as ApiErrorDetail[];
  } catch {
    try {
      const txt = await res.text();
      if (txt) message = txt;
    } catch {}
  }
  return new ApiError(res.status, message, code, details);
};

export const apiFetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const hasBody = typeof init?.body !== "undefined" && init?.body !== null;
  const method = (init?.method ?? "GET").toUpperCase();
  const canUseCache = method === "GET" && shouldCachePath(path);
  const makeInit = (tokenValue?: string | null): RequestInit => {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = typeof tokenValue === "string" ? tokenValue : getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const contentHeaders = hasBody ? { "Content-Type": "application/json" } : {};
    return {
      ...(init ?? {}),
      headers: { ...contentHeaders, ...headers, ...(init?.headers as Record<string, string> | undefined) },
      body: hasBody && typeof init?.body !== "string" ? JSON.stringify(init?.body) : init?.body,
    };
  };

  let res: Response;
  try {
    res = await fetchWithFallback(path, makeInit());
  } catch (e) {
    if (canUseCache) {
      const cached = readCache<T>(path);
      if (cached) return cached.value;
    }
    const msg = e instanceof Error ? e.message : "Network error";
    throw new Error(msg);
  }
  if (res.status === 401) {
    const refreshed = await refresh();
    if (!refreshed) {
      clearAccessToken();
      clearRefreshToken();
      notifyAuthInvalid();
      throw new ApiError(401, "Unauthorized");
    }
    const retry = await fetchWithFallback(path, makeInit(getAccessToken() ?? ""));
    if (!retry.ok) throw await parseError(retry);
    const json = (await retry.json()) as T;
    if (canUseCache) writeCache(path, json);
    return json;
  }
  if (!res.ok) throw await parseError(res);
  const json = (await res.json()) as T;
  if (canUseCache) writeCache(path, json);
  return json;
};

const apiFetchWithAuthRetry = async (path: string, init?: RequestInit): Promise<Response> => {
  const makeInit = (tokenValue?: string | null): RequestInit => {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = typeof tokenValue === "string" ? tokenValue : getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return { ...(init ?? {}), headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } };
  };

  const res = await fetchWithFallback(path, makeInit());

  if (res.status !== 401) return res;

  const refreshed = await refresh();
  if (!refreshed) {
    clearAccessToken();
    clearRefreshToken();
    notifyAuthInvalid();
    return res;
  }

  return fetchWithFallback(path, makeInit(getAccessToken() ?? ""));
};

export const apiGet = async <T>(path: string): Promise<T> => {
  return apiFetchJson<T>(path, { method: "GET" });
};

export const apiPost = async <T>(path: string, body?: unknown): Promise<T> => {
  const bodyInit = body === undefined || body === null ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  return apiFetchJson<T>(path, { method: "POST", body: bodyInit });
};

export type QueuedOkResponse = { ok: true; queued: true; queuedId: string } | { ok: true; queued?: false };

const apiPostOkOrQueue = async (path: string, body?: unknown): Promise<QueuedOkResponse> => {
  const bodyInit = body === undefined || body === null ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  try {
    await apiFetchJson<{ ok: true }>(path, { method: "POST", body: bodyInit });
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const queuedId = enqueueMutation({ method: "POST", path, body: bodyInit ?? null });
    return { ok: true, queued: true, queuedId };
  }
};

export const processOfflineSync = async (): Promise<{
  mutations: { processed: number; failed: number; remaining: number };
  evidence: { processed: number; failed: number; remaining: number };
}> => {
  const mutations = await processMutationQueue();
  const evidence = await processEvidenceOutbox();
  return { mutations, evidence };
};

export const login = async (identifier: string, password: string, provider: LoginProvider): Promise<LoginResponse> => {
  const json = await apiPost<LoginResponse>(`/api/auth/login`, { identifier, password, provider });
  setAccessToken(json.accessToken);
  setRefreshToken(json.refreshToken);
  return json;
};

export const refresh = async (): Promise<boolean> => {
  const rt = getRefreshToken();
  if (!rt) return false;
  const json = await apiPost<{ accessToken: string; refreshToken: string }>(`/api/auth/refresh`, { refreshToken: rt });
  setAccessToken(json.accessToken);
  setRefreshToken(json.refreshToken);
  return true;
};

export const refreshWithToken = async (refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> => {
  const json = await apiPost<{ accessToken: string; refreshToken: string }>(`/api/auth/refresh`, { refreshToken });
  setAccessToken(json.accessToken);
  setRefreshToken(json.refreshToken);
  return json;
};

export const getMe = async (): Promise<User> => {
  const res = await apiGet<{ user: User }>("/api/auth/me");
  return res.user;
};

export const apiRegisterDevice = async (input: { platform: string; token: string }): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>("/api/devices/register", input);
};

export type AssetOperationalStatus = "operational" | "broken" | "archived";
export type Asset = {
  id: string;
  snipeAssetId: number | null;
  assetTag: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  assetStatus: string | null;
  assetOperationalStatus: AssetOperationalStatus;
  assignedToText: string | null;
  snipeNotes: string | null;
  imageUrl: string | null;
  category: { id: string | null; name: string | null };
  location: { id: string | null; name: string | null };
  pm: {
    enabled: boolean | null;
    defaultTemplateId: string | null;
    lastCompletedAt: string | null;
    nextDueAt: string | null;
  };
};

export type ListAssetsResponse = {
  page: number;
  pageSize: number;
  items: Asset[];
};

export const apiListAssets = async (input: {
  search?: string;
  status?: string;
  operationalStatus?: "operational" | "broken" | "archived";
  pmEnabled?: boolean;
  categoryId?: string;
  categoryIds?: string[];
  locationId?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListAssetsResponse> => {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  if (input.operationalStatus) params.set("operationalStatus", input.operationalStatus);
  if (input.pmEnabled !== undefined) params.set("pmEnabled", input.pmEnabled ? "true" : "false");
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.categoryIds && input.categoryIds.length > 0) params.set("categoryIds", input.categoryIds.join(","));
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiGet<ListAssetsResponse>(`/api/assets${query ? `?${query}` : ""}`);
};

export const apiFindAssetIdByTag = async (assetTag: string): Promise<string | null> => {
  const normalized = assetTag.trim();
  if (!normalized) return null;
  const res = await apiListAssets({ search: normalized, page: 1, pageSize: 20 });
  const exact = res.items.find((a) => a.assetTag.trim().toLowerCase() === normalized.toLowerCase());
  if (exact) return exact.id;
  if (res.items.length === 1) return res.items[0].id;
  return null;
};

export const apiGetAsset = async (assetId: string): Promise<Asset> => {
  const res = await apiGet<Asset & { category: Asset["category"] | null; location: Asset["location"] | null }>(`/api/assets/${assetId}`);
  return {
    ...res,
    category: res.category ?? { id: null, name: null },
    location: res.location ?? { id: null, name: null },
    imageUrl: res.imageUrl ?? null,
  };
};

export type AssetHistoryItem = {
  id: string;
  date: string | null;
  type: string | null;
  technician: string | null;
  status: string;
  approvalStatus: string | null;
};

export const apiGetAssetHistory = async (assetId: string, input?: { approvedOnly?: boolean }): Promise<AssetHistoryItem[]> => {
  const params = new URLSearchParams();
  if (input?.approvedOnly) params.set("approvedOnly", "true");
  const query = params.toString();
  return apiGet<AssetHistoryItem[]>(`/api/assets/${assetId}/history${query ? `?${query}` : ""}`);
};

export type Facility = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  location: { id: string | null; name: string | null } | null;
  pm: {
    enabled: boolean | null;
    defaultTemplateId: string | null;
    lastCompletedAt: string | null;
    nextDueAt: string | null;
  };
};

export type ListFacilitiesResponse = {
  page: number;
  pageSize: number;
  items: Facility[];
};

export const apiListFacilities = async (input: {
  search?: string;
  locationId?: string;
  pmEnabled?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<ListFacilitiesResponse> => {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.pmEnabled !== undefined) params.set("pmEnabled", input.pmEnabled ? "true" : "false");
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiGet<ListFacilitiesResponse>(`/api/facilities${query ? `?${query}` : ""}`);
};

export type LookupRole = { id: string; name: string };
export type LookupAssetCategory = { id: string; name: string; isActive: boolean };
export type LookupLocation = { id: string; name: string; isActive: boolean };
export type LookupsResponse = {
  roles: LookupRole[];
  assetCategories: LookupAssetCategory[];
  locations: LookupLocation[];
};

export type UserSummary = {
  id: string;
  username: string;
  displayName: string | null;
  roles: string[];
};

export type ListUsersResponse = { page: number; pageSize: number; total: number; items: UserSummary[] };

export const apiGetLookups = async (): Promise<LookupsResponse> => {
  return apiGet<LookupsResponse>("/api/system/lookups");
};

export const apiListAssignableUsers = async (input: {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
}): Promise<ListUsersResponse> => {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.search) params.set("search", input.search);
  if (input.isActive !== undefined) params.set("isActive", input.isActive ? "true" : "false");
  const query = params.toString();
  return apiGet<ListUsersResponse>(`/api/system/users/for-assignment${query ? `?${query}` : ""}`);
};

export type AssetsUiSettingsResponse = {
  visibleCategoryIds: string[] | null;
  excludeInactive?: boolean;
};

export const apiGetAssetsUiSettings = async (): Promise<AssetsUiSettingsResponse> => {
  return apiGet<AssetsUiSettingsResponse>("/api/system/ui-settings/assets");
};

export type TaskUserRef = { userId: string; username: string | null; displayName: string | null };
export type TaskListItem = {
  id: string;
  taskNumber: string;
  status: string;
  priority: string;
  scheduledDueAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  approvalStatus: string | null;
  technicianCompletedAt: string | null;
  technicianCompletedBy: TaskUserRef | null;
  supervisorApprovedAt: string | null;
  supervisorApprovedBy: TaskUserRef | null;
  superadminApprovedAt: string | null;
  superadminApprovedBy: TaskUserRef | null;
  rejectedAt: string | null;
  rejectedBy: TaskUserRef | null;
  rejectionReason: string | null;
  checklistTotal: number;
  checklistCompleted: number;
  asset: { id: string | null; assetTag: string | null; name: string | null };
  facility: { id: string; name: string | null; locationName: string | null } | null;
  template: { id: string; name: string };
  assignedTo: { userId: string | null; username: string | null; displayName: string | null; roleId: string | null; roleName: string | null };
};

export type ApprovalInboxStage = "PendingSupervisor" | "PendingSuperadmin";

export type ApprovalInboxItem = {
  id: string;
  taskNumber: string;
  maintenanceType: "PM" | "CM";
  status: string;
  priority: string;
  scheduledDueAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  approvalStatus: string | null;
  technicianCompletedAt: string | null;
  technicianCompletedBy: TaskUserRef | null;
  asset: { id: string | null; assetTag: string | null; name: string | null };
  facility: { id: string; name: string | null; locationName: string | null } | null;
  template: { id: string; name: string };
  assignedTo: { userId: string | null; username: string | null; displayName: string | null; roleId: string | null; roleName: string | null };
};

export type ListApprovalInboxResponse = { page: number; pageSize: number; items: ApprovalInboxItem[] };

export type WorkOrderListItem = {
  id: string;
  taskNumber: string;
  status: string;
  priority: string | null;
  scheduledDueAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  symptom: string | null;
  impactLevel: string | null;
  failureCategory: string | null;
  failureCode: string | null;
  reportedAt: string | null;
  reportedByUsername: string | null;
  asset: { id: string; assetTag: string | null; name: string | null } | null;
  facility: { id: string; name: string | null } | null;
  category: { id: string | null; name: string | null } | null;
  location: { id: string | null; name: string | null } | null;
  templateName: string | null;
  assignedTo: { userId: string | null; username: string | null; displayName: string | null; roleId: string | null; roleName: string | null };
};

export type ListWorkOrdersResponse = { page: number; pageSize: number; items: WorkOrderListItem[] };

export type WorkOrderDetail = {
  id: string;
  taskNumber: string;
  status: string;
  priority: string | null;
  scheduledDueAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  symptom: string | null;
  impactLevel: string | null;
  failureCategory: string | null;
  failureCode: string | null;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
  reportedAt: string | null;
  reportedChannel: string | null;
  reportedBy: TaskUserRef | null;
  asset: { id: string; assetTag: string | null; name: string | null } | null;
  facility: { id: string; name: string | null } | null;
  template: { id: string; name: string };
  assignedTo: { userId: string | null; username: string | null; displayName: string | null; roleId: string | null; roleName: string | null };
  completedBy: TaskUserRef | null;
  cancelledBy: TaskUserRef | null;
  resolutionNotes: string | null;
};

export type TaskChecklistEvidence = {
  id: string;
  templateChecklistItemId: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uri: string;
  uploadedAt: string;
  uploadedBy: TaskUserRef | null;
};

export type TaskDetailChecklistItem = {
  id: string;
  sortOrder: number;
  itemText: string;
  isMandatory: boolean;
  requiresNotes: boolean;
  requiresPassFail: boolean;
  enableAttachment: boolean;
  requiresAttachment: boolean;
  isActive: boolean;
  evidence: TaskChecklistEvidence[];
  result: {
    id: string;
    outcome: 0 | 1 | 2;
    outcomeLabel: "skip" | "pass" | "fail" | "done";
    notes: string | null;
    completedAt: string | null;
    completedBy: TaskUserRef | null;
  } | null;
};

export type TaskEvidence = {
  id: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uri: string;
  uploadedAt: string;
  uploadedBy: TaskUserRef | null;
};

export type DownloadEvidenceResponse = {
  blob: Blob;
  fileName: string | null;
  contentType: string | null;
};

const parseFilenameFromContentDisposition = (value: string | null): string | null => {
  if (!value) return null;
  const match = value.match(/filename\*=UTF-8''([^;]+)|filename="?([^;"]+)"?/i);
  const encoded = match?.[1] ?? null;
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  const plain = match?.[2] ?? null;
  return plain ? plain.trim() : null;
};

export type TaskDetail = {
  id: string;
  taskNumber: string;
  maintenanceType: "PM" | "CM";
  status: string;
  priority: string;
  scheduledDueAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: TaskUserRef | null;
  cancelledAt: string | null;
  cancelledBy: TaskUserRef | null;
  forceCompleted: boolean | null;
  approvalStatus: string | null;
  technicianCompletedAt: string | null;
  technicianCompletedBy: TaskUserRef | null;
  supervisorApprovedAt: string | null;
  supervisorApprovedBy: TaskUserRef | null;
  superadminApprovedAt: string | null;
  superadminApprovedBy: TaskUserRef | null;
  rejectedAt: string | null;
  rejectedBy: TaskUserRef | null;
  rejectionReason: string | null;
  revisedAt: string | null;
  revisedBy: TaskUserRef | null;
  revisionNote: string | null;
  asset: { id: string; assetTag: string; name: string };
  facility: { id: string; name: string | null } | null;
  template: { id: string; name: string };
  assignedTo: { userId: string | null; username: string | null; displayName: string | null; roleId: string | null; roleName: string | null };
  checklistItems: TaskDetailChecklistItem[];
  evidence: TaskEvidence[];
};

export type ListTasksResponse = { page: number; pageSize: number; items: TaskListItem[] };

export type TaskStatusCountsResponse = {
  all: number;
  inProgress: number;
  completed: number;
  dueToday: number;
  upcoming: number;
  overdue: number;
};

export type MyOutstandingCountsResponse = {
  waitingForApproval: number;
  needsRevision: number;
  total: number;
};

export type DashboardOverview = {
  stats: {
    totalAssetsInPm: number;
    upcoming7DaysCount: number;
    dueTodayCount: number;
    overdueCount: number;
  };
  complianceTrend: Array<{
    monthStart: string;
    monthEnd: string;
    totalDue: number;
    completedOnTime: number;
    complianceRate: number | null;
  }>;
  overdueByCategory: Array<{ name: string; count: number }>;
  overdueAssets: Array<{ id: string; assetTag: string | null; name: string | null }>;
  recentTasks: Array<{
    id: string;
    taskNumber: string;
    status: string;
    scheduledDueAt: string;
    asset: { id: string | null; assetTag: string | null; name: string | null; imageUrl: string | null };
    template: { name: string };
    assignedTo: { displayName: string | null; roleName: string | null };
  }>;
};

export const apiGetDashboardOverview = async (): Promise<DashboardOverview> => {
  return apiGet<DashboardOverview>("/api/dashboard/overview");
};

export type UploadEvidenceResponse = { id: string; queued?: true };

export const apiUploadTaskEvidenceFile = async (input: { taskId: string; file: File }): Promise<UploadEvidenceResponse> => {
  try {
    const res = await apiFetchWithAuthRetry(`/api/tasks/${input.taskId}/evidence/upload`, {
      method: "POST",
      headers: {
        "Content-Type": input.file.type || "application/octet-stream",
        "x-filename": input.file.name,
      },
      body: input.file,
    });
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as { id: string };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const queuedId = await enqueueEvidenceUpload({ kind: "task", taskId: input.taskId, templateChecklistItemId: null, file: input.file });
    return { id: queuedId, queued: true };
  }
};

export const apiDownloadEvidence = async (input: {
  evidenceId: string;
  download?: boolean;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams();
  if (input.download) params.set("download", "1");
  const query = params.toString();

  const res = await apiFetchWithAuthRetry(
    `/api/tasks/evidence/${encodeURIComponent(input.evidenceId)}${query ? `?${query}` : ""}`,
    { method: "GET", headers: { Accept: "*/*" } },
  );
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition");
  const fileName = parseFilenameFromContentDisposition(cd);
  const contentType = res.headers.get("content-type");
  return { blob, fileName, contentType };
};

export const apiDownloadChecklistEvidence = async (input: {
  checklistEvidenceId: string;
  download?: boolean;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams();
  if (input.download) params.set("download", "1");
  const query = params.toString();

  const res = await apiFetchWithAuthRetry(
    `/api/tasks/checklist-evidence/${encodeURIComponent(input.checklistEvidenceId)}${query ? `?${query}` : ""}`,
    { method: "GET", headers: { Accept: "*/*" } },
  );
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition");
  const fileName = parseFilenameFromContentDisposition(cd);
  const contentType = res.headers.get("content-type");
  return { blob, fileName, contentType };
};

export const apiDownloadAssetImage = async (assetId: string): Promise<DownloadEvidenceResponse> => {
  const res = await apiFetchWithAuthRetry(`/api/assets/${encodeURIComponent(assetId)}/image`, {
    method: "GET",
    headers: { Accept: "*/*" },
  });
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition");
  const fileName = parseFilenameFromContentDisposition(cd);
  const contentType = res.headers.get("content-type");
  return { blob, fileName, contentType };
};

export const apiUploadTaskChecklistEvidenceFile = async (input: {
  taskId: string;
  templateChecklistItemId: string;
  file: File;
}): Promise<UploadEvidenceResponse> => {
  try {
    const res = await apiFetchWithAuthRetry(
      `/api/tasks/${input.taskId}/checklist-items/${input.templateChecklistItemId}/evidence/upload`,
      {
        method: "POST",
        headers: {
          "Content-Type": input.file.type || "application/octet-stream",
          "x-filename": input.file.name,
        },
        body: input.file,
      },
    );
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as { id: string };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const queuedId = await enqueueEvidenceUpload({
      kind: "checklist",
      taskId: input.taskId,
      templateChecklistItemId: input.templateChecklistItemId,
      file: input.file,
    });
    return { id: queuedId, queued: true };
  }
};

export const apiGetTask = async (taskId: string): Promise<TaskDetail> => {
  return apiGet<TaskDetail>(`/api/tasks/${taskId}`);
};

export const apiAssignTask = async (input: {
  taskId: string;
  assignedToUserId?: string | null;
  assignedToRoleId?: string | null;
}): Promise<{ ok: true }> => {
  const body: { assignedToUserId?: string | null; assignedToRoleId?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(input, "assignedToUserId")) body.assignedToUserId = input.assignedToUserId ?? null;
  if (Object.prototype.hasOwnProperty.call(input, "assignedToRoleId")) body.assignedToRoleId = input.assignedToRoleId ?? null;
  return apiPost<{ ok: true }>(`/api/tasks/${encodeURIComponent(input.taskId)}/assign`, body);
};

export const apiListTasks = async (input: {
  status?: string;
  assigned?: "me" | "unassigned" | "any";
  overdue?: boolean;
  maintenanceType?: "PM" | "CM" | "all";
  assetId?: string;
  templateId?: string;
  dueFrom?: string;
  dueTo?: string;
  approvedOnly?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<ListTasksResponse> => {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.assigned) params.set("assigned", input.assigned);
  if (input.overdue !== undefined) params.set("overdue", input.overdue ? "true" : "false");
  if (input.maintenanceType) params.set("maintenanceType", input.maintenanceType);
  if (input.assetId) params.set("assetId", input.assetId);
  if (input.templateId) params.set("templateId", input.templateId);
  if (input.dueFrom) params.set("dueFrom", input.dueFrom);
  if (input.dueTo) params.set("dueTo", input.dueTo);
  if (input.approvedOnly !== undefined) params.set("approvedOnly", input.approvedOnly ? "true" : "false");
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiGet<ListTasksResponse>(`/api/tasks${query ? `?${query}` : ""}`);
};

export const apiGetTaskStatusCounts = async (input: {
  assigned?: "me" | "unassigned" | "any";
  maintenanceType?: "PM" | "CM" | "all";
}): Promise<TaskStatusCountsResponse> => {
  const params = new URLSearchParams();
  if (input.assigned) params.set("assigned", input.assigned);
  if (input.maintenanceType) params.set("maintenanceType", input.maintenanceType);
  const query = params.toString();
  return apiGet<TaskStatusCountsResponse>(`/api/tasks/status-counts${query ? `?${query}` : ""}`);
};

export const apiGetMyOutstandingCounts = async (): Promise<MyOutstandingCountsResponse> => {
  return apiGet<MyOutstandingCountsResponse>("/api/tasks/my-outstanding-counts");
};

export const apiListApprovalInbox = async (input: {
  stage: ApprovalInboxStage;
  page?: number;
  pageSize?: number;
}): Promise<ListApprovalInboxResponse> => {
  const params = new URLSearchParams();
  params.set("stage", input.stage);
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiGet<ListApprovalInboxResponse>(`/api/tasks/approvals?${query}`);
};

export const apiApproveTaskBySupervisor = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/tasks/${encodeURIComponent(taskId)}/approve-by-supervisor`);
};

export const apiApproveTaskBySuperadmin = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/tasks/${encodeURIComponent(taskId)}/approve-by-superadmin`);
};

export const apiSubmitTaskForApproval = async (input: {
  taskId: string;
  checklistResults?: CompleteTaskChecklistResultInput[];
}): Promise<QueuedOkResponse> => {
  const { taskId, ...rest } = input;
  const body: { checklistResults?: CompleteTaskChecklistResultInput[] } = {};
  if (Array.isArray(rest.checklistResults)) body.checklistResults = rest.checklistResults;
  return apiPostOkOrQueue(`/api/tasks/${encodeURIComponent(taskId)}/submit-for-approval`, body);
};

export const apiRejectTaskApproval = async (input: {
  taskId: string;
  reason?: string;
  reopenTask?: boolean;
}): Promise<{ ok: true }> => {
  const body: { reason?: string; reopenTask?: boolean } = {};
  if (typeof input.reason === "string") body.reason = input.reason;
  if (typeof input.reopenTask === "boolean") body.reopenTask = input.reopenTask;
  return apiPost<{ ok: true }>(`/api/tasks/${encodeURIComponent(input.taskId)}/reject-approval`, body);
};

export const apiReviseTaskApproval = async (input: {
  taskId: string;
  reason?: string;
  reopenTask?: boolean;
}): Promise<{ ok: true }> => {
  const body: { reason?: string; reopenTask?: boolean } = {};
  if (typeof input.reason === "string") body.reason = input.reason;
  if (typeof input.reopenTask === "boolean") body.reopenTask = input.reopenTask;
  return apiPost<{ ok: true }>(`/api/tasks/${encodeURIComponent(input.taskId)}/revise-approval`, body);
};

export const apiSuperadminUpdateTaskChecklist = async (input: {
  taskId: string;
  checklistResults?: CompleteTaskChecklistResultInput[];
}): Promise<{ ok: true }> => {
  const { taskId, ...rest } = input;
  const body: { checklistResults?: CompleteTaskChecklistResultInput[] } = {};
  if (Array.isArray(rest.checklistResults)) body.checklistResults = rest.checklistResults;
  return apiPost<{ ok: true }>(`/api/tasks/${encodeURIComponent(taskId)}/superadmin-update-checklist`, body);
};

export const apiCreatePmNowTask = async (input: {
  assetId: string;
}): Promise<{ id: string; duplicate: boolean }> => {
  const res = await apiFetchWithAuthRetry("/api/tasks/pm-now", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assetId: input.assetId }),
  });

  if (res.status === 409) {
    const data = (await res.json()) as unknown;
    const id =
      typeof data === "object" && data !== null && "id" in data && typeof data.id === "string" ? data.id : null;
    if (!id) throw new ApiError(409, "PM Now already created recently", "PM_NOW_DUPLICATE");
    return { id, duplicate: true };
  }

  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as unknown;
  const id = typeof data === "object" && data !== null && "id" in data && typeof data.id === "string" ? data.id : null;
  if (!id) throw new ApiError(500, "Request failed");
  return { id, duplicate: false };
};

export type CompleteTaskChecklistResultInput = {
  templateChecklistItemId: string;
  outcome: 0 | 1 | 2;
  notes?: string | null;
};

export const apiListWorkOrders = async (input: {
  page?: number;
  pageSize?: number;
  status?: string;
  assetId?: string;
  facilityId?: string;
  impactLevel?: string;
  categoryId?: string;
  locationId?: string;
  reportedFrom?: string;
  reportedTo?: string;
  completedFrom?: string;
  completedTo?: string;
  assigned?: "any" | "unassigned" | "me";
}): Promise<ListWorkOrdersResponse> => {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.status) params.set("status", input.status);
  if (input.assetId) params.set("assetId", input.assetId);
  if (input.facilityId) params.set("facilityId", input.facilityId);
  if (input.impactLevel) params.set("impactLevel", input.impactLevel);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.reportedFrom) params.set("reportedFrom", input.reportedFrom);
  if (input.reportedTo) params.set("reportedTo", input.reportedTo);
  if (input.completedFrom) params.set("completedFrom", input.completedFrom);
  if (input.completedTo) params.set("completedTo", input.completedTo);
  if (input.assigned) params.set("assigned", input.assigned);
  const query = params.toString();
  return apiGet<ListWorkOrdersResponse>(`/api/work-orders${query ? `?${query}` : ""}`);
};

export const apiGetWorkOrder = async (taskId: string): Promise<WorkOrderDetail> => {
  return apiGet<WorkOrderDetail>(`/api/work-orders/${taskId}`);
};

export const apiAssignWorkOrder = async (input: {
  taskId: string;
  assignedToUserId?: string | null;
  assignedToRoleId?: string | null;
}): Promise<{ ok: true }> => {
  const body: { assignedToUserId?: string | null; assignedToRoleId?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(input, "assignedToUserId")) body.assignedToUserId = input.assignedToUserId ?? null;
  if (Object.prototype.hasOwnProperty.call(input, "assignedToRoleId")) body.assignedToRoleId = input.assignedToRoleId ?? null;
  return apiPost<{ ok: true }>(`/api/work-orders/${encodeURIComponent(input.taskId)}/assign`, body);
};

export const apiCreateWorkOrder = async (input: {
  assetId?: string;
  facilityId?: string;
  templateId?: string;
  symptom: string;
  impactLevel?: "normal" | "high" | "critical";
  failureCategory?: string;
  failureCode?: string;
  downtimeStartedAt?: string;
  reportedChannel?: string;
}): Promise<{ id: string }> => {
  return apiPost<{ id: string }>("/api/work-orders", input);
};

export const apiStartWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiPostOkOrQueue(`/api/work-orders/${taskId}/start`);
};

export const apiPauseWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiPostOkOrQueue(`/api/work-orders/${taskId}/pause`);
};

export const apiResumeWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiPostOkOrQueue(`/api/work-orders/${taskId}/resume`);
};

export const apiCancelWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiPostOkOrQueue(`/api/work-orders/${taskId}/cancel`);
};

export const apiCloseDowntime = async (taskId: string): Promise<{ ok: true }> => {
  return apiPostOkOrQueue(`/api/work-orders/${taskId}/close-downtime`);
};

export const apiCompleteWorkOrder = async (input: {
  taskId: string;
  checklistResults?: CompleteTaskChecklistResultInput[];
  forceCompleted?: boolean;
  completedAt?: string;
  backdateReason?: string;
  technicianName?: string;
}): Promise<QueuedOkResponse> => {
  const { taskId, ...body } = input;
  return apiPostOkOrQueue(`/api/work-orders/${taskId}/complete`, body);
};

export const apiStartTask = async (taskId: string): Promise<QueuedOkResponse> => {
  return apiPostOkOrQueue(`/api/tasks/${taskId}/start`);
};

export const apiPauseTask = async (taskId: string): Promise<QueuedOkResponse> => {
  return apiPostOkOrQueue(`/api/tasks/${taskId}/pause`);
};

export const apiResumeTask = async (taskId: string): Promise<QueuedOkResponse> => {
  return apiPostOkOrQueue(`/api/tasks/${taskId}/resume`);
};

export const apiCompleteTask = async (input: {
  taskId: string;
  checklistResults?: CompleteTaskChecklistResultInput[];
  forceCompleted?: boolean;
  completedAt?: string;
  backdateReason?: string;
  technicianName?: string;
}): Promise<QueuedOkResponse> => {
  const { taskId, ...body } = input;
  return apiPostOkOrQueue(`/api/tasks/${taskId}/complete`, body);
};

export type SchedulingCalendarItem = {
  date: string;
  type: "scheduled" | "due" | "overdue";
  count: number;
  capacityMinutes: number;
};

export type SchedulingDayItem = {
  id: string;
  taskNumber: string;
  scheduledDueAt: string;
  status: string;
  priority: string;
  estimatedMinutes: number;
  bucket: "scheduled" | "due" | "overdue";
  asset: { id: string; assetTag: string; name: string };
  template: { id: string; name: string };
  assetOperationalStatus: string | null;
  scheduleFrozen: boolean;
};

export const apiGetSchedulingCalendar = async (month?: string): Promise<{ items: SchedulingCalendarItem[] }> => {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiGet<{ items: SchedulingCalendarItem[] }>(`/api/scheduling/calendar${q}`);
};

export const apiGetSchedulingDay = async (date: string): Promise<{ items: SchedulingDayItem[] }> => {
  const q = `?date=${encodeURIComponent(date)}`;
  return apiGet<{ items: SchedulingDayItem[] }>(`/api/scheduling/day${q}`);
};

declare const __APP_VERSION__: string | undefined;

export type LatestAppUpdate = {
  appId: string;
  versionName: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  modifiedAt: string;
  downloadUrl: string;
};

export const apiGetLatestAppUpdate = async (appId: string): Promise<LatestAppUpdate> => {
  const q = `?appId=${encodeURIComponent(appId)}`;
  const res = await apiFetchJson<{ latest: LatestAppUpdate }>(`/api/app-updates/latest${q}`);
  return res.latest;
};

export type AppUpdatePolicy = {
  enabled: boolean;
  requiredVersionCode: number | null;
  shouldDownload: boolean;
  message: string | null;
};

export const apiGetAppUpdatePolicy = async (input: {
  appId: string;
  platform: "android" | "ios" | "web";
  versionCode: number;
}): Promise<AppUpdatePolicy> => {
  const q = new URLSearchParams();
  q.set("appId", input.appId);
  q.set("platform", input.platform);
  q.set("versionCode", String(input.versionCode));
  return apiGet<AppUpdatePolicy>(`/api/app-updates/policy?${q.toString()}`);
};

export const apiReportAppInstallation = async (input: {
  installationId: string;
  appId: string;
  platform: "android" | "ios" | "web";
  versionCode: number;
  versionName?: string;
}): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/app-updates/report`, input);
};

type SemverParts = { major: number; minor: number; patch: number };

const parseSemverParts = (versionName: string): SemverParts | null => {
  const m = versionName.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return { major, minor, patch };
};

const compareSemver = (a: string, b: string): number => {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
};

const getCurrentVersionName = (): string | null => {
  const raw = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? __APP_VERSION__;
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
};

export const hasNewerAppUpdate = (latestVersionName: string): boolean => {
  const current = getCurrentVersionName();
  if (!current) return true;
  return compareSemver(current, latestVersionName) < 0;
};

type AppUpdaterPlugin = {
  downloadAndInstall(options: { url: string; fileName?: string }): Promise<{ ok: boolean; code?: string }>;
};

let appUpdaterPlugin: AppUpdaterPlugin | null = null;

const getAppUpdaterPlugin = (): AppUpdaterPlugin => {
  if (appUpdaterPlugin) return appUpdaterPlugin;
  appUpdaterPlugin = registerPlugin<AppUpdaterPlugin>("AppUpdater");
  return appUpdaterPlugin;
};

export const downloadAndInstallAppUpdate = async (latest: LatestAppUpdate): Promise<{ ok: boolean; code?: string }> => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    const absolute = latest.downloadUrl.startsWith("http") ? latest.downloadUrl : `${API_BASE_URL}${latest.downloadUrl}`;
    window.open(absolute, "_blank");
    return { ok: false, code: "NOT_ANDROID" };
  }

  await ensureDiscovery();
  const base = getApiBase();
  const absolute = latest.downloadUrl.startsWith("http") ? latest.downloadUrl : `${base}${latest.downloadUrl}`;
  const plugin = getAppUpdaterPlugin();

  type PreflightResult =
    | { kind: "ok" }
    | { kind: "timeout" }
    | { kind: "http"; status: number }
    | { kind: "network"; message: string | null };

  const preflightTimeoutMs = 8000;
  const preflight: Promise<PreflightResult> = (async () => {
    try {
      const res = await fetch(absolute, { method: "HEAD" });
      if (!res.ok) return { kind: "http", status: res.status };
      return { kind: "ok" };
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.trim().length > 0 ? err.message : null;
      return { kind: "network", message: msg };
    }
  })();

  const preflightResult = await Promise.race<PreflightResult>([
    preflight,
    new Promise<PreflightResult>((resolve) => {
      window.setTimeout(() => resolve({ kind: "timeout" }), preflightTimeoutMs);
    }),
  ]);

  if (preflightResult.kind === "timeout") return { ok: false, code: "PREFLIGHT_TIMEOUT" };
  if (preflightResult.kind === "http") return { ok: false, code: `HTTP_${preflightResult.status}` };
  if (preflightResult.kind === "network") return { ok: false, code: preflightResult.message ? `NETWORK_${preflightResult.message}` : "NETWORK" };

  const timeoutMs = 180_000;
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<{ ok: boolean; code?: string }>((resolve) => {
    timeoutId = window.setTimeout(() => resolve({ ok: false, code: "TIMEOUT" }), timeoutMs);
  });

  try {
    return await Promise.race([plugin.downloadAndInstall({ url: absolute, fileName: latest.fileName }), timeoutPromise]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
};
