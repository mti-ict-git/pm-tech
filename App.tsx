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

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <BackButtonHandler />
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
