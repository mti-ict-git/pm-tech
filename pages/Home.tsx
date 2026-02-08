import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiFindAssetIdByTag,
  apiGetDashboardOverview,
  apiGetMyOutstandingCounts,
  apiListApprovalInbox,
  getMe,
  type ApprovalInboxItem,
  type ApprovalInboxStage,
  type DashboardOverview,
  type MyOutstandingCountsResponse,
  type User,
} from '../lib/api';
import { scanQrCodeValue } from '../lib/qr';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [outstandingCounts, setOutstandingCounts] = useState<MyOutstandingCountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalInboxItem[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);

  const [scanLoading, setScanLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [me, dashboard, counts] = await Promise.all([getMe(), apiGetDashboardOverview(), apiGetMyOutstandingCounts()]);
        setUser(me);
        setOverview(dashboard);
        setOutstandingCounts(counts);
      } catch {
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const onScanQr = async (): Promise<void> => {
    setScanLoading(true);
    setError(null);
    try {
      const scan = await scanQrCodeValue();
      if (scan.ok === false) {
        setError(scan.message);
        return;
      }

      const assetId = await apiFindAssetIdByTag(scan.value);
      if (!assetId) {
        setError(`Asset not found for tag: ${scan.value}`);
        return;
      }
      navigate(`/asset/${assetId}`);
    } catch {
      setError('Failed to scan QR');
    } finally {
      setScanLoading(false);
    }
  };

  const approvalsStage = useMemo<ApprovalInboxStage | null>(() => {
    const roles = user?.roles ?? [];
    if (roles.includes('Superadmin')) return 'PendingSuperadmin';
    if (roles.includes('Supervisor') || roles.includes('Admin')) return 'PendingSupervisor';
    return null;
  }, [user?.roles]);

  useEffect(() => {
    let cancelled = false;
    const loadApprovals = async () => {
      if (!approvalsStage) {
        setApprovals([]);
        setApprovalsError(null);
        return;
      }
      setApprovalsLoading(true);
      setApprovalsError(null);
      try {
        const res = await apiListApprovalInbox({ stage: approvalsStage, page: 1, pageSize: 20 });
        if (!cancelled) setApprovals(res.items);
      } catch {
        if (!cancelled) setApprovalsError('Failed to load approvals');
      } finally {
        if (!cancelled) setApprovalsLoading(false);
      }
    };

    void loadApprovals();
    return () => {
      cancelled = true;
    };
  }, [approvalsStage]);

  useEffect(() => {
    let cancelled = false;
    const loadApprovals = async () => {
      if (!approvalsOpen) return;
      if (!approvalsStage) {
        setApprovals([]);
        setApprovalsError(null);
        return;
      }
      setApprovalsLoading(true);
      setApprovalsError(null);
      try {
        const res = await apiListApprovalInbox({ stage: approvalsStage, page: 1, pageSize: 20 });
        if (!cancelled) setApprovals(res.items);
      } catch {
        if (!cancelled) setApprovalsError('Failed to load approvals');
      } finally {
        if (!cancelled) setApprovalsLoading(false);
      }
    };
    void loadApprovals();
    return () => {
      cancelled = true;
    };
  }, [approvalsOpen, approvalsStage]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const stats = overview?.stats;
  const approvalsCount = approvalsStage ? approvals.length : 0;
  const myOutstandingCount = outstandingCounts?.total ?? 0;

  const approvalTitle = approvalsStage === 'PendingSuperadmin' ? 'Pending Superadmin Approval' : 'Pending Supervisor Approval';
  const overdueCount = stats?.overdueCount ?? 0;
  const dueTodayCount = stats?.dueTodayCount ?? 0;
  const upcoming7DaysCount = stats?.upcoming7DaysCount ?? 0;
  const overdueAssets = overview?.overdueAssets ?? [];
  const overdueAssetLabels = overdueAssets
    .map((asset) => asset.name ?? asset.assetTag ?? 'Asset')
    .filter((label) => label.trim().length > 0);
  const overdueAssetSummary =
    overdueAssetLabels.length === 0
      ? null
      : overdueAssetLabels.length === 1
        ? overdueAssetLabels[0]
        : overdueAssetLabels.join(' and ');

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[20px]">engineering</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">OPTIMA Mobile</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-primary/10 dark:bg-primary/20 px-2 py-1 rounded-full">
              <span className="material-symbols-outlined text-primary text-[16px]">wifi</span>
              <span className="text-primary text-[12px] font-semibold uppercase tracking-wider">Online</span>
            </div>
            <button
              type="button"
              onClick={() => setApprovalsOpen((v) => !v)}
              className="relative rounded-full p-2 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
              aria-label="Notifications"
              aria-expanded={approvalsOpen}
            >
              <span className="material-symbols-outlined text-[28px] leading-none">notifications</span>
              {approvalsCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-rose-600 text-white text-[12px] leading-5 font-bold text-center">
                  {approvalsCount > 99 ? '99+' : approvalsCount}
                </span>
              ) : null}
            </button>
            <div 
              onClick={() => navigate('/profile')}
              className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer"
            >
              <div className="w-full h-full flex items-center justify-center bg-primary text-white text-xs font-bold">
                {user?.displayName ? user.displayName.substring(0, 2).toUpperCase() : 'ME'}
              </div>
            </div>
          </div>
        </div>
      </header>

      {approvalsOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setApprovalsOpen(false)}
            className="absolute inset-0 bg-black/20"
          />
          <div className="absolute top-14 right-3 w-[min(94vw,420px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Notifications</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">PM Overview</p>
              </div>
              <button
                type="button"
                onClick={() => setApprovalsOpen(false)}
                className="size-11 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-slate-700 dark:text-slate-200 text-[26px] leading-none">close</span>
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <div className="p-5">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4">
                    <p className="text-base font-semibold text-slate-900 dark:text-white">{overdueCount} PM task(s) overdue</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">Tasks past due and not completed</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4">
                    <p className="text-base font-semibold text-slate-900 dark:text-white">{dueTodayCount} due today</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">Scheduled for today</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4">
                    <p className="text-base font-semibold text-slate-900 dark:text-white">{upcoming7DaysCount} upcoming in 7 days</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">Due within the next week</p>
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Approvals</p>
                      <p className="text-base font-bold text-slate-900 dark:text-white">{approvalsStage ? approvalTitle : 'No Approvals'}</p>
                    </div>
                    {approvalsStage ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        {approvalsCount}
                      </span>
                    ) : null}
                  </div>

                  {!approvalsStage ? (
                    <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">No approval inbox for your role.</div>
                  ) : approvalsLoading ? (
                    <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Loading…</div>
                  ) : approvalsError ? (
                    <div className="mt-3 text-sm text-rose-600 dark:text-rose-400">{approvalsError}</div>
                  ) : approvals.length === 0 ? (
                    <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Nothing pending.</div>
                  ) : (
                    <div className="mt-3 -mx-2">
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        {approvals.map((item) => {
                          const subject = item.asset.name ?? item.asset.assetTag ?? item.facility?.name ?? item.template.name;
                          const subtitle = item.asset.assetTag ?? item.facility?.locationName ?? '';
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setApprovalsOpen(false);
                                if (item.maintenanceType === 'CM') navigate(`/work-orders/${item.id}`);
                                else navigate(`/task/${item.id}`);
                              }}
                              className="w-full text-left px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-base font-semibold text-slate-900 dark:text-white truncate">{subject}</p>
                                  <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{item.taskNumber}{subtitle ? ` • ${subtitle}` : ''}</p>
                                </div>
                                <span className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                  Review
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <main className="p-4 space-y-6">
        {error && (
          <section className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-sm text-red-600 dark:text-red-400">
            {error}
          </section>
        )}

        {/* Stats Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">Total Assets in PM</p>
            <p className="text-2xl font-bold mt-1">{stats ? stats.totalAssetsInPm : 0}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">Upcoming PM</p>
            <p className="text-2xl font-bold mt-1">{stats ? stats.upcoming7DaysCount : 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Next 7 days</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-amber-600 dark:text-amber-400 text-xs font-medium uppercase tracking-wide">Due Today</p>
            <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{stats ? stats.dueTodayCount : 0}</p>
            <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-1">Action needed</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-red-500 dark:text-red-400 text-xs font-medium uppercase tracking-wide">Overdue</p>
            <p className="text-2xl font-bold mt-1 text-red-500">{stats ? stats.overdueCount : 0}</p>
          </div>
        </section>

        {overdueCount > 0 ? (
          <section>
            <div className="bg-red-600 text-white p-5 rounded-2xl shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-white">warning</span>
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-bold">{overdueCount} Overdue Task{overdueCount === 1 ? '' : 's'} Need Attention</p>
                  <p className="text-sm text-white/90">
                    {overdueAssetSummary
                      ? `Maintenance window exceeded for ${overdueAssetSummary}. Safety risks identified.`
                      : `Maintenance window exceeded for ${overdueCount} asset${overdueCount === 1 ? '' : 's'}. Safety risks identified.`}
                  </p>
                  <button
                    onClick={() => navigate('/tasks?tab=overdue')}
                    className="mt-2 inline-flex items-center justify-center rounded-full bg-white text-red-600 text-sm font-semibold px-4 py-2"
                  >
                    Resolve Now
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Quick Actions */}
        <section>
          <h2 className="text-slate-900 dark:text-white font-bold text-lg mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void onScanQr()}
              disabled={scanLoading}
              className="flex items-center gap-3 p-4 bg-primary text-white rounded-xl shadow-md active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined">qr_code_scanner</span>
              <span className="font-semibold">{scanLoading ? 'Scanning…' : 'Scan QR'}</span>
            </button>
            <button onClick={() => navigate('/tasks?assigned=me')} className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-primary">assignment_turned_in</span>
              <span className="font-semibold">My Tasks</span>
              {myOutstandingCount > 0 ? (
                <span
                  className="ml-auto min-w-[1.25rem] h-5 px-1 rounded-full bg-rose-600 text-white text-[12px] leading-5 font-bold text-center"
                  aria-label={`${myOutstandingCount} outstanding task${myOutstandingCount === 1 ? '' : 's'}`}
                >
                  {myOutstandingCount > 99 ? '99+' : myOutstandingCount}
                </span>
              ) : null}
            </button>
            <button onClick={() => navigate('/assets')} className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-primary">search</span>
              <span className="font-semibold">Find Asset</span>
            </button>
            <button onClick={() => navigate('/offline')} className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-primary">cloud_off</span>
              <span className="font-semibold">Offline Mode</span>
            </button>
            <button onClick={() => navigate('/work-orders')} className="col-span-2 flex items-center justify-center gap-3 p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl shadow-sm active:scale-95 transition-transform">
              <span className="material-symbols-outlined">report_problem</span>
              <span className="font-bold uppercase tracking-wide text-sm">Report Breakdown</span>
            </button>
          </div>
        </section>

        {/* Recent Tasks */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-slate-900 dark:text-white font-bold text-lg">Recent Tasks</h2>
            <button onClick={() => navigate('/tasks')} className="text-primary text-sm font-semibold">View All</button>
          </div>
          <div className="space-y-3">
            {overview && overview.recentTasks.length > 0 ? (
              overview.recentTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigate(`/task/${task.id}`)}
                  className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
                      {task.asset.imageUrl ? (
                        <img src={task.asset.imageUrl} alt={task.asset.name ?? "Asset"} className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">image</span>
                      )}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate">{task.asset.name ?? task.asset.assetTag ?? task.template.name}</p>
                      <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300 text-xs">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">confirmation_number</span>
                          {task.taskNumber}
                        </span>
                        {task.asset.assetTag && (
                          <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <span className="material-symbols-outlined text-[14px]">precision_manufacturing</span>
                            {task.asset.assetTag}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{task.template.name}</p>
                    </div>
                  </div>
                  <span className="bg-primary/10 text-primary dark:text-primary/80 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                    {task.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <p>No recent tasks.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Home;
