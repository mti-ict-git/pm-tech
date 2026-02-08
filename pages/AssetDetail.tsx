import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiCreatePmNowTask, apiDownloadAssetImage, apiFindAssetIdByTag, apiGetAsset, apiGetAssetHistory, type Asset, type AssetHistoryItem } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';

const RECENT_ASSETS_KEY = 'pm_recent_assets_v1';

type RecentAsset = {
  id: string;
  assetTag: string;
  name: string;
  assetStatus: string | null;
  assetOperationalStatus: Asset['assetOperationalStatus'];
  locationName: string | null;
  viewedAt: string;
};

const readRecentAssets = (): RecentAsset[] => {
  try {
    const raw = window.localStorage.getItem(RECENT_ASSETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null))
      .filter((v): v is Record<string, unknown> => Boolean(v))
      .map((v) => ({
        id: String(v.id ?? ''),
        assetTag: String(v.assetTag ?? ''),
        name: String(v.name ?? ''),
        assetStatus: typeof v.assetStatus === 'string' ? v.assetStatus : null,
        assetOperationalStatus: (v.assetOperationalStatus === 'broken' || v.assetOperationalStatus === 'archived') ? (v.assetOperationalStatus as Asset['assetOperationalStatus']) : 'operational',
        locationName: typeof v.locationName === 'string' ? v.locationName : null,
        viewedAt: typeof v.viewedAt === 'string' ? v.viewedAt : new Date(0).toISOString(),
      }))
      .filter((v) => v.id && v.assetTag);
  } catch {
    return [];
  }
};

const writeRecentAssets = (items: RecentAsset[]): void => {
  try {
    window.localStorage.setItem(RECENT_ASSETS_KEY, JSON.stringify(items.slice(0, 12)));
  } catch {}
};

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
};

const formatDateTime = (value: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};

const AssetDetail: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const assetId = params.id as string;
  const { user } = useAuth();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [assetImageUrl, setAssetImageUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<AssetHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pmNowLoading, setPmNowLoading] = useState(false);

  const [scanSupported, setScanSupported] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!assetId) return;
      setLoading(true);
      setError(null);
      try {
        const [a, h] = await Promise.all([apiGetAsset(assetId), apiGetAssetHistory(assetId)]);
        if (!cancelled) {
          setAsset(a);
          setHistory(h);
          const next: RecentAsset = {
            id: a.id,
            assetTag: a.assetTag,
            name: a.name,
            assetStatus: a.assetStatus,
            assetOperationalStatus: a.assetOperationalStatus,
            locationName: a.location.name,
            viewedAt: new Date().toISOString(),
          };
          const prev = readRecentAssets();
          const updated = [next, ...prev.filter((r) => r.id !== a.id)];
          writeRecentAssets(updated);
        }
      } catch {
        if (!cancelled) setError('Failed to load asset');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) {
          if (active) setScanSupported(false);
          return;
        }
        const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
        const { supported } = await BarcodeScanner.isSupported();
        if (active) setScanSupported(Boolean(supported));
      } catch {
        if (active) setScanSupported(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!assetId) return;
    let active = true;
    let objectUrl: string | null = null;
    const loadImage = async (): Promise<void> => {
      const directUrl = asset?.imageUrl?.trim() ? asset.imageUrl : null;
      if (directUrl) {
        setAssetImageUrl(directUrl);
        return;
      }
      setAssetImageUrl(null);
      try {
        const res = await apiDownloadAssetImage(assetId);
        if (!active) return;
        objectUrl = URL.createObjectURL(res.blob);
        setAssetImageUrl(objectUrl);
      } catch {
        if (active) setAssetImageUrl(null);
      }
    };
    void loadImage();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, asset?.imageUrl]);

  const statusPill = useMemo(() => {
    const a = asset;
    if (!a) return { label: '—', className: 'bg-slate-100 text-slate-500' };
    const status = (a.assetStatus ?? '').trim().toLowerCase();
    if (status.includes('repair')) return { label: 'In Repair', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' };
    if (status.includes('down') || status.includes('broken')) return { label: 'Down', className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' };
    if (a.assetOperationalStatus === 'broken') return { label: 'Broken', className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' };
    if (a.assetOperationalStatus === 'archived') return { label: 'Archived', className: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400' };
    return { label: 'Operational', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' };
  }, [asset]);

  const upcomingPmLabel = useMemo(() => {
    const next = asset?.pm.nextDueAt ?? null;
    if (!next) return null;
    const d = new Date(next);
    if (Number.isNaN(d.getTime())) return null;
    const diffDays = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`;
    if (diffDays === 0) return 'Due today';
    return `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  }, [asset?.pm.nextDueAt]);

  const onReportBreakdown = (): void => {
    if (asset?.id) {
      navigate(`/work-orders?report=1&assetId=${encodeURIComponent(asset.id)}`);
      return;
    }
    navigate('/work-orders?report=1');
  };

  const canPmNow = useMemo(() => {
    const roles = user?.roles ?? [];
    return roles.includes('Supervisor') || roles.includes('Admin') || roles.includes('Superadmin');
  }, [user?.roles]);

  const pmNowDisabled = !asset?.pm.enabled || !asset?.pm.defaultTemplateId;

  const onPmNow = async (): Promise<void> => {
    if (!asset?.id) return;
    if (!asset.pm.enabled) {
      setError('PM is not enabled for this asset');
      return;
    }
    if (!asset.pm.defaultTemplateId) {
      setError('PM template is not configured for this asset');
      return;
    }

    setPmNowLoading(true);
    setError(null);
    try {
      const res = await apiCreatePmNowTask({ assetId: asset.id });
      navigate(`/task/${res.id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to start PM Now';
      setError(message);
    } finally {
      setPmNowLoading(false);
    }
  };

  const onScanQr = async (): Promise<void> => {
    setScanLoading(true);
    setError(null);
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        setError('QR scan is only available on Android app');
        return;
      }

      const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
      const { supported } = await BarcodeScanner.isSupported();
      if (!supported) {
        setError('QR scan is not supported on this device');
        return;
      }

      const perms = await BarcodeScanner.requestPermissions();
      if (perms.camera !== 'granted' && perms.camera !== 'limited') {
        setError('Camera permission is required to scan QR');
        return;
      }

      const res = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      const first = res.barcodes[0];
      const tag = first?.rawValue?.trim() ?? '';
      if (!tag) {
        setError('No QR detected');
        return;
      }

      const nextAssetId = await apiFindAssetIdByTag(tag);
      if (!nextAssetId) {
        setError(`Asset not found for tag: ${tag}`);
        return;
      }
      navigate(`/asset/${nextAssetId}`, { replace: true });
    } catch {
      setError('Failed to scan QR');
    } finally {
      setScanLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md p-4 pb-2 justify-between border-b border-slate-200 dark:border-slate-800">
        <div onClick={() => navigate(-1)} className="text-primary flex size-10 shrink-0 items-center justify-start cursor-pointer">
          <span className="material-symbols-outlined">arrow_back_ios</span>
        </div>
        <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">Asset Detail</h2>
        <div className="flex w-10 items-center justify-end">
          <button
            type="button"
            onClick={() => void onScanQr()}
            disabled={!scanSupported || scanLoading}
            className="text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Scan QR"
          >
            <span className="material-symbols-outlined">{scanLoading ? 'progress_activity' : 'qr_code_scanner'}</span>
          </button>
        </div>
      </div>

      <div className="p-4">
        {error && (
          <div className="mb-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        <div className="relative w-full aspect-video bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm group flex items-center justify-center">
          {assetImageUrl ? (
            <img
              src={assetImageUrl}
              alt={asset?.name ?? 'Asset'}
              className="w-full h-full object-contain"
              onError={() => setAssetImageUrl(null)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-4xl">photo</span>
            </div>
          )}
          <div className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${statusPill.className}`}>
            {statusPill.label}
          </div>
          <div className="absolute bottom-3 left-3 bg-black/40 backdrop-blur-sm text-white p-2 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">wifi_off</span>
            <span className="text-xs font-medium">Available Offline</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{asset?.name ?? (loading ? 'Loading…' : '—')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{asset?.location.name ?? '—'}</p>
        
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Asset Tag</p>
            <div className="flex items-center justify-between">
              <p className="text-slate-900 dark:text-white font-bold">#{asset?.assetTag ?? '—'}</p>
              <span className="material-symbols-outlined text-primary text-sm">content_copy</span>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Model</p>
            <p className="text-slate-900 dark:text-white font-bold truncate">{asset?.model ?? '—'}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm col-span-2">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Serial Number</p>
            <div className="flex items-center justify-between">
              <p className="text-slate-900 dark:text-white font-bold">{asset?.serialNumber ?? '—'}</p>
              <span className="material-symbols-outlined text-primary text-sm">qr_code_2</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 grid grid-cols-12 gap-3 mb-8">
        <button onClick={() => navigate('/work-orders')} className="col-span-6 bg-primary/10 dark:bg-primary/20 text-primary font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-active active:scale-95">
          <span className="material-symbols-outlined text-xl">add_task</span>
          <span>Work Order</span>
        </button>
        <button onClick={onReportBreakdown} className="col-span-6 bg-primary text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/30 transition-active active:scale-95">
          <span className="material-symbols-outlined text-xl">report_problem</span>
          <span>Breakdown</span>
        </button>
        {canPmNow ? (
          <button
            onClick={() => void onPmNow()}
            disabled={pmNowLoading || pmNowDisabled}
            className="col-span-12 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-sm border border-slate-200 dark:border-slate-800 transition-active active:scale-95 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-xl">flash_on</span>
            <span>{pmNowLoading ? 'Starting…' : 'PM Now'}</span>
          </button>
        ) : null}
      </div>

      <div className="px-4 mb-8">
        <div className="bg-indigo-600 rounded-xl p-5 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm font-medium mb-1">Upcoming Maintenance</p>
              <h3 className="text-xl font-bold">{asset?.pm.nextDueAt ? formatDate(asset.pm.nextDueAt) : '—'}</h3>
              <p className="text-indigo-200 text-xs mt-1 italic">{upcomingPmLabel ?? (asset?.pm.enabled ? 'No schedule' : 'PM disabled')}</p>
            </div>
            <div className="bg-white/20 p-3 rounded-full">
              <span className="material-symbols-outlined text-2xl">event_upcoming</span>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
        </div>
      </div>

      <div className="px-4 mb-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">PM History</h3>
          <button className="text-primary text-sm font-semibold">See All</button>
        </div>
        {loading ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
        ) : history.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">No PM history.</div>
        ) : (
          <div className="space-y-0">
            {history.slice(0, 10).map((h, idx) => {
              const isLast = idx === Math.min(history.length, 10) - 1;
              return (
                <div key={h.id} className={`relative flex gap-4 ${isLast ? '' : 'pb-8'}`}>
                  {!isLast && <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-800"></div>}
                  <div className="relative z-10 size-6 bg-green-500 rounded-full border-4 border-background-light dark:border-background-dark"></div>
                  <div onClick={() => navigate(`/task/${h.id}`)} className="flex-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm cursor-pointer active:bg-slate-50 dark:active:bg-slate-800">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">{h.type ?? 'PM Task'}</h4>
                      <span className="text-xs text-slate-400">{formatDate(h.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="size-5 rounded-full bg-slate-200 overflow-hidden"></div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{h.technician ?? '—'}</p>
                    </div>
                    <button className="text-primary text-xs font-bold flex items-center gap-1">
                      VIEW REPORT <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetDetail;
