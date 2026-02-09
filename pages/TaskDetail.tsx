import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  apiAssignTask,
  apiApproveTaskBySupervisor,
  apiApproveTaskBySuperadmin,
  apiDownloadAssetImage,
  apiDownloadChecklistEvidence,
  apiGetAsset,
  apiGetLookups,
  apiGetTask,
  getPendingEvidenceCount,
  getPendingMutationCount,
  getQueuedChecklistEvidenceCount,
  getQueuedTaskEvidenceCount,
  apiPauseTask,
  apiListAssignableUsers,
  apiRejectTaskApproval,
  apiReviseTaskApproval,
  apiResumeTask,
  apiStartTask,
  apiSubmitTaskForApproval,
  apiSuperadminUpdateTaskChecklist,
  apiUploadTaskChecklistEvidenceFile,
  apiUploadTaskEvidenceFile,
  type CompleteTaskChecklistResultInput,
  type LookupRole,
  type TaskChecklistEvidence,
  type TaskDetail,
  type UserSummary,
} from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

const TaskDetail: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const taskId = params.id as string;
  const { user } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [assetImageUrl, setAssetImageUrl] = useState<string | null>(null);
  const [assetNotes, setAssetNotes] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncTick, setSyncTick] = useState(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReopenTask, setRejectReopenTask] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseReason, setReviseReason] = useState('');
  const [reviseReopenTask, setReviseReopenTask] = useState(true);
  const [checklistDraft, setChecklistDraft] = useState<Record<string, { outcome: 0 | 1 | 2 | null; notes: string }>>({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSaveNotice, setDraftSaveNotice] = useState<string | null>(null);
  const [draftSaveFlash, setDraftSaveFlash] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'user' | 'role' | 'unassigned'>('user');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignUsers, setAssignUsers] = useState<UserSummary[]>([]);
  const [assignRoles, setAssignRoles] = useState<LookupRole[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignOptionsLoading, setAssignOptionsLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewTranslateX, setPreviewTranslateX] = useState(0);
  const [previewTranslateY, setPreviewTranslateY] = useState(0);
  const checklistUploadItemIdRef = useRef<string | null>(null);
  const checklistFileInputRef = useRef<HTMLInputElement | null>(null);
  const checklistPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const checklistVideoInputRef = useRef<HTMLInputElement | null>(null);
  const taskFileInputRef = useRef<HTMLInputElement | null>(null);
  const checklistDraftInitTaskIdRef = useRef<string | null>(null);
  const draftSaveNoticeTimerRef = useRef<number | null>(null);

  const checklistDraftStorageKey = (id: string): string => `pm-tech.checklistDraft.${id}`;
  const checklistDraftSavedAtStorageKey = (id: string): string => `pm-tech.checklistDraftSavedAt.${id}`;

  const parseChecklistDraft = (
    raw: string,
  ): Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> | null => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const record = parsed as Record<string, unknown>;
      const next: Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> = {};
      for (const [key, value] of Object.entries(record)) {
        if (typeof key !== 'string' || !key.trim()) continue;
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        const outcome = v.outcome;
        const notes = v.notes;
        const validOutcome = outcome === null || outcome === 0 || outcome === 1 || outcome === 2;
        if (!validOutcome) continue;
        if (typeof notes !== 'string') continue;
        next[key] = { outcome: outcome as 0 | 1 | 2 | null, notes };
      }
      return next;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await apiGetTask(taskId);
        if (!isCancelled) setTask(res);
      } catch (e) {
        if (!isCancelled) setError('Failed to load task');
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    if (taskId) void load();
    return () => { isCancelled = true; };
  }, [taskId]);

  useEffect(() => {
    const assetId = task?.asset?.id;
    if (!assetId) {
      setAssetImageUrl(null);
      setAssetNotes(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    const loadImage = async (): Promise<void> => {
      setAssetImageUrl(null);
      try {
        const asset = await apiGetAsset(assetId);
        if (!active) return;

        const notes = asset?.snipeNotes?.trim() ? asset.snipeNotes.trim() : null;
        setAssetNotes(notes);

        const directUrl = asset?.imageUrl?.trim() ? asset.imageUrl : null;
        if (directUrl) {
          setAssetImageUrl(directUrl);
          return;
        }

        const res = await apiDownloadAssetImage(assetId);
        if (!active) return;
        objectUrl = URL.createObjectURL(res.blob);
        setAssetImageUrl(objectUrl);
      } catch {
        if (active) setAssetImageUrl(null);
      }
    };
    void loadImage();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [task?.asset?.id]);

  useEffect(() => {
    if (!task) return;
    if (checklistDraftInitTaskIdRef.current === task.id) return;
    checklistDraftInitTaskIdRef.current = task.id;
    const base: Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> = {};
    for (const item of task.checklistItems) {
      const outcome = item.result ? item.result.outcome : null;
      const notes = item.result?.notes ?? '';
      base[item.id] = { outcome, notes };
    }

    const stored = parseChecklistDraft(localStorage.getItem(checklistDraftStorageKey(task.id)) ?? '');
    if (!stored) {
      setChecklistDraft(base);
      setDraftSavedAt(localStorage.getItem(checklistDraftSavedAtStorageKey(task.id)) ?? null);
      return;
    }
    const merged: Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> = {};
    for (const [id, serverValue] of Object.entries(base)) {
      const localValue = stored[id];
      merged[id] = localValue ?? serverValue;
    }
    setChecklistDraft(merged);
    setDraftSavedAt(localStorage.getItem(checklistDraftSavedAtStorageKey(task.id)) ?? null);
  }, [task?.id]);

  useEffect(() => {
    if (!task) return;
    try {
      localStorage.setItem(checklistDraftStorageKey(task.id), JSON.stringify(checklistDraft));
    } catch {
      return;
    }
  }, [task?.id, checklistDraft]);

  useEffect(() => {
    const onOnline = (): void => setOnline(true);
    const onOffline = (): void => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const onSaveDraft = (): void => {
    if (!task) return;
    setError(null);
    try {
      localStorage.setItem(checklistDraftStorageKey(task.id), JSON.stringify(checklistDraft));
      const savedAt = new Date().toISOString();
      localStorage.setItem(checklistDraftSavedAtStorageKey(task.id), savedAt);
      setDraftSavedAt(savedAt);
      setDraftSaveNotice('Draft saved');
      setDraftSaveFlash(true);
    } catch {
      setError('Failed to save draft locally');
    }
  };

  useEffect(() => {
    if (!draftSaveNotice) return;
    if (draftSaveNoticeTimerRef.current !== null) {
      window.clearTimeout(draftSaveNoticeTimerRef.current);
    }
    draftSaveNoticeTimerRef.current = window.setTimeout(() => {
      setDraftSaveNotice(null);
    }, 2500);
    return () => {
      if (draftSaveNoticeTimerRef.current !== null) {
        window.clearTimeout(draftSaveNoticeTimerRef.current);
        draftSaveNoticeTimerRef.current = null;
      }
    };
  }, [draftSaveNotice]);

  useEffect(() => {
    if (!draftSaveFlash) return;
    const timer = window.setTimeout(() => setDraftSaveFlash(false), 1200);
    return () => window.clearTimeout(timer);
  }, [draftSaveFlash]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!previewOpen) return;
    setPreviewScale(1);
    setPreviewTranslateX(0);
    setPreviewTranslateY(0);
    pointersRef.current.clear();
    panRef.current = null;
    pinchRef.current = null;
  }, [previewOpen, previewUrl]);

  useEffect(() => {
    if (!assignOpen) return;
    let cancelled = false;
    setAssignOptionsLoading(true);
    setAssignError(null);
    void (async () => {
      try {
        const [lookups, users] = await Promise.all([
          apiGetLookups(),
          apiListAssignableUsers({ page: 1, pageSize: 200, isActive: true }),
        ]);
        if (cancelled) return;
        setAssignRoles(lookups.roles ?? []);
        setAssignUsers(users.items ?? []);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to load assignees';
        setAssignError(message);
      } finally {
        if (!cancelled) setAssignOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignOpen]);

  const formatDueAt = (value: string): string => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  };

  type ApprovalPill = { label: string; className: string; icon: string };
  type ApprovalStepState = 'done' | 'current' | 'pending' | 'rejected';
  type ApprovalStep = { title: string; state: ApprovalStepState; meta: string | null; icon: string };

  const formatApprovalActor = (ref: TaskDetail['technicianCompletedBy']): string | null => {
    if (!ref) return null;
    return ref.displayName ?? ref.username ?? null;
  };

  const formatActorAt = (ref: TaskDetail['technicianCompletedBy'], at: string | null): string | null => {
    if (!at) return null;
    const who = formatApprovalActor(ref);
    return who ? `${who} • ${formatDueAt(at)}` : formatDueAt(at);
  };

  const approvalSummary = (t: TaskDetail): ApprovalPill => {
    const approvalStatus = (t.approvalStatus ?? '').trim();
    if (approvalStatus === 'Approved') {
      return { label: 'Approved', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', icon: 'verified' };
    }
    if (approvalStatus === 'PendingSupervisor') {
      return { label: 'Pending Supervisor', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', icon: 'hourglass_top' };
    }
    if (approvalStatus === 'PendingSuperadmin') {
      return { label: 'Pending Superadmin', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', icon: 'hourglass_top' };
    }
    if (approvalStatus === 'Rejected') {
      return { label: 'Rejected', className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300', icon: 'cancel' };
    }
    if (t.revisionNote || t.revisedAt) {
      return { label: 'Needs Revision', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', icon: 'edit' };
    }
    if (t.technicianCompletedAt || t.completedAt) {
      return { label: 'Submitted', className: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300', icon: 'send' };
    }
    return { label: 'Not Submitted', className: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300', icon: 'radio_button_unchecked' };
  };

  const approvalSteps = (t: TaskDetail): { step1: ApprovalStep; step2: ApprovalStep; step3: ApprovalStep; line12: string; line23: string } => {
    const approvalStatus = (t.approvalStatus ?? '').trim();
    const submittedAt = t.technicianCompletedAt ?? t.completedAt;
    const isRejected = approvalStatus === 'Rejected' || Boolean(t.rejectedAt);
    const rejectedBySuperadmin = isRejected && Boolean(t.supervisorApprovedAt);

    const step1State: ApprovalStepState = submittedAt ? 'done' : 'pending';
    let step2State: ApprovalStepState = 'pending';
    let step3State: ApprovalStepState = 'pending';

    if (approvalStatus === 'PendingSupervisor') {
      step2State = 'current';
    } else if (approvalStatus === 'PendingSuperadmin') {
      step2State = 'done';
      step3State = 'current';
    } else if (approvalStatus === 'Approved') {
      step2State = 'done';
      step3State = 'done';
    } else if (isRejected) {
      if (rejectedBySuperadmin) {
        step2State = 'done';
        step3State = 'rejected';
      } else {
        step2State = 'rejected';
      }
    } else if (t.supervisorApprovedAt) {
      step2State = 'done';
    }

    const line12 = step1State === 'done' ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-800';
    const line23 = step2State === 'done' ? 'bg-primary' : step2State === 'rejected' || step3State === 'rejected' ? 'bg-rose-500' : 'bg-slate-200 dark:bg-slate-800';

    return {
      step1: {
        title: 'Submitted',
        state: step1State,
        meta: formatActorAt(t.technicianCompletedBy, submittedAt),
        icon: 'send',
      },
      step2: {
        title: 'Supervisor',
        state: step2State,
        meta: isRejected && !rejectedBySuperadmin ? formatActorAt(t.rejectedBy, t.rejectedAt) : formatActorAt(t.supervisorApprovedBy, t.supervisorApprovedAt),
        icon: step2State === 'rejected' ? 'cancel' : step2State === 'done' ? 'check' : 'assignment',
      },
      step3: {
        title: 'Superadmin',
        state: step3State,
        meta: isRejected && rejectedBySuperadmin ? formatActorAt(t.rejectedBy, t.rejectedAt) : formatActorAt(t.superadminApprovedBy, t.superadminApprovedAt),
        icon: step3State === 'rejected' ? 'cancel' : step3State === 'done' ? 'check' : 'shield',
      },
      line12,
      line23,
    };
  };

  const formatUploadedAt = (value: string): string => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  };

  const formatBytes = (value: number | null): string => {
    if (value === null) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i += 1;
    }
    const decimals = i === 0 ? 0 : 1;
    return `${size.toFixed(decimals)} ${units[i]}`;
  };

  const closePreview = (): void => {
    setPreviewOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFileName(null);
    setPreviewContentType(null);
    setPreviewScale(1);
    setPreviewTranslateX(0);
    setPreviewTranslateY(0);
    pointersRef.current.clear();
    panRef.current = null;
    pinchRef.current = null;
  };

  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

  const clampTranslation = (x: number, y: number, scale: number): { x: number; y: number } => {
    const el = previewViewportRef.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    const maxX = (rect.width * (scale - 1)) / 2;
    const maxY = (rect.height * (scale - 1)) / 2;
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  };

  const getTwoPointers = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
    const points = Array.from(pointersRef.current.values());
    if (points.length !== 2) return null;
    return [points[0], points[1]];
  };

  const onPreviewPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      panRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    }

    if (pointersRef.current.size === 2) {
      panRef.current = null;
      const pts = getTwoPointers();
      const viewport = previewViewportRef.current;
      if (!pts || !viewport) return;
      const rect = viewport.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchRef.current = {
        startDistance: Math.hypot(dx, dy),
        startScale: previewScale,
        startX: previewTranslateX,
        startY: previewTranslateY,
        centerX,
        centerY,
      };
    }
  };

  const onPreviewPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const pinch = pinchRef.current;
      const pts = getTwoPointers();
      if (!pinch || !pts) return;
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const distance = Math.hypot(dx, dy);
      const ratio = pinch.startDistance > 0 ? distance / pinch.startDistance : 1;
      const nextScale = clamp(pinch.startScale * ratio, 1, 4);

      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const relativeX = midX - pinch.centerX;
      const relativeY = midY - pinch.centerY;
      const scaleRatio = pinch.startScale > 0 ? nextScale / pinch.startScale : 1;
      const rawX = pinch.startX + relativeX * (1 - scaleRatio);
      const rawY = pinch.startY + relativeY * (1 - scaleRatio);
      const clamped = clampTranslation(rawX, rawY, nextScale);

      setPreviewScale(nextScale);
      setPreviewTranslateX(clamped.x);
      setPreviewTranslateY(clamped.y);
      return;
    }

    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    if (previewScale <= 1) {
      panRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
      return;
    }
    const dx = e.clientX - pan.lastX;
    const dy = e.clientY - pan.lastY;
    const rawX = previewTranslateX + dx;
    const rawY = previewTranslateY + dy;
    const clamped = clampTranslation(rawX, rawY, previewScale);
    setPreviewTranslateX(clamped.x);
    setPreviewTranslateY(clamped.y);
    panRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  };

  const onPreviewPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    pointersRef.current.delete(e.pointerId);
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  const openChecklistEvidence = async (e: TaskChecklistEvidence): Promise<void> => {
    const isInternal = e.uri === 'imported' || e.uri === 'stored' || e.uri === 'uploaded';
    if (!isInternal) {
      const target = e.uri.trim();
      if (target) window.open(target, '_blank', 'noreferrer');
      return;
    }

    setOpeningEvidenceId(e.id);
    setError(null);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewFileName(e.fileName);
    setPreviewContentType(e.contentType ?? null);
    setPreviewUrl(null);
    try {
      const downloaded = await apiDownloadChecklistEvidence({ checklistEvidenceId: e.id });
      const preferredType = downloaded.contentType ?? e.contentType ?? downloaded.blob.type;
      const blob = preferredType && downloaded.blob.type !== preferredType ? new Blob([downloaded.blob], { type: preferredType }) : downloaded.blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewFileName((prev) => prev ?? downloaded.fileName);
      setPreviewContentType((prev) => prev ?? preferredType ?? downloaded.contentType);
    } catch (err) {
      closePreview();
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to open attachment';
      setError(message);
    } finally {
      setOpeningEvidenceId(null);
      setPreviewLoading(false);
    }
  };

  const progress = useMemo(() => {
    if (!task) return 0;
    const total = task.checklistItems.filter((i) => i.isActive).length;
    const done = task.checklistItems.filter((i) => {
      if (!i.isActive) return false;
      const draft = checklistDraft[i.id];
      return draft !== undefined && draft.outcome !== null;
    }).length;
    if (!total) return 0;
    return Math.round((done / total) * 100);
  }, [task, checklistDraft]);

  const statusLower = (task?.status ?? '').toLowerCase();
  const approvalStatus = (task?.approvalStatus ?? '').trim();
  const isApprovalLocked = approvalStatus === 'PendingSupervisor' || approvalStatus === 'PendingSuperadmin' || approvalStatus === 'Approved';
  const roles = user?.roles ?? [];
  const isSuperadmin = roles.includes('Superadmin');
  const isManager = roles.includes('Supervisor') || roles.includes('Admin') || roles.includes('Superadmin');
  const canAssign = isManager;
  const canEditChecklist =
    ((!isManager && !isApprovalLocked) || (isSuperadmin && approvalStatus === 'PendingSuperadmin')) &&
    statusLower !== 'completed' &&
    statusLower !== 'cancelled';
  const canStart = statusLower === 'open' && !isApprovalLocked;
  const canPause = statusLower === 'in_progress' && !isApprovalLocked;
  const canResume = statusLower === 'paused' && !isApprovalLocked;

  const canReview = useMemo(() => {
    if (approvalStatus === 'PendingSupervisor') {
      return roles.includes('Supervisor') || roles.includes('Admin') || roles.includes('Superadmin');
    }
    if (approvalStatus === 'PendingSuperadmin') {
      return roles.includes('Superadmin');
    }
    return false;
  }, [approvalStatus, roles]);

  const canSubmitForApproval = Boolean(task) && !isManager && !isApprovalLocked && statusLower === 'in_progress';

  const onApprove = async (): Promise<void> => {
    if (!task) return;
    if (!canReview) return;
    setApprovalActionLoading(true);
    setError(null);
    try {
      if (approvalStatus === 'PendingSupervisor') {
        await apiApproveTaskBySupervisor(task.id);
      } else if (approvalStatus === 'PendingSuperadmin') {
        await apiApproveTaskBySuperadmin(task.id);
      }
      const refreshed = await apiGetTask(task.id);
      setTask(refreshed);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to approve';
      setError(message);
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const onReject = async (): Promise<void> => {
    if (!task) return;
    if (!canReview) return;
    setApprovalActionLoading(true);
    setError(null);
    try {
      await apiRejectTaskApproval({ taskId: task.id, reason: rejectReason.trim() ? rejectReason.trim() : undefined, reopenTask: rejectReopenTask });
      setRejectOpen(false);
      setRejectReason('');
      setRejectReopenTask(false);
      const refreshed = await apiGetTask(task.id);
      setTask(refreshed);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to reject';
      setError(message);
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const onRevise = async (): Promise<void> => {
    if (!task) return;
    if (!canReview) return;
    setApprovalActionLoading(true);
    setError(null);
    try {
      await apiReviseTaskApproval({
        taskId: task.id,
        reason: reviseReason.trim() ? reviseReason.trim() : undefined,
        reopenTask: reviseReopenTask,
      });
      setReviseOpen(false);
      setReviseReason('');
      setReviseReopenTask(true);
      const refreshed = await apiGetTask(task.id);
      setTask(refreshed);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to revise';
      setError(message);
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const assignedLabel = task?.assignedTo.displayName ?? task?.assignedTo.roleName ?? 'Unassigned';
  const assignButtonLabel = task?.assignedTo.userId || task?.assignedTo.roleId ? 'Reassign' : 'Assign';
  const pendingSyncCount = useMemo(() => getPendingMutationCount() + getPendingEvidenceCount(), [syncTick]);
  const queuedTaskEvidenceCount = useMemo(() => (task ? getQueuedTaskEvidenceCount(task.id) : 0), [task?.id, syncTick]);
  const draftSavedLabel = useMemo(() => {
    if (!draftSavedAt) return null;
    const d = new Date(draftSavedAt);
    if (Number.isNaN(d.getTime())) return draftSavedAt;
    return d.toLocaleString();
  }, [draftSavedAt]);

  const openAssign = (): void => {
    if (!task) return;
    if (task.assignedTo.userId) {
      setAssignMode('user');
      setAssignUserId(task.assignedTo.userId);
      setAssignRoleId('');
    } else if (task.assignedTo.roleId) {
      setAssignMode('role');
      setAssignRoleId(task.assignedTo.roleId);
      setAssignUserId('');
    } else {
      setAssignMode('unassigned');
      setAssignUserId('');
      setAssignRoleId('');
    }
    setAssignError(null);
    setAssignOpen(true);
  };

  const sortedAssignUsers = useMemo(() => {
    return assignUsers
      .slice()
      .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));
  }, [assignUsers]);

  const sortedAssignRoles = useMemo(() => {
    return assignRoles.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [assignRoles]);

  const onAssign = async (): Promise<void> => {
    if (!task) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      if (assignMode === 'user') {
        if (!assignUserId) throw new Error('Select technician');
        await apiAssignTask({ taskId: task.id, assignedToUserId: assignUserId, assignedToRoleId: null });
      } else if (assignMode === 'role') {
        if (!assignRoleId) throw new Error('Select role');
        await apiAssignTask({ taskId: task.id, assignedToRoleId: assignRoleId, assignedToUserId: null });
      } else {
        await apiAssignTask({ taskId: task.id, assignedToUserId: null, assignedToRoleId: null });
      }
      const refreshed = await apiGetTask(task.id);
      setTask(refreshed);
      setAssignOpen(false);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to assign';
      setAssignError(message);
    } finally {
      setAssignLoading(false);
    }
  };

  const buildChecklistResults = (): CompleteTaskChecklistResultInput[] => {
    const items = task?.checklistItems ?? [];
    const results: CompleteTaskChecklistResultInput[] = [];
    for (const item of items) {
      if (!item.isActive) continue;
      const draft = checklistDraft[item.id];
      const outcome = draft?.outcome ?? null;
      if (outcome === null) {
        if (item.isMandatory) throw new Error('Missing outcome for a mandatory checklist item');
        continue;
      }

      if (!item.requiresPassFail && outcome === 2) throw new Error('Invalid outcome for this checklist item');
      if (item.isMandatory && outcome === 0) throw new Error('Mandatory checklist items cannot be skipped');

      const notesValue = draft?.notes ?? '';
      const notesRequired = item.requiresNotes || item.isMandatory;
      if (notesRequired && outcome !== 0 && notesValue.trim().length === 0) {
        throw new Error('Notes are required for this checklist item');
      }

      if (item.enableAttachment && item.requiresAttachment && outcome !== 0 && item.evidence.length === 0) {
        throw new Error('Attachment is required for this checklist item');
      }

      results.push({
        templateChecklistItemId: item.id,
        outcome,
        notes: notesValue.trim() ? notesValue.trim() : null,
      });
    }
    return results;
  };

  const onStart = async (): Promise<void> => {
    if (!task) return;
    setActionLoading(true);
    try {
      const started = await apiStartTask(task.id);
      if (started.queued) {
        setSuccess('Queued. Will sync when online.');
        setTask((prev) => (prev ? { ...prev, status: 'in_progress' } : prev));
        setSyncTick((v) => v + 1);
        return;
      }
      const res = await apiGetTask(task.id);
      setTask(res);
    } catch {
      setError('Failed to start');
    } finally {
      setActionLoading(false);
    }
  };

  const onPause = async (): Promise<void> => {
    if (!task) return;
    if (!canPause) return;
    setActionLoading(true);
    try {
      const paused = await apiPauseTask(task.id);
      if (paused.queued) {
        setSuccess('Queued. Will sync when online.');
        setTask((prev) => (prev ? { ...prev, status: 'paused' } : prev));
        setSyncTick((v) => v + 1);
        return;
      }
      const res = await apiGetTask(task.id);
      setTask(res);
    } catch {
      setError('Failed to pause');
    } finally {
      setActionLoading(false);
    }
  };

  const onResume = async (): Promise<void> => {
    if (!task) return;
    if (!canResume) return;
    setActionLoading(true);
    try {
      const resumed = await apiResumeTask(task.id);
      if (resumed.queued) {
        setSuccess('Queued. Will sync when online.');
        setTask((prev) => (prev ? { ...prev, status: 'in_progress' } : prev));
        setSyncTick((v) => v + 1);
        return;
      }
      const res = await apiGetTask(task.id);
      setTask(res);
    } catch {
      setError('Failed to resume');
    } finally {
      setActionLoading(false);
    }
  };

  const onSubmitForApproval = async (): Promise<void> => {
    if (!task) return;
    if (!canSubmitForApproval) {
      setError('Resume task before submitting for approval');
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const checklistResults = buildChecklistResults();
      const submitted = await apiSubmitTaskForApproval({ taskId: task.id, checklistResults });
      if (submitted.queued) {
        setSuccess('Queued. Will submit when online.');
        setSyncTick((v) => v + 1);
        return;
      }
      const res = await apiGetTask(task.id);
      setTask(res);

      const nextApprovalStatus = (res.approvalStatus ?? '').trim();
      if (nextApprovalStatus === 'PendingSupervisor') {
        setSuccess('Submitted successfully. Waiting for supervisor review.');
      } else if (nextApprovalStatus === 'PendingSuperadmin') {
        setSuccess('Submitted successfully. Waiting for superadmin review.');
      } else if (nextApprovalStatus === 'Approved') {
        setSuccess('Submitted successfully. Task is approved.');
      } else {
        setSuccess('Submitted successfully.');
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to submit';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const onSaveSuperadminEdits = async (): Promise<void> => {
    if (!task) return;
    if (!isSuperadmin) return;
    setActionLoading(true);
    try {
      const checklistResults = buildChecklistResults();
      await apiSuperadminUpdateTaskChecklist({ taskId: task.id, checklistResults });
      const res = await apiGetTask(task.id);
      setTask(res);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to save';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const onToggleExpand = (itemId: string): void => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  };

  const setOutcome = (itemId: string, outcome: 0 | 1 | 2 | null): void => {
    if (!canEditChecklist) return;
    setChecklistDraft((prev) => ({ ...prev, [itemId]: { outcome, notes: prev[itemId]?.notes ?? '' } }));
  };

  const setNotes = (itemId: string, notes: string): void => {
    if (!canEditChecklist) return;
    setChecklistDraft((prev) => ({ ...prev, [itemId]: { outcome: prev[itemId]?.outcome ?? null, notes } }));
  };

  const triggerChecklistUpload = (itemId: string): void => {
    if (!canEditChecklist) return;
    checklistUploadItemIdRef.current = itemId;
    checklistFileInputRef.current?.click();
  };

  const triggerChecklistPhotoCapture = (itemId: string): void => {
    if (!canEditChecklist) return;
    checklistUploadItemIdRef.current = itemId;
    checklistPhotoInputRef.current?.click();
  };

  const triggerChecklistVideoCapture = (itemId: string): void => {
    if (!canEditChecklist) return;
    checklistUploadItemIdRef.current = itemId;
    checklistVideoInputRef.current?.click();
  };

  const triggerTaskUpload = (): void => {
    if (!canEditChecklist) return;
    taskFileInputRef.current?.click();
  };

  const onChecklistFileSelected = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const itemId = checklistUploadItemIdRef.current;
    if (!file || !task || !itemId) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await apiUploadTaskChecklistEvidenceFile({ taskId: task.id, templateChecklistItemId: itemId, file });
      if (uploaded.queued) {
        setSuccess('Attachment queued. Will upload when online.');
        setSyncTick((v) => v + 1);
        return;
      }
      const res = await apiGetTask(task.id);
      setTask(res);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const onChecklistPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const itemId = checklistUploadItemIdRef.current;
    if (!file || !task || !itemId) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await apiUploadTaskChecklistEvidenceFile({ taskId: task.id, templateChecklistItemId: itemId, file });
      if (uploaded.queued) {
        setSuccess('Attachment queued. Will upload when online.');
        setSyncTick((v) => v + 1);
        return;
      }
      const res = await apiGetTask(task.id);
      setTask(res);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const onChecklistVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const itemId = checklistUploadItemIdRef.current;
    if (!file || !task || !itemId) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await apiUploadTaskChecklistEvidenceFile({ taskId: task.id, templateChecklistItemId: itemId, file });
      if (uploaded.queued) {
        setSuccess('Attachment queued. Will upload when online.');
        setSyncTick((v) => v + 1);
        return;
      }
      const res = await apiGetTask(task.id);
      setTask(res);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const onTaskFileSelected = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !task) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await apiUploadTaskEvidenceFile({ taskId: task.id, file });
      if (uploaded.queued) {
        setSuccess('Attachment queued. Will upload when online.');
        setSyncTick((v) => v + 1);
        return;
      }
      const res = await apiGetTask(task.id);
      setTask(res);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 p-4">
            <button onClick={() => navigate(-1)} className="flex items-center justify-center size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <span className="material-symbols-outlined text-slate-700 dark:text-slate-300">arrow_back_ios_new</span>
            </button>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Task</h1>
          </div>
        </header>
        <main className="p-4 text-sm text-slate-500 dark:text-slate-400">{error ?? 'Not found'}</main>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex flex-col font-display">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="flex items-center justify-center size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <span className="material-symbols-outlined text-slate-700 dark:text-slate-300">arrow_back_ios_new</span>
            </button>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{task.taskNumber}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined ${
                !online ? 'text-amber-600 dark:text-amber-300' : pendingSyncCount > 0 ? 'text-primary' : 'text-emerald-500'
              }`}
              title={pendingSyncCount > 0 ? `${pendingSyncCount} item(s) pending sync` : online ? 'All synced' : 'Offline'}
              aria-label={pendingSyncCount > 0 ? `${pendingSyncCount} item(s) pending sync` : online ? 'All synced' : 'Offline'}
            >
              {!online ? 'cloud_off' : pendingSyncCount > 0 ? 'cloud_upload' : 'cloud_done'}
            </span>
            <button className="flex items-center justify-center size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <span className="material-symbols-outlined text-slate-700 dark:text-slate-300">more_vert</span>
            </button>
          </div>
        </div>
        <div className="px-4 pb-3 flex gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            {task.status}
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 uppercase tracking-wider">
            Priority: {task.priority}
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
            {assignedLabel}
          </span>
          {queuedTaskEvidenceCount > 0 ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              Queued attachments: {queuedTaskEvidenceCount}
            </span>
          ) : null}
          {canAssign ? (
            <button
              type="button"
              onClick={openAssign}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
            >
              {assignButtonLabel}
            </button>
          ) : null}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-48">
        {error && (
          <section className="px-4 pt-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          </section>
        )}
        {success ? (
          <section className="px-4 pt-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900 p-3 text-sm text-emerald-800 dark:text-emerald-200">
              {success}
            </div>
          </section>
        ) : null}
        {task.approvalStatus === 'Rejected' ? (
          <section className="px-4 pt-4">
            <div className="bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900 p-3">
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wider">Rejected</p>
              <p className="mt-1 text-sm text-rose-900 dark:text-rose-100">{task.rejectionReason ?? 'No reason provided.'}</p>
              {task.rejectedAt ? (
                <p className="mt-2 text-xs text-rose-700/80 dark:text-rose-200/80">
                  {task.rejectedBy?.displayName ?? task.rejectedBy?.username ?? 'Reviewer'} • {formatDueAt(task.rejectedAt)}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
        {task.revisionNote ? (
          <section className="px-4 pt-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900 p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Correction Note</p>
              <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">{task.revisionNote}</p>
              {task.revisedAt ? (
                <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-200/80">
                  {task.revisedBy?.displayName ?? task.revisedBy?.username ?? 'Reviewer'} • {formatDueAt(task.revisedAt)}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
        <section className="p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="relative h-48 w-full bg-white dark:bg-white">
              {assetImageUrl ? (
                <img alt="Asset" className="w-full h-full object-contain" src={assetImageUrl} />
              ) : (
                <div className="w-full h-full bg-white flex items-center justify-center">
                  <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-4xl">photo</span>
                </div>
              )}
              <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-lg text-xs font-medium">
                Asset: {task.asset.assetTag}
              </div>
            </div>
            <div className="p-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                <button
                  type="button"
                  onClick={() => navigate(`/asset/${encodeURIComponent(task.asset.id)}`)}
                  className="w-full text-left underline decoration-slate-300 dark:decoration-slate-700 underline-offset-4 transition-opacity active:opacity-70"
                  aria-label="Open asset details"
                >
                  {task.asset.name}
                </button>
              </h2>
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <span className="material-symbols-outlined text-sm">location_on</span>
                  <span className="text-sm">{task.facility?.name ?? ''}</span>
                </div>
                {assetNotes ? (
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                    <span className="material-symbols-outlined text-sm mt-0.5">description</span>
                    <span className="text-sm whitespace-pre-wrap break-words">{assetNotes}</span>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <span className="material-symbols-outlined text-sm">history</span>
                  <span className="text-sm">Scheduled: {formatDueAt(task.scheduledDueAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-900 dark:text-white uppercase text-xs tracking-widest">Task Completion</h3>
            <span className="text-sm font-bold text-primary">{progress}%</span>
          </div>
          <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
          </div>
        </section>

        <section className="px-4 pt-6">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4">Maintenance Steps</h3>
          <div className="space-y-3">
            {task.checklistItems.length > 0 ? (
              task.checklistItems
                .filter((i) => i.isActive)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((item) => {
                  const draft = checklistDraft[item.id];
                  const outcome = draft?.outcome ?? null;
                  const isExpanded = expandedItemId === item.id;
                  const isDone = outcome !== null;
                  const isSkipped = outcome === 0;
                  const badge = item.isMandatory ? 'Required' : 'Optional';
                  const hasAttachment = item.enableAttachment;

                  return (
                    <div key={item.id} className={`rounded-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ${isDone ? 'opacity-90' : ''}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onToggleExpand(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onToggleExpand(item.id);
                          }
                        }}
                        className="w-full flex items-center gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                        aria-expanded={isExpanded}
                      >
                        <div className="relative flex items-center">
                          <button
                            type="button"
                            disabled={!canEditChecklist}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (outcome === null) setOutcome(item.id, item.requiresPassFail ? 1 : 1);
                              else setOutcome(item.id, null);
                            }}
                            className={`size-7 rounded-full border flex items-center justify-center ${isDone && !isSkipped ? 'bg-primary border-primary text-white' : isSkipped ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500' : 'border-slate-300 dark:border-slate-700'}`}
                          >
                            {isDone && !isSkipped ? <span className="material-symbols-outlined text-base">check</span> : null}
                            {isSkipped ? <span className="material-symbols-outlined text-base">remove</span> : null}
                          </button>
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-medium ${isDone ? 'text-slate-700 dark:text-slate-200' : 'text-slate-900 dark:text-white'}`}>{item.itemText}</p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold uppercase">{badge}</span>
                          </div>
                          {item.requiresNotes || item.requiresAttachment ? (
                            <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                              {item.requiresNotes ? 'Notes required' : ''}{item.requiresNotes && item.requiresAttachment ? ' • ' : ''}{item.requiresAttachment ? 'Attachment required' : ''}
                            </div>
                          ) : null}
                        </div>
                        {hasAttachment ? (
                          <button
                            type="button"
                            disabled={uploading || !canEditChecklist}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerChecklistUpload(item.id);
                            }}
                            className="size-10 rounded-full flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800"
                            aria-label="Attach file"
                          >
                            <span className="material-symbols-outlined text-slate-500">attach_file</span>
                          </button>
                        ) : null}
                      </div>

                      {isExpanded ? (
                        <div className="px-4 pb-4 space-y-3">
                          <div className="flex gap-2">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Outcome</label>
                          </div>
                          <select
                            value={outcome === null ? '' : String(outcome)}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') setOutcome(item.id, null);
                              else setOutcome(item.id, Number(v) as 0 | 1 | 2);
                            }}
                            className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                            disabled={!canEditChecklist}
                          >
                            <option value="">Not set</option>
                            <option value="1">{item.requiresPassFail ? 'Pass' : 'Done'}</option>
                            {item.requiresPassFail ? <option value="2">Fail</option> : null}
                            {!item.isMandatory ? <option value="0">Skip</option> : null}
                          </select>

                          <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Notes</label>
                            <textarea
                              value={draft?.notes ?? ''}
                              onChange={(e) => setNotes(item.id, e.target.value)}
                              className="mt-2 w-full min-h-[72px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                              placeholder={item.requiresNotes || item.isMandatory ? 'Required notes…' : 'Optional notes…'}
                              disabled={!canEditChecklist}
                            />
                          </div>

                          {item.enableAttachment || item.evidence.length > 0 ? (
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Evidence</div>
                                {item.enableAttachment && canEditChecklist ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={uploading}
                                      onClick={() => triggerChecklistUpload(item.id)}
                                      className="h-8 px-3 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 disabled:opacity-60"
                                    >
                                      <span className="material-symbols-outlined text-sm">attach_file</span>
                                      File
                                    </button>
                                    <button
                                      type="button"
                                      disabled={uploading}
                                      onClick={() => triggerChecklistPhotoCapture(item.id)}
                                      className="h-8 px-3 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 disabled:opacity-60"
                                    >
                                      <span className="material-symbols-outlined text-sm">photo_camera</span>
                                      Photo
                                    </button>
                                    <button
                                      type="button"
                                      disabled={uploading}
                                      onClick={() => triggerChecklistVideoCapture(item.id)}
                                      className="h-8 px-3 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 disabled:opacity-60"
                                    >
                                      <span className="material-symbols-outlined text-sm">videocam</span>
                                      Video
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-2 space-y-2">
                                {getQueuedChecklistEvidenceCount(task.id, item.id) > 0 ? (
                                  <div className="text-xs text-primary">
                                    Queued locally: {getQueuedChecklistEvidenceCount(task.id, item.id)}
                                  </div>
                                ) : null}
                                {item.evidence.length === 0 ? (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">No evidence uploaded.</div>
                                ) : (
                                  item.evidence.map((e) => (
                                    <button
                                      key={e.id}
                                      type="button"
                                      onClick={() => void openChecklistEvidence(e)}
                                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left active:bg-slate-50 dark:active:bg-slate-700"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                            {e.fileName ?? 'Attachment'}
                                          </div>
                                          <div className="text-xs text-slate-500 dark:text-slate-400">
                                            {formatBytes(e.sizeBytes)} · {formatUploadedAt(e.uploadedAt)}
                                          </div>
                                        </div>
                                        {openingEvidenceId === e.id ? (
                                          <span className="material-symbols-outlined text-slate-500">progress_activity</span>
                                        ) : (
                                          <span className="material-symbols-outlined text-slate-500">open_in_new</span>
                                        )}
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
            ) : (
              <div className="text-sm text-slate-500 dark:text-slate-400">No checklist items</div>
            )}
          </div>
        </section>

        <section className="px-4 pt-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
            {(() => {
              const summary = approvalSummary(task);
              const flow = approvalSteps(task);
              const stepCircleClass = (state: ApprovalStepState): string => {
                if (state === 'done') return 'bg-primary text-white border-primary';
                if (state === 'current') return 'bg-white dark:bg-slate-900 text-primary border-primary';
                if (state === 'rejected') return 'bg-rose-600 text-white border-rose-600';
                return 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700';
              };

              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Approval</p>
                      <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Flow</p>
                    </div>
                    <span className={`${summary.className} inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full`}>
                      <span className="material-symbols-outlined text-[12px] leading-none">{summary.icon}</span>
                      {summary.label}
                    </span>
                  </div>

                  <div className="mt-4 flex items-start">
                    <div className="w-1/3 flex flex-col items-center text-center">
                      <div className={`size-10 rounded-full border flex items-center justify-center ${stepCircleClass(flow.step1.state)}`}>
                        <span className="material-symbols-outlined text-[18px]">{flow.step1.icon}</span>
                      </div>
                      <div className="mt-2 text-xs font-semibold text-slate-900 dark:text-white">{flow.step1.title}</div>
                      {flow.step1.meta ? <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{flow.step1.meta}</div> : null}
                    </div>

                    <div className={`mt-5 h-0.5 flex-1 ${flow.line12}`} />

                    <div className="w-1/3 flex flex-col items-center text-center">
                      <div className={`size-10 rounded-full border flex items-center justify-center ${stepCircleClass(flow.step2.state)}`}>
                        <span className="material-symbols-outlined text-[18px]">{flow.step2.icon}</span>
                      </div>
                      <div className="mt-2 text-xs font-semibold text-slate-900 dark:text-white">{flow.step2.title}</div>
                      {flow.step2.meta ? <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{flow.step2.meta}</div> : null}
                    </div>

                    <div className={`mt-5 h-0.5 flex-1 ${flow.line23}`} />

                    <div className="w-1/3 flex flex-col items-center text-center">
                      <div className={`size-10 rounded-full border flex items-center justify-center ${stepCircleClass(flow.step3.state)}`}>
                        <span className="material-symbols-outlined text-[18px]">{flow.step3.icon}</span>
                      </div>
                      <div className="mt-2 text-xs font-semibold text-slate-900 dark:text-white">{flow.step3.title}</div>
                      {flow.step3.meta ? <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{flow.step3.meta}</div> : null}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </section>
      </main>

      {assignOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setAssignOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="absolute inset-x-0 bottom-0 bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 p-4 pb-8">
            <div className="max-w-screen-sm mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assign Task</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{task.taskNumber}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">close</span>
                </button>
              </div>

              {assignError ? (
                <div className="bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900 p-3 text-sm text-rose-700 dark:text-rose-300">
                  {assignError}
                </div>
              ) : null}

              {assignOptionsLoading ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">Loading assignees…</div>
              ) : null}

              <div className="grid grid-cols-12 gap-2">
                <label className="col-span-12 md:col-span-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="assign-mode"
                    value="user"
                    checked={assignMode === 'user'}
                    onChange={() => setAssignMode('user')}
                    className="size-4"
                  />
                  User
                </label>
                <label className="col-span-12 md:col-span-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="assign-mode"
                    value="role"
                    checked={assignMode === 'role'}
                    onChange={() => setAssignMode('role')}
                    className="size-4"
                  />
                  Role
                </label>
                <label className="col-span-12 md:col-span-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="assign-mode"
                    value="unassigned"
                    checked={assignMode === 'unassigned'}
                    onChange={() => setAssignMode('unassigned')}
                    className="size-4"
                  />
                  Unassign
                </label>
              </div>

              {assignMode === 'user' ? (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Technician</label>
                  <select
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    className="mt-2 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                    disabled={assignOptionsLoading}
                  >
                    <option value="">Select technician</option>
                    {sortedAssignUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName ?? u.username}
                      </option>
                    ))}
                  </select>
                </div>
              ) : assignMode === 'role' ? (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Role</label>
                  <select
                    value={assignRoleId}
                    onChange={(e) => setAssignRoleId(e.target.value)}
                    className="mt-2 w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                    disabled={assignOptionsLoading}
                  >
                    <option value="">Select role</option>
                    {sortedAssignRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={assignLoading}
                  onClick={() => setAssignOpen(false)}
                  className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={assignLoading || assignOptionsLoading}
                  onClick={() => void onAssign()}
                  className="flex-1 h-12 rounded-xl bg-primary text-white font-bold disabled:opacity-60"
                >
                  {assignButtonLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen ? (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Attachment</p>
              <p className="text-sm font-bold text-white truncate">{previewFileName ?? 'Preview'}</p>
            </div>
            <button
              type="button"
              onClick={closePreview}
              className="size-10 rounded-full hover:bg-white/10 flex items-center justify-center"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-white">close</span>
            </button>
          </div>

          <div className="flex-1 p-3">
            <div className="h-full w-full rounded-xl overflow-hidden bg-black">
              {previewLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-white/70">Loading…</div>
              ) : !previewUrl ? (
                <div className="h-full flex items-center justify-center text-sm text-white/70">Preview not available.</div>
              ) : (previewContentType ?? '').includes('pdf') || (previewFileName ?? '').toLowerCase().endsWith('.pdf') ? (
                <iframe title={previewFileName ?? 'Preview'} src={previewUrl} className="w-full h-full bg-white" />
              ) : (previewContentType ?? '').startsWith('image/') || (previewFileName ?? '').toLowerCase().match(/\.(png|jpg|jpeg)$/) ? (
                <div
                  ref={previewViewportRef}
                  className="h-full w-full overflow-hidden bg-black flex items-center justify-center"
                  style={{ touchAction: 'none' }}
                  onPointerDown={onPreviewPointerDown}
                  onPointerMove={onPreviewPointerMove}
                  onPointerUp={onPreviewPointerUp}
                  onPointerCancel={onPreviewPointerUp}
                >
                  <img
                    src={previewUrl}
                    alt={previewFileName ?? 'Attachment'}
                    draggable={false}
                    className="max-h-full max-w-full select-none"
                    style={{
                      transform: `translate(${previewTranslateX}px, ${previewTranslateY}px) scale(${previewScale})`,
                      transformOrigin: 'center center',
                      willChange: 'transform',
                    }}
                  />
                </div>
              ) : (previewContentType ?? '').startsWith('video/') || (previewFileName ?? '').toLowerCase().match(/\.(mp4|mov|m4v)$/) ? (
                <video src={previewUrl} controls className="w-full h-full" />
              ) : (previewContentType ?? '').startsWith('audio/') || (previewFileName ?? '').toLowerCase().match(/\.(mp3|wav|m4a)$/) ? (
                <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-6">
                  <div className="text-xs text-white/70 truncate w-full text-center">{previewFileName ?? 'Audio'}</div>
                  <audio src={previewUrl} controls className="w-full" />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-white/70">Preview not available.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setRejectOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="absolute inset-x-0 bottom-0 bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 p-4 pb-8">
            <div className="max-w-screen-sm mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reject Approval</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{task.taskNumber}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectOpen(false)}
                  className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">close</span>
                </button>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Reason (optional)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="mt-2 w-full min-h-[96px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                  placeholder="Add rejection reason…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={rejectReopenTask}
                  onChange={(e) => setRejectReopenTask(e.target.checked)}
                  className="size-4"
                />
                Reopen task after rejection
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() => setRejectOpen(false)}
                  className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() => void onReject()}
                  className="flex-1 h-12 rounded-xl bg-rose-600 text-white font-bold disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reviseOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setReviseOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="absolute inset-x-0 bottom-0 bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 p-4 pb-8">
            <div className="max-w-screen-sm mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Revise Approval</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{task.taskNumber}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviseOpen(false)}
                  className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">close</span>
                </button>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Correction note (optional)</label>
                <textarea
                  value={reviseReason}
                  onChange={(e) => setReviseReason(e.target.value)}
                  className="mt-2 w-full min-h-[96px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                  placeholder="Describe what needs to be corrected…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={reviseReopenTask}
                  onChange={(e) => setReviseReopenTask(e.target.checked)}
                  className="size-4"
                />
                Reopen task for technician edits
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() => setReviseOpen(false)}
                  className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() => void onRevise()}
                  className="flex-1 h-12 rounded-xl bg-amber-600 text-white font-bold disabled:opacity-60"
                >
                  Revise
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Action Buttons */}
      <input ref={checklistFileInputRef} type="file" className="hidden" onChange={onChecklistFileSelected} />
      <input ref={checklistPhotoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onChecklistPhotoSelected} />
      <input ref={checklistVideoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={onChecklistVideoSelected} />
      <input ref={taskFileInputRef} type="file" className="hidden" onChange={onTaskFileSelected} />

      <div className="fixed bottom-32 right-4 flex flex-col gap-3 z-40">
        <button className="size-14 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 active:scale-95 transition-transform">
          <span className="material-symbols-outlined">add_comment</span>
        </button>
        <button disabled={uploading || !canEditChecklist} onClick={triggerTaskUpload} className="size-14 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 active:scale-95 transition-transform">
          <span className="material-symbols-outlined">attach_file</span>
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-50">
        <div className="bg-white/90 dark:bg-background-dark/90 ios-bottom-blur border-t border-slate-200 dark:border-slate-800 p-4 pb-8">
          <div className="max-w-screen-sm mx-auto">
            {canReview ? (
              <div className="grid grid-cols-12 gap-3">
                {isSuperadmin && approvalStatus === 'PendingSuperadmin' ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void onSaveSuperadminEdits()}
                    className="col-span-4 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 disabled:opacity-60"
                  >
                    Save
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() => setReviseOpen(true)}
                  className={`${isSuperadmin && approvalStatus === 'PendingSuperadmin' ? 'col-span-4' : 'col-span-6'} h-12 rounded-xl border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 font-bold`}
                >
                  Revise
                </button>
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() => setRejectOpen(true)}
                  className={`${isSuperadmin && approvalStatus === 'PendingSuperadmin' ? 'col-span-4' : 'col-span-6'} h-12 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 font-bold`}
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={approvalActionLoading}
                  onClick={() => void onApprove()}
                  className="col-span-12 h-12 rounded-xl bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  Approve
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-3">
                {canStart ? (
                  <button
                    disabled={actionLoading}
                    onClick={onStart}
                    className="col-span-3 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">play_arrow</span>
                    Start
                  </button>
                ) : canResume ? (
                  <button
                    disabled={actionLoading}
                    onClick={onResume}
                    className="col-span-3 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">play_arrow</span>
                    Resume
                  </button>
                ) : (
                  <button
                    disabled={actionLoading || !canPause}
                    onClick={onPause}
                    className="col-span-3 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xl">pause</span>
                    Pause
                  </button>
                )}

                <button
                  disabled={actionLoading || !canEditChecklist}
                  onClick={onSaveDraft}
                  className="col-span-3 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 active:bg-slate-50 dark:active:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-xl">{draftSaveFlash ? 'check' : 'save'}</span>
                  {draftSaveFlash ? 'Saved' : 'Save'}
                </button>

                <button
                  disabled={actionLoading || !canSubmitForApproval}
                  onClick={() => void onSubmitForApproval()}
                  className="col-span-6 h-12 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-xl">send</span>
                  Submit for approval
                </button>

                <div
                  className="col-span-12 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1"
                  aria-live="polite"
                >
                  <span className={draftSaveNotice ? 'text-emerald-600 dark:text-emerald-300 font-semibold' : ''}>
                    {draftSaveNotice ?? (draftSavedLabel ? `Saved locally: ${draftSavedLabel}` : 'Draft not saved yet')}
                  </span>
                  <span>{!canEditChecklist ? 'Read-only' : 'Local-only draft'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetail;
