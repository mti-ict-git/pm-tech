import React from 'react';
import { useNavigate } from 'react-router-dom';

const Offline: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col pb-24">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3 h-14">
          <button onClick={() => navigate(-1)} className="flex items-center text-primary">
            <span className="material-symbols-outlined text-[28px]">chevron_left</span>
            <span className="text-lg font-medium">Back</span>
          </button>
          <h1 className="text-lg font-semibold absolute left-1/2 -translate-x-1/2">Offline Management</h1>
          <div className="w-10"></div> 
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-4xl font-bold">check_circle</span>
            </div>
            <h2 className="text-xl font-bold mb-1">All data is synchronized</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Last synced: Today at 10:45 AM</p>
            <button className="w-full bg-primary text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 active:opacity-80 transition-opacity">
              <span className="material-symbols-outlined text-xl">sync</span>
              Sync Now
            </button>
          </div>
        </div>

        <div className="px-4 py-2 flex justify-between items-center">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cached Tasks (4)</h3>
        </div>

        <div className="space-y-3 px-4 pb-6">
          <div className="bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase rounded leading-tight">Saved locally</span>
              </div>
              <p className="font-bold text-slate-900 dark:text-slate-100">Task #1042: HVAC Unit 2</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="material-symbols-outlined text-primary text-sm">schedule</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">In Progress</span>
              </div>
            </div>
            <div className="w-20 h-20 rounded-lg bg-cover bg-center shrink-0" style={{backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuC5kTp3XfMCZR2LoRisw3ivXpNMpyVQIHXVXg4mDb2wWyLqwSvhYSDxpGb-0_VgbF0dtKUHQJ7BzNMN99y2TDIyycd1CCq2aLRMatO-X2QG4odd9lb5lUHWn7iS4Irxnysb5lwcTgPfS-qOSvfpQ0wWxn3Hl7SVZz3wphPhEv9ZZC8VzmAiDMYqZ7FtDxBw4IEndOHBxaaWHmzMvBTMNw_dd1sJFz9hPZVbdS8iPxgZZN21LpkB6l0abpMbDbbvI7vmEiDOrcAEgbU-')"}}></div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase rounded leading-tight">Saved locally</span>
              </div>
              <p className="font-bold text-slate-900 dark:text-slate-100">Task #1045: Generator Alpha</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="material-symbols-outlined text-slate-400 text-sm">pending_actions</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">Pending Review</span>
              </div>
            </div>
            <div className="w-20 h-20 rounded-lg bg-cover bg-center shrink-0" style={{backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCdOBZg5N5Mg55_vYOSVwDwFzK_NIqEfZ7DjFvJlQ_e_6SaurqjgsMzBITLN6pOiOpDB1y4UbUH4stQBHvbVXnH53rvTID_awYguYRye6f-7pji6Mnx6DIm_um1PsgyoJkhQPbLeqXNM2yo_dwnjdaLSmVRpKViTvAgtV7JLZlq0xz7FR_N9oeN2eojhiegqiQcM212cmkn4vhkZwYGAb_vX0Wkkolr-JUuhDPOMOc1s54vraqDrFy3vgCAxOx_rTsrdTWa5tPVZAlM')"}}></div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase rounded leading-tight">Saved locally</span>
              </div>
              <p className="font-bold text-slate-900 dark:text-slate-100">Task #1050: Water Pump M1</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="material-symbols-outlined text-slate-400 text-sm">history</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">Scheduled</span>
              </div>
            </div>
            <div className="w-20 h-20 rounded-lg bg-cover bg-center shrink-0" style={{backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBaVx9udaNYEVDNQAEzl9-y8FBJGiBtBmNePghhYWYzcTwJNcCAtDEHXN6xYsN643TN3wPN6EP4c2ExDAGCIHecqW1szirjGllAuAcQbwH5xmwiqUAAJvlHV4zEd974rmti19kOJ-A8T6g6S_6QMG-OssWs1PCsVqds52mYsjvmNOsP0kj6YJSfQndj3bonZ_os4626Tc6GCB4pqghcGOwPFsSnRRAeZMmQzNSUNQ9SCc13NSOZs8emTjK9Nge7wkOTY76xGAU2TOz8')"}}></div>
          </div>
        </div>

        <div className="px-4 mb-8">
          <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">info</span>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Offline Mode Tips</h3>
            </div>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-primary text-[20px] shrink-0">check_circle</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">Tasks are automatically cached once you open them while online.</p>
              </li>
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-primary text-[20px] shrink-0">check_circle</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">Photos and signatures are saved locally and uploaded during next sync.</p>
              </li>
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-primary text-[20px] shrink-0">check_circle</span>
                <p className="text-sm text-slate-700 dark:text-slate-300">Conflicts are flagged for review if the server data changed.</p>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Offline;