import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiGetTaskStatusCounts, apiListTasks, type TaskListItem, type TaskStatusCountsResponse } from '../lib/api';

const Tasks: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<'all' | 'in_progress' | 'upcoming' | 'due_today' | 'overdue' | 'completed'>('all');
  const [assigned, setAssigned] = useState<'any' | 'me'>('any');
  const [items, setItems] = useState<TaskListItem[]>([]);
  const [counts, setCounts] = useState<TaskStatusCountsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type TabKey = 'all' | 'in_progress' | 'upcoming' | 'due_today' | 'overdue' | 'completed';
  type AssignedKey = 'any' | 'me';

  const parseTabFromSearch = (search: string): TabKey => {
    const raw = new URLSearchParams(search).get('tab');
    if (raw === 'in_progress' || raw === 'upcoming' || raw === 'due_today' || raw === 'overdue' || raw === 'completed' || raw === 'all') return raw;
    return 'all';
  };

  const parseAssignedFromSearch = (search: string): AssignedKey => {
    const raw = new URLSearchParams(search).get('assigned');
    if (raw === 'me' || raw === 'any') return raw;
    return 'any';
  };

  const buildTasksUrl = (nextTab: TabKey, nextAssigned: AssignedKey): string => {
    const params = new URLSearchParams();
    params.set('tab', nextTab);
    if (nextAssigned !== 'any') params.set('assigned', nextAssigned);
    const search = params.toString();
    return search ? `/tasks?${search}` : '/tasks';
  };

  const setTabAndUrl = (next: TabKey): void => {
    setTab(next);
    navigate(buildTasksUrl(next, assigned), { replace: true });
  };

  const setAssignedAndUrl = (next: AssignedKey): void => {
    setAssigned(next);
    navigate(buildTasksUrl(tab, next), { replace: true });
  };

  useEffect(() => {
    const next = parseTabFromSearch(location.search);
    setTab((prev) => (prev === next ? prev : next));
    const nextAssigned = parseAssignedFromSearch(location.search);
    setAssigned((prev) => (prev === nextAssigned ? prev : nextAssigned));
  }, [location.search]);

  const startOfDayIso = (d: Date): string => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    return x.toISOString();
  };

  const endOfDayIso = (d: Date): string => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    return x.toISOString();
  };

  const addDaysIso = (d: Date, days: number): string => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x.toISOString();
  };

  type UiStatus = 'upcoming' | 'in_progress' | 'due_today' | 'overdue' | 'completed' | 'cancelled' | 'open';
  const getUiStatus = (t: TaskListItem, now: Date): UiStatus => {
    const status = (t.status || '').toLowerCase();
    if (status === 'cancelled') return 'cancelled';
    if (status === 'completed') return 'completed';
    if (status === 'in_progress') return 'in_progress';
    if (t.scheduledDueAt) {
      const due = new Date(t.scheduledDueAt);
      if (!Number.isNaN(due.getTime())) {
        if (due.getTime() < now.getTime()) return 'overdue';
        const sameDay = due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate();
        if (sameDay) return 'due_today';
      }
    }
    if (status === 'open') return 'open';
    return 'upcoming';
  };

  const statusPill = (t: TaskListItem): { label: string; className: string } => {
    const ui = getUiStatus(t, new Date());
    if (ui === 'overdue') return { label: 'Overdue', className: 'bg-status-red/10 text-status-red' };
    if (ui === 'due_today') return { label: 'Due Today', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' };
    if (ui === 'in_progress') return { label: 'In Progress', className: 'bg-primary/10 text-primary' };
    if (ui === 'completed') return { label: 'Completed', className: 'bg-green-500/10 text-green-700 dark:text-green-400' };
    if (ui === 'cancelled') return { label: 'Cancelled', className: 'bg-slate-200 dark:bg-slate-800 text-slate-500' };
    if (ui === 'open') return { label: 'Open', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500' };
    return { label: 'Upcoming', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500' };
  };

  useEffect(() => {
    let isCancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const now = new Date();
        const base = { assigned, maintenanceType: 'PM' as const, page: 1, pageSize: 50 };
        const input: Parameters<typeof apiListTasks>[0] =
          tab === 'in_progress'
            ? { ...base, status: 'in_progress' }
            : tab === 'completed'
              ? { ...base, status: 'completed' }
              : tab === 'overdue'
                ? { ...base, overdue: true }
                : tab === 'due_today'
                  ? { ...base, dueFrom: startOfDayIso(now), dueTo: endOfDayIso(now) }
                  : tab === 'upcoming'
                    ? { ...base, dueFrom: now.toISOString(), dueTo: addDaysIso(now, 7) }
                    : base;

        const res = await apiListTasks(input);
        if (!isCancelled) setItems(res.items);
        try {
          const countsRes = await apiGetTaskStatusCounts({ assigned, maintenanceType: 'PM' });
          if (!isCancelled) setCounts(countsRes);
        } catch {
          if (!isCancelled) setCounts(null);
        }
      } catch (e) {
        if (!isCancelled) setError('Failed to load tasks');
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    void load();
    return () => { isCancelled = true; };
  }, [tab, assigned]);

  const progressPct = (t: TaskListItem): number => {
    const total = Number(t.checklistTotal ?? 0) || 0;
    const done = Number(t.checklistCompleted ?? 0) || 0;
    if (!total) return 0;
    return Math.round((done / total) * 100);
  };

  const shownItems = useMemo(() => items, [items]);

  const formatDueAt = (value: string): string => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  };

  const badgeClass = (key: 'all' | 'in_progress' | 'due_today' | 'upcoming' | 'overdue' | 'completed'): string => {
    if (key === 'in_progress') return 'bg-blue-500 text-white';
    if (key === 'due_today') return 'bg-orange-500 text-white';
    if (key === 'upcoming') return 'bg-slate-300 text-slate-700';
    if (key === 'overdue') return 'bg-red-500 text-white';
    if (key === 'completed') return 'bg-green-500 text-white';
    return 'bg-slate-200 text-slate-700';
  };

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="flex flex-col px-4 pt-2 gap-4 sticky top-0 z-40 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md pb-2">
        <div className="flex items-center justify-between pt-2">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{assigned === 'me' ? 'My Tasks' : 'PM Tasks'}</h1>
            <div className="flex items-center gap-1 mt-1 text-slate-500 dark:text-slate-400">
              <span className="material-symbols-outlined text-xs">cloud_done</span>
              <span className="text-[10px] uppercase font-bold tracking-wider">Synced 2m ago</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAssignedAndUrl(assigned === 'me' ? 'any' : 'me')}
              className={`w-10 h-10 flex items-center justify-center rounded-full ${assigned === 'me' ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              aria-label="My tasks"
              aria-pressed={assigned === 'me'}
            >
              <span className="material-symbols-outlined">assignment_ind</span>
            </button>
            <button onClick={() => navigate('/schedule')} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
               <span className="material-symbols-outlined">calendar_month</span>
            </button>
            <button className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <span className="material-symbols-outlined">search</span>
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
          <button onClick={() => { setTabAndUrl('all'); }} className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex items-center gap-2 ${tab === 'all' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
            <span>All</span>
            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${badgeClass('all')}`}>
              {counts?.all ?? 0}
            </span>
          </button>
          <button onClick={() => { setTabAndUrl('in_progress'); }} className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex items-center gap-2 ${tab === 'in_progress' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
            <span>In Progress</span>
            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${badgeClass('in_progress')}`}>
              {counts?.inProgress ?? 0}
            </span>
          </button>
          <button onClick={() => { setTabAndUrl('due_today'); }} className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex items-center gap-2 ${tab === 'due_today' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
            <span>Due Today</span>
            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${badgeClass('due_today')}`}>
              {counts?.dueToday ?? 0}
            </span>
          </button>
          <button onClick={() => { setTabAndUrl('upcoming'); }} className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex items-center gap-2 ${tab === 'upcoming' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
            <span>Upcoming</span>
            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${badgeClass('upcoming')}`}>
              {counts?.upcoming ?? 0}
            </span>
          </button>
          <button onClick={() => { setTabAndUrl('overdue'); }} className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex items-center gap-2 ${tab === 'overdue' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
            <span>Overdue</span>
            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${badgeClass('overdue')}`}>
              {counts?.overdue ?? 0}
            </span>
          </button>
          <button onClick={() => { setTabAndUrl('completed'); }} className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex items-center gap-2 ${tab === 'completed' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
            <span>Completed</span>
            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${badgeClass('completed')}`}>
              {counts?.completed ?? 0}
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 mt-2 pb-24">
        {loading ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : shownItems.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">No tasks found.</div>
        ) : (
          shownItems.map((t) => (
            <div key={t.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold text-slate-400 tracking-wider">{t.taskNumber}</span>
                  <span className={`${statusPill(t).className} text-[10px] font-bold px-2 py-0.5 rounded-full uppercase`}>{statusPill(t).label}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight mb-2">{t.asset.name ?? t.asset.assetTag ?? t.template.name}</h3>
                <div className="flex flex-col gap-1 mb-4">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span className="material-symbols-outlined text-sm">assignment</span>
                    <span className="text-sm">{t.template.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span className="material-symbols-outlined text-sm">event</span>
                    <span className="text-sm">{formatDueAt(t.scheduledDueAt)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Progress</span>
                    <span className="text-xs font-bold text-primary">{t.checklistCompleted}/{t.checklistTotal} steps</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${progressPct(t)}%` }}></div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button onClick={() => navigate(`/task/${t.id}`)} className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2">
                  View
                  <span className="material-symbols-outlined text-xs">arrow_forward_ios</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Offline Status */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-medium shadow-lg z-30">
        <span className="material-symbols-outlined text-sm text-green-400">check_circle</span>
        Offline Mode Ready
      </div>
    </div>
  );
};

export default Tasks;
