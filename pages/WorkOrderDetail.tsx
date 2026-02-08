import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  apiAssignWorkOrder,
  apiApproveTaskBySupervisor,
  apiApproveTaskBySuperadmin,
  apiCancelWorkOrder,
  apiCloseDowntime,
  apiCompleteWorkOrder,
  apiGetLookups,
  apiGetTask,
  apiGetWorkOrder,
  apiListAssignableUsers,
  apiPauseWorkOrder,
  apiRejectTaskApproval,
  apiResumeWorkOrder,
  apiStartWorkOrder,
  apiUploadTaskChecklistEvidenceFile,
  apiUploadTaskEvidenceFile,
  type CompleteTaskChecklistResultInput,
  type LookupRole,
  type TaskDetail,
  type UserSummary,
  type WorkOrderDetail,
} from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

const formatDateTime = (value: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};

const WorkOrderDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const workOrderId = params.id as string;
  const { user } = useAuth();
  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReopenTask, setRejectReopenTask] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'user' | 'role' | 'unassigned'>('user');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignUsers, setAssignUsers] = useState<UserSummary[]>([]);
  const [assignRoles, setAssignRoles] = useState<LookupRole[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignOptionsLoading, setAssignOptionsLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [checklistDraft, setChecklistDraft] = useState<Record<string, { outcome: 0 | 1 | 2 | null; notes: string }>>({});
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const checklistUploadItemIdRef = useRef<string | null>(null);
  const checklistFileInputRef = useRef<HTMLInputElement | null>(null);
  const taskFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDetail = async (): Promise<void> => {
    if (!workOrderId) return;
    setLoading(true);
    setError(null);
    try {
      const [wo, td] = await Promise.all([apiGetWorkOrder(workOrderId), apiGetTask(workOrderId)]);
      setWorkOrder(wo);
      setTask(td);
    } catch {
      setError('Failed to load work order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [workOrderId]);

  useEffect(() => {
    if (!task) return;
    const next: Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> = {};
    for (const item of task.checklistItems) {
      const outcome = item.result ? item.result.outcome : null;
      const notes = item.result?.notes ?? '';
      next[item.id] = { outcome, notes };
    }
    setChecklistDraft(next);
  }, [task?.id]);

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

  const statusLower = (workOrder?.status ?? '').toLowerCase();
  const approvalStatus = (task?.approvalStatus ?? '').trim();
  const isApprovalLocked = approvalStatus === 'PendingSupervisor' || approvalStatus === 'PendingSuperadmin' || approvalStatus === 'Approved';
  const roles = user?.roles ?? [];
  const canStart = !isApprovalLocked && statusLower === 'open';
  const canPause = !isApprovalLocked && statusLower === 'in_progress';
  const canResume = !isApprovalLocked && statusLower === 'paused';
  const canComplete = !isApprovalLocked && statusLower !== 'completed' && statusLower !== 'cancelled';
  const canCancel = !isApprovalLocked && statusLower !== 'completed' && statusLower !== 'cancelled';
  const canCloseDowntime = Boolean(workOrder?.downtimeStartedAt && !workOrder?.downtimeEndedAt);
  const canAssign = roles.includes('Supervisor') || roles.includes('Admin') || roles.includes('Superadmin');

  const canReview = useMemo(() => {
    if (approvalStatus === 'PendingSupervisor') {
      return roles.includes('Supervisor') || roles.includes('Admin') || roles.includes('Superadmin');
    }
    if (approvalStatus === 'PendingSuperadmin') {
      return roles.includes('Superadmin');
    }
    return false;
  }, [approvalStatus, user?.roles]);

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
      await loadDetail();
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
      await loadDetail();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to reject';
      setError(message);
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const subject = useMemo(() => {
    if (!workOrder) return '';
    const label = workOrder.asset?.assetTag ?? workOrder.asset?.name ?? workOrder.facility?.name ?? '';
    const symptom = workOrder.symptom ?? '';
    if (label && symptom) return `${label} — ${symptom}`;
    return symptom || label || workOrder.taskNumber;
  }, [workOrder]);

  const assignedLabel = workOrder?.assignedTo.displayName ?? workOrder?.assignedTo.roleName ?? 'Unassigned';
  const assignButtonLabel = workOrder?.assignedTo.userId || workOrder?.assignedTo.roleId ? 'Reassign' : 'Assign';

  const openAssign = (): void => {
    if (!workOrder) return;
    if (workOrder.assignedTo.userId) {
      setAssignMode('user');
      setAssignUserId(workOrder.assignedTo.userId);
      setAssignRoleId('');
    } else if (workOrder.assignedTo.roleId) {
      setAssignMode('role');
      setAssignRoleId(workOrder.assignedTo.roleId);
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
    if (!workOrder) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      if (assignMode === 'user') {
        if (!assignUserId) throw new Error('Select technician');
        await apiAssignWorkOrder({ taskId: workOrder.id, assignedToUserId: assignUserId, assignedToRoleId: null });
      } else if (assignMode === 'role') {
        if (!assignRoleId) throw new Error('Select role');
        await apiAssignWorkOrder({ taskId: workOrder.id, assignedToRoleId: assignRoleId, assignedToUserId: null });
      } else {
        await apiAssignWorkOrder({ taskId: workOrder.id, assignedToUserId: null, assignedToRoleId: null });
      }
      await loadDetail();
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
    if (!workOrder) return;
    setActionLoading(true);
    try {
      await apiStartWorkOrder(workOrder.id);
      await loadDetail();
    } catch {
      setError('Failed to start');
    } finally {
      setActionLoading(false);
    }
  };

  const onPause = async (): Promise<void> => {
    if (!workOrder) return;
    setActionLoading(true);
    try {
      await apiPauseWorkOrder(workOrder.id);
      await loadDetail();
    } catch {
      setError('Failed to pause');
    } finally {
      setActionLoading(false);
    }
  };

  const onResume = async (): Promise<void> => {
    if (!workOrder) return;
    setActionLoading(true);
    try {
      await apiResumeWorkOrder(workOrder.id);
      await loadDetail();
    } catch {
      setError('Failed to resume');
    } finally {
      setActionLoading(false);
    }
  };

  const onComplete = async (): Promise<void> => {
    if (!workOrder) return;
    setActionLoading(true);
    try {
      const checklistResults = buildChecklistResults();
      await apiCompleteWorkOrder({ taskId: workOrder.id, checklistResults });
      await loadDetail();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to complete';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const onCancel = async (): Promise<void> => {
    if (!workOrder) return;
    setActionLoading(true);
    try {
      await apiCancelWorkOrder(workOrder.id);
      await loadDetail();
    } catch {
      setError('Failed to cancel');
    } finally {
      setActionLoading(false);
    }
  };

  const onCloseDowntime = async (): Promise<void> => {
    if (!workOrder) return;
    setActionLoading(true);
    try {
      await apiCloseDowntime(workOrder.id);
      await loadDetail();
    } catch {
      setError('Failed to close downtime');
    } finally {
      setActionLoading(false);
    }
  };

  const onToggleExpand = (itemId: string): void => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  };

  const setOutcome = (itemId: string, outcome: 0 | 1 | 2 | null): void => {
    if (!canComplete) return;
    setChecklistDraft((prev) => ({ ...prev, [itemId]: { outcome, notes: prev[itemId]?.notes ?? '' } }));
  };

  const setNotes = (itemId: string, notes: string): void => {
    if (!canComplete) return;
    setChecklistDraft((prev) => ({ ...prev, [itemId]: { outcome: prev[itemId]?.outcome ?? null, notes } }));
  };

  const triggerChecklistUpload = (itemId: string): void => {
    if (!canComplete) return;
    checklistUploadItemIdRef.current = itemId;
    checklistFileInputRef.current?.click();
  };

  const triggerTaskUpload = (): void => {
    if (!canComplete) return;
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
      await apiUploadTaskChecklistEvidenceFile({ taskId: task.id, templateChecklistItemId: itemId, file });
      await loadDetail();
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
      await apiUploadTaskEvidenceFile({ taskId: task.id, file });
      await loadDetail();
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

  if (!workOrder) {
    return (
      <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 p-4">
            <button onClick={() => navigate(-1)} className="flex items-center justify-center size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <span className="material-symbols-outlined text-slate-700 dark:text-slate-300">arrow_back_ios_new</span>
            </button>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Work Order</h1>
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
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{workOrder.taskNumber}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{subject}</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-emerald-500" title="Offline-first Sync Active">cloud_done</span>
        </div>
        <div className="px-4 pb-3 flex gap-2 flex-wrap">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            {workOrder.status}
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 uppercase tracking-wider">
            Priority: {workOrder.priority ?? '—'}
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
            {assignedLabel}
          </span>
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

      <main className="flex-1 overflow-y-auto pb-52">
        {error && (
          <section className="px-4 pt-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          </section>
        )}

        <section className="p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Corrective Maintenance</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">{subject}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{workOrder.asset?.assetTag ?? workOrder.asset?.name ?? workOrder.facility?.name ?? '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Impact</p>
                <p className="text-slate-700 dark:text-slate-200">{workOrder.impactLevel ?? '—'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Reported</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDateTime(workOrder.reportedAt)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Failure Category</p>
                <p className="text-slate-700 dark:text-slate-200">{workOrder.failureCategory ?? '—'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Failure Code</p>
                <p className="text-slate-700 dark:text-slate-200">{workOrder.failureCode ?? '—'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Reported By</p>
                <p className="text-slate-700 dark:text-slate-200">{workOrder.reportedBy?.displayName ?? workOrder.reportedBy?.username ?? '—'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Channel</p>
                <p className="text-slate-700 dark:text-slate-200">{workOrder.reportedChannel ?? '—'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Downtime Start</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDateTime(workOrder.downtimeStartedAt)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Downtime End</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDateTime(workOrder.downtimeEndedAt)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pt-2">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4">Checklist</h3>
          <div className="space-y-3">
            {task?.checklistItems?.length ? (
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
                  const hasCamera = item.enableAttachment;

                  return (
                    <div key={item.id} className={`rounded-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ${isDone ? 'opacity-90' : ''}`}>
                      <button
                        type="button"
                        onClick={() => onToggleExpand(item.id)}
                        className="w-full flex items-center gap-4 p-4"
                      >
                        <div className="relative flex items-center">
                          <button
                            type="button"
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
                        {hasCamera ? (
                          <button
                            type="button"
                            disabled={uploading || !canComplete}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerChecklistUpload(item.id);
                            }}
                            className="size-10 rounded-full flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <span className="material-symbols-outlined text-slate-500">photo_camera</span>
                          </button>
                        ) : null}
                      </button>

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
                            disabled={!canComplete}
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
                              disabled={!canComplete}
                            />
                          </div>
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
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assign Work Order</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{workOrder.taskNumber}</p>
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

      <input ref={checklistFileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onChecklistFileSelected} />
      <input ref={taskFileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onTaskFileSelected} />

      <div className="fixed bottom-32 right-4 flex flex-col gap-3 z-40">
        <button disabled={uploading || !canComplete} onClick={triggerTaskUpload} className="size-14 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 active:scale-95 transition-transform">
          <span className="material-symbols-outlined">photo_camera</span>
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-50">
        <div className="bg-white/90 dark:bg-background-dark/90 ios-bottom-blur border-t border-slate-200 dark:border-slate-800 p-4 pb-8 space-y-3">
          <div className="max-w-screen-sm mx-auto flex gap-3">
            {canStart ? (
              <button disabled={actionLoading} onClick={onStart} className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 active:bg-slate-50 dark:active:bg-slate-800 transition-colors">
                <span className="material-symbols-outlined text-xl">play_arrow</span>
                Start
              </button>
            ) : canResume ? (
              <button disabled={actionLoading} onClick={onResume} className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 active:bg-slate-50 dark:active:bg-slate-800 transition-colors">
                <span className="material-symbols-outlined text-xl">play_arrow</span>
                Resume
              </button>
            ) : (
              <button disabled={actionLoading || !canPause} onClick={onPause} className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 active:bg-slate-50 dark:active:bg-slate-800 transition-colors">
                <span className="material-symbols-outlined text-xl">pause</span>
                Pause
              </button>
            )}

            <button disabled={actionLoading || !canComplete} onClick={onComplete} className="flex-[2] h-12 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform disabled:opacity-60">
              <span className="material-symbols-outlined text-xl">task_alt</span>
              Complete
            </button>
          </div>
          <div className="max-w-screen-sm mx-auto flex gap-3">
            <button disabled={actionLoading || !canCancel} onClick={onCancel} className="flex-1 h-11 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 font-semibold">
              Cancel Work Order
            </button>
            <button disabled={actionLoading || !canCloseDowntime} onClick={onCloseDowntime} className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
              Close Downtime
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkOrderDetailPage;
