import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiCreateWorkOrder, apiListWorkOrders, type WorkOrderListItem } from '../lib/api';

type WorkOrderTab = 'open' | 'in_progress' | 'completed';

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  return date;
};

const statusPill = (status: string): { label: string; className: string } => {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'in_progress') return { label: 'In Progress', className: 'bg-primary/10 text-primary' };
  if (normalized === 'completed') return { label: 'Completed', className: 'bg-green-500/10 text-green-700 dark:text-green-400' };
  if (normalized === 'cancelled') return { label: 'Cancelled', className: 'bg-slate-200 dark:bg-slate-800 text-slate-500' };
  if (normalized === 'paused') return { label: 'Paused', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' };
  return { label: 'Open', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500' };
};

const impactPill = (impact: string | null): { label: string; className: string } | null => {
  if (!impact) return null;
  const normalized = impact.toLowerCase();
  if (normalized === 'critical') return { label: 'Critical', className: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' };
  if (normalized === 'high') return { label: 'High', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' };
  return { label: 'Normal', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500' };
};

const WorkOrders: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<WorkOrderTab>('open');
  const [items, setItems] = useState<WorkOrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState<'asset' | 'facility'>('asset');
  const [assetId, setAssetId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [symptom, setSymptom] = useState('');
  const [impactLevel, setImpactLevel] = useState('');
  const [failureCategory, setFailureCategory] = useState('');
  const [failureCode, setFailureCode] = useState('');
  const [downtimeStartedAt, setDowntimeStartedAt] = useState('');
  const [reportedChannel, setReportedChannel] = useState('mobile');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const report = searchParams.get('report');
    const asset = searchParams.get('assetId');
    const facility = searchParams.get('facilityId');
    if (report === '1') {
      setReportOpen(true);
      if (asset) {
        setReportMode('asset');
        setAssetId(asset);
        setFacilityId('');
      } else if (facility) {
        setReportMode('facility');
        setFacilityId(facility);
        setAssetId('');
      }
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const status = tab === 'completed' ? 'completed' : tab;
        const res = await apiListWorkOrders({ page: 1, pageSize: 50, assigned: 'me', status });
        if (!cancelled) setItems(res.items);
      } catch {
        if (!cancelled) setError('Failed to load work orders');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [tab]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((w) => {
      const assetLabel = w.asset?.assetTag ?? w.asset?.name ?? '';
      const facilityLabel = w.facility?.name ?? '';
      const number = w.taskNumber ?? '';
      const symptomText = w.symptom ?? '';
      return (
        assetLabel.toLowerCase().includes(q) ||
        facilityLabel.toLowerCase().includes(q) ||
        number.toLowerCase().includes(q) ||
        symptomText.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  const subjectFor = (w: WorkOrderListItem): string => {
    const label = w.asset?.assetTag ?? w.asset?.name ?? w.facility?.name ?? '';
    const symptomText = w.symptom ?? '';
    if (label && symptomText) return `${label} — ${symptomText}`;
    return symptomText || label || w.taskNumber;
  };

  const onOpenReport = (): void => {
    setReportOpen(true);
    setSubmitError(null);
  };

  const onCloseReport = (): void => {
    setReportOpen(false);
    setSubmitError(null);
    const next = new URLSearchParams(searchParams);
    next.delete('report');
    next.delete('assetId');
    next.delete('facilityId');
    setSearchParams(next);
  };

  const resetReportForm = (): void => {
    setSymptom('');
    setImpactLevel('');
    setFailureCategory('');
    setFailureCode('');
    setDowntimeStartedAt('');
    setReportedChannel('mobile');
    setSubmitError(null);
  };

  const onSubmitReport = async (): Promise<void> => {
    const symptomValue = symptom.trim();
    if (!symptomValue) {
      setSubmitError('Symptom is required');
      return;
    }
    const assetValue = reportMode === 'asset' ? assetId.trim() : '';
    const facilityValue = reportMode === 'facility' ? facilityId.trim() : '';
    if (reportMode === 'asset' && !assetValue) {
      setSubmitError('Asset ID is required');
      return;
    }
    if (reportMode === 'facility' && !facilityValue) {
      setSubmitError('Facility ID is required');
      return;
    }

    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await apiCreateWorkOrder({
        assetId: reportMode === 'asset' ? assetValue : undefined,
        facilityId: reportMode === 'facility' ? facilityValue : undefined,
        symptom: symptomValue,
        impactLevel: impactLevel ? (impactLevel as "normal" | "high" | "critical") : undefined,
        failureCategory: failureCategory.trim() || undefined,
        failureCode: failureCode.trim() || undefined,
        downtimeStartedAt: downtimeStartedAt ? new Date(downtimeStartedAt).toISOString() : undefined,
        reportedChannel: reportedChannel.trim() || undefined,
      });
      resetReportForm();
      onCloseReport();
      navigate(`/work-orders/${res.id}`);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to create work order';
      setSubmitError(message);
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 bg-background-light dark:bg-background-dark">
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">handyman</span>
            <h1 className="text-xl font-bold tracking-tight">Work Orders</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 text-base">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search work orders"
                className="h-10 rounded-full pl-9 pr-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <button onClick={onOpenReport} className="flex items-center justify-center bg-primary text-white size-10 rounded-full shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined">add</span>
            </button>
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="flex p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl">
            <button
              onClick={() => setTab('open')}
              className={`flex-1 py-1.5 text-sm font-semibold rounded-lg ${tab === 'open' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Open
            </button>
            <button
              onClick={() => setTab('in_progress')}
              className={`flex-1 py-1.5 text-sm font-semibold rounded-lg ${tab === 'in_progress' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 dark:text-slate-400'}`}
            >
              In Progress
            </button>
            <button
              onClick={() => setTab('completed')}
              className={`flex-1 py-1.5 text-sm font-semibold rounded-lg ${tab === 'completed' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Completed
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {loading ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">No work orders found.</div>
        ) : (
          filteredItems.map((w) => {
            const pill = statusPill(w.status ?? '');
            const impact = impactPill(w.impactLevel ?? null);
            const targetLabel = w.asset?.assetTag ?? w.asset?.name ?? w.facility?.name ?? '—';
            return (
              <button
                key={w.id}
                onClick={() => navigate(`/work-orders/${w.id}`)}
                className="w-full text-left bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start mb-3 gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{w.taskNumber}</span>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{subjectFor(w)}</h2>
                  </div>
                  {impact ? (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${impact.className}`}>
                      <span className="material-symbols-outlined text-sm">priority_high</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide">{impact.label}</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 mb-4 text-slate-600 dark:text-slate-400">
                  <span className="material-symbols-outlined text-base">precision_manufacturing</span>
                  <span className="text-sm font-medium">{w.asset ? 'Asset' : 'Facility'}: {targetLabel}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-50 dark:border-slate-800">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-slate-400 uppercase font-medium">Reported</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{formatDate(w.reportedAt ?? w.createdAt)}</span>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${pill.className}`}>
                    {pill.label === 'In Progress' ? <div className="size-1.5 rounded-full bg-primary animate-pulse"></div> : null}
                    <span className="text-xs font-semibold uppercase">{pill.label}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </main>

      {reportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl p-5 pb-8 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Report Breakdown</h2>
              <button onClick={onCloseReport} className="text-slate-500 dark:text-slate-400">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {submitError ? (
              <div className="mb-3 text-sm text-red-600 dark:text-red-400">{submitError}</div>
            ) : null}
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setReportMode('asset')}
                  className={`flex-1 h-10 rounded-lg text-sm font-semibold ${reportMode === 'asset' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                >
                  Asset
                </button>
                <button
                  onClick={() => setReportMode('facility')}
                  className={`flex-1 h-10 rounded-lg text-sm font-semibold ${reportMode === 'facility' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                >
                  Facility
                </button>
              </div>

              {reportMode === 'asset' ? (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Asset ID</label>
                  <input
                    value={assetId}
                    onChange={(e) => setAssetId(e.target.value)}
                    placeholder="Asset ID"
                    className="mt-2 w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Facility ID</label>
                  <input
                    value={facilityId}
                    onChange={(e) => setFacilityId(e.target.value)}
                    placeholder="Facility ID"
                    className="mt-2 w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Symptom</label>
                <textarea
                  value={symptom}
                  onChange={(e) => setSymptom(e.target.value)}
                  placeholder="Describe the issue"
                  className="mt-2 w-full min-h-[90px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Impact Level</label>
                <select
                  value={impactLevel}
                  onChange={(e) => setImpactLevel(e.target.value)}
                  className="mt-2 w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                >
                  <option value="">Select impact</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Failure Category</label>
                  <input
                    value={failureCategory}
                    onChange={(e) => setFailureCategory(e.target.value)}
                    placeholder="Category"
                    className="mt-2 w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Failure Code</label>
                  <input
                    value={failureCode}
                    onChange={(e) => setFailureCode(e.target.value)}
                    placeholder="Code"
                    className="mt-2 w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Downtime Started</label>
                <input
                  type="datetime-local"
                  value={downtimeStartedAt}
                  onChange={(e) => setDowntimeStartedAt(e.target.value)}
                  className="mt-2 w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Reported Channel</label>
                <input
                  value={reportedChannel}
                  onChange={(e) => setReportedChannel(e.target.value)}
                  className="mt-2 w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={onCloseReport}
                className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={onSubmitReport}
                disabled={submitLoading}
                className="flex-[2] h-12 rounded-xl bg-primary text-white font-semibold shadow-lg shadow-primary/30 disabled:opacity-70"
              >
                {submitLoading ? 'Submitting…' : 'Create Work Order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WorkOrders;
