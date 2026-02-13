import React, { useEffect } from 'react';
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
import { apiGetLatestAppUpdate, downloadAndInstallAppUpdate, hasNewerAppUpdate, processOfflineSync } from './lib/api';

declare const __APP_VERSION__: string | undefined;

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
    const handler = CapacitorApp.addListener('backButton', (event) => {
      const canGoBack = typeof event.canGoBack === 'boolean' ? event.canGoBack : window.history.length > 1;
      if (canGoBack) {
        navigate(-1);
        return;
      }
      void CapacitorApp.exitApp();
    });

    return () => {
      void handler.remove();
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

const UpdatePromptHandler: React.FC = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (Capacitor.getPlatform() !== 'android') return;
    if (!navigator.onLine) return;

    const promptKey = 'pm-tech.updatePromptAt';
    const lastPromptRaw = localStorage.getItem(promptKey);
    const lastPromptAt = lastPromptRaw ? new Date(lastPromptRaw).getTime() : 0;
    if (Number.isFinite(lastPromptAt) && lastPromptAt > 0) {
      const elapsedMs = Date.now() - lastPromptAt;
      if (elapsedMs < 12 * 60 * 60 * 1000) return;
    }

    localStorage.setItem(promptKey, new Date().toISOString());

    const currentRaw = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? __APP_VERSION__;
    const current = currentRaw && currentRaw.trim() ? (currentRaw.trim().startsWith('v') ? currentRaw.trim().slice(1) : currentRaw.trim()) : 'unknown';

    void (async () => {
      try {
        const latest = await apiGetLatestAppUpdate('pm-tech');
        if (!hasNewerAppUpdate(latest.versionName)) return;
        const ok = window.confirm(`Update available: v${latest.versionName} (current v${current}).\n\nUpdate now?`);
        if (!ok) return;
        await downloadAndInstallAppUpdate(latest);
      } catch {
      }
    })();
  }, []);

  return null;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <BackButtonHandler />
        <OnlineSyncHandler />
        <UpdatePromptHandler />
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
