import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearAccessToken, clearRefreshToken, notifyAuthInvalid } from "./auth";

const defaultApiBaseUrl = import.meta.env.PROD ? "" : "http://localhost:3001";
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl).replace(/\/$/, "");

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
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = typeof init?.body !== "undefined" && init?.body !== null;
  const contentHeaders = hasBody ? { "Content-Type": "application/json" } : {};
  const res = await fetch(url, {
    ...(init ?? {}),
    headers: { ...contentHeaders, ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: hasBody && typeof init?.body !== "string" ? JSON.stringify(init?.body) : init?.body,
  });
  if (res.status === 401) {
    const refreshed = await refresh();
    if (!refreshed) {
      clearAccessToken();
      clearRefreshToken();
      notifyAuthInvalid();
      throw new ApiError(401, "Unauthorized");
    }
    const retry = await fetch(url, {
      ...(init ?? {}),
      headers: { ...contentHeaders, ...headers, Authorization: `Bearer ${getAccessToken() ?? ""}`, ...(init?.headers as Record<string, string> | undefined) },
      body: hasBody && typeof init?.body !== "string" ? JSON.stringify(init?.body) : init?.body,
    });
    if (!retry.ok) throw await parseError(retry);
    return (await retry.json()) as T;
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
};

const apiFetchWithAuthRetry = async (path: string, init?: RequestInit): Promise<Response> => {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    ...(init ?? {}),
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });

  if (res.status !== 401) return res;

  const refreshed = await refresh();
  if (!refreshed) {
    clearAccessToken();
    clearRefreshToken();
    notifyAuthInvalid();
    return res;
  }

  return fetch(url, {
    ...(init ?? {}),
    headers: { ...headers, Authorization: `Bearer ${getAccessToken() ?? ""}`, ...(init?.headers as Record<string, string> | undefined) },
  });
};

export const apiGet = async <T>(path: string): Promise<T> => {
  return apiFetchJson<T>(path, { method: "GET" });
};

export const apiPost = async <T>(path: string, body?: unknown): Promise<T> => {
  const bodyInit = body === undefined || body === null ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  return apiFetchJson<T>(path, { method: "POST", body: bodyInit });
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

export const getMe = async (): Promise<User> => {
  const res = await apiGet<{ user: User }>("/api/auth/me");
  return res.user;
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

export const apiGetLookups = async (): Promise<LookupsResponse> => {
  return apiGet<LookupsResponse>("/api/system/lookups");
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

export const apiUploadTaskEvidenceFile = async (input: { taskId: string; file: File }): Promise<{ id: string }> => {
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
}): Promise<{ id: string }> => {
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
};

export const apiGetTask = async (taskId: string): Promise<TaskDetail> => {
  return apiGet<TaskDetail>(`/api/tasks/${taskId}`);
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
}): Promise<{ ok: true }> => {
  const { taskId, ...rest } = input;
  const body: { checklistResults?: CompleteTaskChecklistResultInput[] } = {};
  if (Array.isArray(rest.checklistResults)) body.checklistResults = rest.checklistResults;
  return apiPost<{ ok: true }>(`/api/tasks/${encodeURIComponent(taskId)}/submit-for-approval`, body);
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
  return apiPost<{ ok: true }>(`/api/work-orders/${taskId}/start`);
};

export const apiPauseWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/work-orders/${taskId}/pause`);
};

export const apiResumeWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/work-orders/${taskId}/resume`);
};

export const apiCancelWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/work-orders/${taskId}/cancel`);
};

export const apiCloseDowntime = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/work-orders/${taskId}/close-downtime`);
};

export const apiCompleteWorkOrder = async (input: {
  taskId: string;
  checklistResults?: CompleteTaskChecklistResultInput[];
  forceCompleted?: boolean;
  completedAt?: string;
  backdateReason?: string;
  technicianName?: string;
}): Promise<{ ok: true }> => {
  const { taskId, ...body } = input;
  return apiPost<{ ok: true }>(`/api/work-orders/${taskId}/complete`, body);
};

export const apiStartTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/tasks/${taskId}/start`);
};

export const apiPauseTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/tasks/${taskId}/pause`);
};

export const apiResumeTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiPost<{ ok: true }>(`/api/tasks/${taskId}/resume`);
};

export const apiCompleteTask = async (input: {
  taskId: string;
  checklistResults?: CompleteTaskChecklistResultInput[];
  forceCompleted?: boolean;
  completedAt?: string;
  backdateReason?: string;
  technicianName?: string;
}): Promise<{ ok: true }> => {
  const { taskId, ...body } = input;
  return apiPost<{ ok: true }>(`/api/tasks/${taskId}/complete`, body);
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
