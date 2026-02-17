import React, { useEffect, useRef, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Schedule from './pages/Schedule';
import Assets from './pages/Assets';
import AssetDetail from './pages/AssetDetail';
import Facilities from './pages/Facilities';
import WorkOrders from './pages/WorkOrders';
import WorkOrderDetail from './pages/WorkOrderDetail';
import Offline from './pages/Offline';
import Profile from './pages/Profile';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { apiGetAppUpdatePolicy, apiGetLatestAppUpdate, downloadAndInstallAppUpdate, processOfflineSync } from './lib/api';

const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/" state={{ from: location }} replace />;
  return <Outlet />;
};

const BackButtonHandler: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removed = false;
    let removeFn: (() => Promise<void>) | null = null;
    void CapacitorApp.addListener('backButton', (event) => {
      const canGoBack = typeof event.canGoBack === 'boolean' ? event.canGoBack : window.history.length > 1;
      if (canGoBack) {
        navigate(-1);
        return;
      }
      void CapacitorApp.exitApp();
    }).then((handle) => {
      if (removed) {
        void handle.remove();
        return;
      }
      removeFn = () => handle.remove();
    });

    return () => {
      removed = true;
      if (removeFn) void removeFn();
    };
  }, [navigate]);

  return null;
};

const OnlineSyncHandler: React.FC = () => {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    const onOnline = (): void => {
      void processOfflineSync();
    };
    window.addEventListener('online', onOnline);
    if (navigator.onLine) {
      void processOfflineSync();
    }
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [isAuthenticated]);

  return null;
};

const ForcedUpdateHandler: React.FC = () => {
  const [state, setState] = useState<{
    latest: Awaited<ReturnType<typeof apiGetLatestAppUpdate>>;
    currentVersionCode: number;
    requiredVersionCode: number;
    message: string | null;
  } | null>(null);
  const [installing, setInstalling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (Capacitor.getPlatform() !== 'android') return;
    if (!navigator.onLine) return;

    void (async (): Promise<void> => {
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        const versionCode = Number.parseInt(info.build, 10);
        if (!Number.isFinite(versionCode) || versionCode < 1) return;

        const policy = await apiGetAppUpdatePolicy({ appId: 'pm-tech', platform: 'android', versionCode });
        if (!policy.enabled || !policy.shouldDownload || policy.requiredVersionCode === null) return;

        const latest = await apiGetLatestAppUpdate('pm-tech');
        setError(null);
        setState({
          latest,
          currentVersionCode: versionCode,
          requiredVersionCode: policy.requiredVersionCode,
          message: policy.message,
        });
      } catch {
      }
    })();
  }, []);

  useEffect(() => {
    if (!state) return;
    const id = window.setTimeout(() => {
      if (okRef.current) okRef.current.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [state]);

  const onUpdateNow = async (): Promise<void> => {
    if (!state || installing) return;
    setInstalling(true);
    setError(null);
    try {
      const result = await downloadAndInstallAppUpdate(state.latest);
      if (result.ok) return;
      if (result.code) setError(`Update failed: ${result.code}`);
      else setError('Update failed');
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.trim().length > 0 ? err.message : null;
      setError(msg ? `Update failed: ${msg}` : 'Update failed');
    } finally {
      setInstalling(false);
    }
  };

  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[101] flex items-end justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="force-update-title">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4">
          <h2 id="force-update-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Update required
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            {state.message ?? 'This version is no longer supported. Please update to continue.'}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Current build: {state.currentVersionCode} • Required build: {state.requiredVersionCode} • Latest: v{state.latest.versionName}
          </p>
          {state.latest.releaseNotes && state.latest.releaseNotes.trim().length > 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
              <div className="text-sm font-semibold">What&apos;s new</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{state.latest.releaseNotes}</div>
            </div>
          ) : null}
          {error ? <p className="mt-2 text-sm font-semibold text-red-600">{error}</p> : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() => void CapacitorApp.exitApp()}
              disabled={installing}
            >
              Exit
            </button>
            <button
              ref={okRef}
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
              onClick={() => void onUpdateNow()}
              disabled={installing}
            >
              {installing ? 'Downloading…' : 'Update now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <BackButtonHandler />
        <OnlineSyncHandler />
        <ForcedUpdateHandler />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/offline" element={<Offline />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Home />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/facilities" element={<Facilities />} />
              <Route path="/work-orders" element={<WorkOrders />} />
              <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="/task/:id" element={<TaskDetail />} />
            <Route path="/asset/:id" element={<AssetDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;
