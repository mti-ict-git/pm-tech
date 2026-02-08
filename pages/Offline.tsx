import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiGetTask, apiListTasks, getOfflineCacheLastWriteAt, type TaskDetail } from '../lib/api';

type CachedTask = {
  id: string;
  taskNumber: string;
  status: string;
  assetName: string | null;
  savedAt: string;
};

type CacheEntry<T> = { savedAt: string; value: T };

const Offline: React.FC = () => {
  const navigate = useNavigate();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastWriteAt, setLastWriteAt] = useState<string | null>(() => getOfflineCacheLastWriteAt());

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

  const cachedTasks = useMemo((): CachedTask[] => {
    const prefix = 'pmtech.cache.v1:/api/tasks/';
    const out: CachedTask[] = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (!key.startsWith(prefix)) continue;
        if (key.includes('?')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') continue;
        const entry = parsed as Partial<CacheEntry<TaskDetail>>;
        if (typeof entry.savedAt !== 'string' || !entry.savedAt.trim()) continue;
        const value = entry.value;
        if (!value || typeof value !== 'object') continue;
        const task = value as TaskDetail;
        if (typeof task.id !== 'string' || !task.id.trim()) continue;
        const taskNumber = typeof task.taskNumber === 'string' ? task.taskNumber : '';
        if (!taskNumber.trim()) continue;
        const status = typeof task.status === 'string' ? task.status : '';
        const assetName = task.asset && typeof task.asset.name === 'string' ? task.asset.name : null;
        out.push({ id: task.id, taskNumber, status, assetName, savedAt: entry.savedAt });
      }
    } catch {
      return [];
    }
    out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return out;
  }, [lastWriteAt]);

  const formatWhen = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const onSyncNow = async (): Promise<void> => {
    if (!online) {
      setError('You are offline');
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const list = await apiListTasks({ assigned: 'me', maintenanceType: 'all', page: 1, pageSize: 50 });
      const ids = (list.items ?? []).map((i) => i.id).filter((id) => typeof id === 'string' && id.trim());
      const unique = Array.from(new Set(ids)).slice(0, 20);
      await Promise.all(unique.map((id) => apiGetTask(id)));
      setLastWriteAt(getOfflineCacheLastWriteAt());
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Sync failed';
      setError(message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col pb-24">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3 h-14">
          <button onClick={() => navigate(-1)} className="flex items-center text-primary">
            <span className="material-symbols-outlined text-[28px]">chevron_left</span>
            <span className="text-lg font-medium">Back</span>
          </button>
          <h1 className="text-lg font-semibold absolute left-1/2 -translate-x-1/2">Offline</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center">
            <div
              className={`w-16 h-16 ${online ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'} rounded-full flex items-center justify-center mb-4`}
            >
              <span
                className={`material-symbols-outlined ${online ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-300'} text-4xl font-bold`}
              >
                {online ? 'wifi' : 'wifi_off'}
              </span>
            </div>
            <h2 className="text-xl font-bold mb-1">{online ? 'Online' : 'Offline'}</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">
              {lastWriteAt ? `Last sync: ${formatWhen(lastWriteAt)}` : 'No cached data yet'}
            </p>
            {error ? <p className="text-rose-600 dark:text-rose-300 text-sm mb-4">{error}</p> : <div className="h-4" />}
            <button
              disabled={!online || syncing}
              onClick={() => void onSyncNow()}
              className="w-full bg-primary text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 active:opacity-80 transition-opacity disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-xl">sync</span>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>

        <div className="px-4 py-2 flex justify-between items-center">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Cached Tasks ({cachedTasks.length})
          </h3>
        </div>

        <div className="space-y-3 px-4 pb-6">
          {cachedTasks.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-800">
              <p className="text-sm text-slate-600 dark:text-slate-300">Open tasks while online to cache them for offline use.</p>
            </div>
          ) : (
            cachedTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/task/${t.id}`)}
                className="w-full text-left bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase rounded leading-tight">Cached</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatWhen(t.savedAt)}</span>
                </div>
                <p className="font-bold text-slate-900 dark:text-slate-100">{t.taskNumber}</p>
                {t.assetName ? <p className="text-sm text-slate-600 dark:text-slate-300">{t.assetName}</p> : null}
                <div className="flex items-center gap-2 mt-2">
                  <span className="material-symbols-outlined text-slate-400 text-sm">schedule</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t.status}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 mb-8">
          <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">info</span>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Offline tips</h3>
            </div>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-primary text-[20px] shrink-0">check_circle</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">Tasks are cached after you open them online, or when you sync.</p>
              </li>
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-primary text-[20px] shrink-0">check_circle</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">Checklist edits can be saved locally using the Save button.</p>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Offline;
