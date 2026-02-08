import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRegisterDevice } from '../lib/api';
import { registerDeviceToken, useAuth } from '../providers/AuthProvider';

type ThemeMode = 'light' | 'dark';
type Accent = 'blue' | 'green' | 'amber';

const THEME_KEY = 'pm-tech-theme-mode';
const ACCENT_KEY = 'pm-tech-theme-accent';
const PUSH_KEY = 'pm-tech-push-enabled';
const LAST_SYNC_KEY = 'pm-tech-last-sync';

const readTheme = (): ThemeMode => {
  const value = localStorage.getItem(THEME_KEY);
  return value === 'dark' ? 'dark' : 'light';
};

const readAccent = (): Accent => {
  const value = localStorage.getItem(ACCENT_KEY);
  if (value === 'green' || value === 'amber') return value;
  return 'blue';
};

const readPushEnabled = (): boolean => {
  const value = localStorage.getItem(PUSH_KEY);
  if (value === 'false') return false;
  if (value === 'true') return true;
  return true;
};

const formatRelativeTime = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [lastSync, setLastSync] = useState<string | null>(() => localStorage.getItem(LAST_SYNC_KEY));
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readTheme());
  const [accent, setAccent] = useState<Accent>(() => readAccent());
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => readPushEnabled());

  const displayName = useMemo(() => {
    if (!user) return '—';
    if (user.displayName && user.displayName.trim().length > 0) return user.displayName;
    return user.username;
  }, [user]);

  const userInitials = useMemo(() => {
    const source = displayName.trim();
    if (!source) return '—';
    return source
      .split(' ')
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [displayName]);

  const roleLabel = useMemo(() => {
    const roles = user?.roles ?? [];
    if (roles.length === 0) return '—';
    const primary = roles[0]?.toLowerCase();
    if (!primary) return '—';
    if (primary === 'superadmin') return 'Superadmin';
    if (primary === 'admin') return 'Administrator';
    if (primary === 'supervisor') return 'Supervisor';
    if (primary === 'technician') return 'Technician';
    return roles[0] ?? '—';
  }, [user]);

  const versionRaw = import.meta.env.VITE_APP_VERSION;
  const versionLabel = versionRaw && versionRaw.trim().length > 0 ? (versionRaw.startsWith('v') ? versionRaw : `v${versionRaw}`) : '—';

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    localStorage.setItem(THEME_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem(ACCENT_KEY, accent);
  }, [accent]);

  useEffect(() => {
    localStorage.setItem(PUSH_KEY, pushEnabled ? 'true' : 'false');
  }, [pushEnabled]);

  useEffect(() => {
    if (!pushEnabled) return;
    if (!user) return;

    void (async () => {
      try {
        const token = await registerDeviceToken();
        if (!token) return;
        const { Capacitor } = await import('@capacitor/core');
        const platform = Capacitor.getPlatform();
        await apiRegisterDevice({ platform, token });
      } catch {
      }
    })();
  }, [pushEnabled, user]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const onSyncNow = async (): Promise<void> => {
    setSyncing(true);
    setSyncError(null);
    try {
      await refreshUser();
      const next = new Date().toISOString();
      setLastSync(next);
      localStorage.setItem(LAST_SYNC_KEY, next);
    } catch {
      setSyncError('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col pb-24">
      <header className="flex items-center px-4 pt-6 pb-2 justify-between sticky top-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-10">
        <button onClick={() => navigate(-1)} className="flex items-center justify-center size-10 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h1 className="text-lg font-bold tracking-tight">Profile & Settings</h1>
        <div className="size-10"></div> 
      </header>

      <section className="flex flex-col items-center py-6 px-4">
        <div className="relative">
          <div className="size-24 rounded-full bg-primary flex items-center justify-center text-white text-3xl font-bold shadow-lg ring-4 ring-white dark:ring-slate-800">
            {userInitials}
          </div>
          <div className="absolute bottom-1 right-1 size-5 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full"></div>
        </div>
        <h2 className="mt-4 text-2xl font-bold">{displayName}</h2>
        <p className="text-slate-500 dark:text-slate-400 font-medium">{roleLabel}</p>
        {user?.username ? (
          <div className="mt-2 px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full uppercase tracking-wider">
            {user.username}
          </div>
        ) : null}
      </section>

      <section className="px-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`material-symbols-outlined text-sm ${isOnline ? 'text-green-500' : 'text-slate-400'}`}>{isOnline ? 'check_circle' : 'cloud_off'}</span>
                <p className="text-sm font-bold">Connection: {isOnline ? 'Online' : 'Offline'}</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Last Sync: {formatRelativeTime(lastSync)}</p>
              {syncError ? <p className="text-xs text-red-500 mt-1">{syncError}</p> : null}
            </div>
            <button
              onClick={onSyncNow}
              disabled={syncing}
              className="bg-primary hover:bg-primary/90 disabled:opacity-60 text-white flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all active:scale-95 shadow-md shadow-primary/20"
            >
              <span className="material-symbols-outlined text-[18px]">sync</span>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
          <div className="mt-4 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-primary w-full"></div>
          </div>
        </div>
      </section>

      <section className="px-4 space-y-2">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1 py-2">General Settings</h3>
        <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="size-9 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined">notifications</span>
              </div>
              <span className="font-medium">Push Notifications</span>
            </div>
            <label className="relative flex h-7 w-12 cursor-pointer items-center rounded-full bg-slate-200 dark:bg-slate-700 p-0.5 has-[:checked]:bg-primary transition-colors">
              <div className="h-6 w-6 rounded-full bg-white shadow-md transform transition-transform duration-200 translate-x-0 peer-checked:translate-x-5"></div>
              <input
                checked={pushEnabled}
                onChange={(e) => setPushEnabled(e.target.checked)}
                className="sr-only peer"
                type="checkbox"
              />
            </label>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="size-9 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined">dark_mode</span>
              </div>
              <span className="font-medium">Dark Mode</span>
            </div>
            <label className="relative flex h-7 w-12 cursor-pointer items-center rounded-full bg-slate-200 dark:bg-slate-700 p-0.5 has-[:checked]:bg-primary transition-colors">
              <div className="h-6 w-6 rounded-full bg-white shadow-md transform transition-transform duration-200 translate-x-0 peer-checked:translate-x-5"></div>
              <input
                checked={themeMode === 'dark'}
                onChange={(e) => setThemeMode(e.target.checked ? 'dark' : 'light')}
                className="sr-only peer"
                type="checkbox"
              />
            </label>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-9 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined">palette</span>
              </div>
              <span className="font-medium">Theme Accent</span>
            </div>
            <div className="flex gap-4 pl-12">
              <button
                onClick={() => setAccent('blue')}
                className={`size-10 rounded-full bg-[#136dec] ${accent === 'blue' ? 'ring-offset-2 ring-2 ring-[#136dec]' : ''} flex items-center justify-center`}
              >
                {accent === 'blue' ? <span className="material-symbols-outlined text-white text-sm">check</span> : null}
              </button>
              <button
                onClick={() => setAccent('green')}
                className={`size-10 rounded-full bg-green-500 hover:scale-105 transition-transform ${accent === 'green' ? 'ring-offset-2 ring-2 ring-green-500' : ''}`}
              >
                {accent === 'green' ? <span className="material-symbols-outlined text-white text-sm">check</span> : null}
              </button>
              <button
                onClick={() => setAccent('amber')}
                className={`size-10 rounded-full bg-amber-500 hover:scale-105 transition-transform ${accent === 'amber' ? 'ring-offset-2 ring-2 ring-amber-500' : ''}`}
              >
                {accent === 'amber' ? <span className="material-symbols-outlined text-white text-sm">check</span> : null}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 mt-8 space-y-2">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1 py-2">Account</h3>
        <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700">
          <button className="w-full flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
              <span className="material-symbols-outlined">info</span>
              <span className="font-medium">About Version</span>
            </div>
            <span className="text-sm text-slate-400">{versionLabel}</span>
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-4 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="font-bold">Log Out</span>
          </button>
        </div>
      </section>

      <div className="mt-auto px-4 py-8">
        <div className="aspect-[16/5] w-full rounded-2xl bg-gradient-to-r from-primary to-blue-400 opacity-10 dark:opacity-20 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary">engineering</span>
        </div>
        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-4 uppercase tracking-[0.2em] font-medium">Preventive Maintenance Enterprise {versionLabel}</p>
      </div>
    </div>
  );
};

export default Profile;
