import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';

const Layout: React.FC = () => {
  const location = useLocation();

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
      <div className="flex-1 pb-24">
        <div key={location.pathname} className="pm-page-enter">
          <Outlet />
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Layout;
