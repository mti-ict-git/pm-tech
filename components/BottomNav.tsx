import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { label: 'Home', icon: 'home', path: '/dashboard' },
    { label: 'Tasks', icon: 'task_alt', path: '/tasks' }, // Using task_alt for checklist feel
    { label: 'Assets', icon: 'inventory_2', path: '/assets' },
    { label: 'Work Orders', icon: 'handyman', path: '/work-orders' },
    { label: 'Offline', icon: 'cloud_off', path: '/offline' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-2 py-3.5 flex items-center justify-around pb-[env(safe-area-inset-bottom)] z-40">
      {navItems.map((item) => (
        <button
          key={item.label}
          onClick={() => navigate(item.path)}
          className={`flex flex-col items-center gap-2 min-w-[72px] ${
            isActive(item.path) ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <span className={`material-symbols-outlined text-[28px] ${isActive(item.path) ? 'material-symbols-filled' : ''}`}>
            {item.icon}
          </span>
          <span className={`text-[12px] ${isActive(item.path) ? 'font-bold' : 'font-medium'}`}>
            {item.label}
          </span>
          {item.path === '/offline' && (
             <div className="absolute top-2 right-[18%] w-1.5 h-1.5 bg-primary rounded-full border border-white dark:border-slate-900" />
          )}
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
