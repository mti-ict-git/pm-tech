import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFindAssetIdByTag, apiGetAssetsUiSettings, apiGetLookups, apiListAssets, type Asset, type LookupAssetCategory } from '../lib/api';
import { scanQrCodeValue } from '../lib/qr';

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

const statusPill = (a: Asset): { label: string; className: string } => {
  const status = (a.assetStatus ?? '').trim().toLowerCase();
  if (status.includes('repair')) return { label: 'In Repair', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' };
  if (status.includes('down') || status.includes('broken')) return { label: 'Down', className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' };
  if (a.assetOperationalStatus === 'broken') return { label: 'Broken', className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' };
  if (a.assetOperationalStatus === 'archived') return { label: 'Archived', className: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400' };
  return { label: 'Operational', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' };
};

const statusPillRecent = (r: RecentAsset): { label: string; className: string } => {
  const status = (r.assetStatus ?? '').trim().toLowerCase();
  if (status.includes('repair')) return { label: 'In Repair', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' };
  if (status.includes('down') || status.includes('broken')) return { label: 'Down', className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' };
  if (r.assetOperationalStatus === 'broken') return { label: 'Broken', className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' };
  if (r.assetOperationalStatus === 'archived') return { label: 'Archived', className: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400' };
  return { label: 'Operational', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' };
};

const Assets: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const [categories, setCategories] = useState<LookupAssetCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [recentAssets, setRecentAssets] = useState<RecentAsset[]>(() => readRecentAssets());
  const [visibleCategoryIds, setVisibleCategoryIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [lookups, ui] = await Promise.all([apiGetLookups(), apiGetAssetsUiSettings()]);
        const visible = ui.visibleCategoryIds ?? null;
        const active = (lookups.assetCategories ?? []).filter((c) => c.isActive);
        const filtered =
          visible === null ? active : active.filter((c) => visible.includes(c.id));
        if (!cancelled) {
          setVisibleCategoryIds(visible);
          setCategories(filtered);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
          setVisibleCategoryIds(null);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedCategoryId === 'all') return;
    if (visibleCategoryIds === null) return;
    if (!visibleCategoryIds.includes(selectedCategoryId)) {
      setSelectedCategoryId('all');
    }
  }, [selectedCategoryId, visibleCategoryIds]);

  const showingResults = useMemo(() => {
    return search.trim().length > 0 || selectedCategoryId !== 'all';
  }, [search, selectedCategoryId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!showingResults) {
        setAssets([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await apiListAssets({
          page: 1,
          pageSize: 50,
          search: search.trim() ? search.trim() : undefined,
          categoryId: selectedCategoryId === 'all' ? undefined : selectedCategoryId,
          categoryIds: visibleCategoryIds ?? undefined,
        });
        if (!cancelled) setAssets(res.items);
      } catch {
        if (!cancelled) setError('Failed to load assets');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const handle = window.setTimeout(() => {
      void load();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [showingResults, search, selectedCategoryId]);

  const clearRecents = (): void => {
    setRecentAssets([]);
    writeRecentAssets([]);
  };

  const rememberAsset = (next: RecentAsset): void => {
    const updated = [next, ...recentAssets.filter((r) => r.id !== next.id)];
    setRecentAssets(updated);
    writeRecentAssets(updated);
  };

  const onOpenAssetFromList = (a: Asset): void => {
    rememberAsset({
      id: a.id,
      assetTag: a.assetTag,
      name: a.name,
      assetStatus: a.assetStatus,
      assetOperationalStatus: a.assetOperationalStatus,
      locationName: a.location.name ?? null,
      viewedAt: new Date().toISOString(),
    });
    navigate(`/asset/${a.id}`);
  };

  const onOpenRecent = (r: RecentAsset): void => {
    rememberAsset({ ...r, viewedAt: new Date().toISOString() });
    navigate(`/asset/${r.id}`);
  };

  const onScanAssetTag = async (): Promise<void> => {
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
    } finally {
      setScanLoading(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen pb-24">
      <div
        className={`fixed inset-0 z-[60] transition-opacity duration-200 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!menuOpen}
      >
        <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
        <div
          className={`absolute left-0 top-0 h-full w-72 bg-white dark:bg-slate-900 shadow-xl transform transition-transform duration-200 ease-out ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="text-lg font-bold">Menu</div>
              <button type="button" className="text-slate-500" onClick={() => setMenuOpen(false)}>
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>
            <div className="p-3 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/assets');
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${location.pathname.startsWith('/assets') ? 'bg-primary text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined">inventory_2</span>
                Assets
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/facilities');
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${location.pathname.startsWith('/facilities') ? 'bg-primary text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined">domain</span>
                Facilities
              </button>
            </div>
          </div>
      </div>
      {/* Header */}
      <div className="sticky top-0 left-0 right-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
        <div className="flex items-center p-4 pb-2 justify-between">
          <button type="button" className="text-primary flex size-10 items-center justify-center" onClick={() => setMenuOpen(true)}>
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
          <h2 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center">Asset Lookup</h2>
          <div className="text-emerald-500 flex size-10 items-center justify-center">
            <span className="material-symbols-outlined text-2xl" title="Offline-first Synced">cloud_done</span>
          </div>
        </div>
        
        {/* Search */}
        <div className="px-4 py-2">
          <label className="flex flex-col w-full">
            <div className="flex w-full items-stretch rounded-xl h-11 bg-slate-200/50 dark:bg-slate-800/50">
              <div className="text-slate-500 flex items-center justify-center pl-4">
                <span className="material-symbols-outlined text-xl">search</span>
              </div>
              <input 
                className="flex w-full border-none bg-transparent focus:outline-0 focus:ring-0 h-full placeholder:text-slate-500 px-3 text-base font-normal" 
                placeholder="Search asset tag, name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
        </div>

        {/* Categories */}
        <div className="flex gap-2 p-4 overflow-x-auto hide-scrollbar">
          <div onClick={() => setSelectedCategoryId('all')} className={`flex h-9 shrink-0 items-center justify-center px-5 rounded-full cursor-pointer ${selectedCategoryId === 'all' ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
            <p className="text-sm font-semibold">All</p>
          </div>
          {categories.map((cat) => (
            <div key={cat.id} onClick={() => setSelectedCategoryId(cat.id)} className={`flex h-9 shrink-0 items-center justify-center px-5 rounded-full cursor-pointer ${selectedCategoryId === cat.id ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
              <p className="text-sm font-medium">{cat.name}</p>
            </div>
          ))}
        </div>
      </div>

      <main className="px-4 mt-4">
        {/* Scan Button */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => void onScanAssetTag()}
            disabled={scanLoading}
            className="flex w-full cursor-pointer items-center justify-center rounded-xl h-14 bg-primary text-white gap-3 shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-2xl">qr_code_scanner</span>
            <span className="text-base font-bold tracking-wide">{scanLoading ? 'Scanning…' : 'Scan QR / Barcode'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{showingResults ? 'Results' : 'Recent Assets'}</h3>
          {!showingResults && recentAssets.length > 0 && (
            <button onClick={clearRecents} className="text-primary text-sm font-semibold">Clear All</button>
          )}
        </div>

        {error ? (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : loading ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
        ) : showingResults ? (
          assets.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">No assets found.</div>
          ) : (
            <div className="space-y-4">
              {assets.map((a) => (
                <div key={a.id} onClick={() => onOpenAssetFromList(a)} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between cursor-pointer active:bg-slate-50 dark:active:bg-slate-800">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">#{a.assetTag}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusPill(a).className}`}>{statusPill(a).label}</span>
                    </div>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-white">{a.name}</h4>
                    <div className="flex items-center text-slate-500 dark:text-slate-400 mt-1">
                      <span className="material-symbols-outlined text-sm mr-1">location_on</span>
                      <span className="text-sm">{a.location.name ?? '—'}</span>
                    </div>
                  </div>
                  <button className="size-10 flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded-lg text-primary">
                    <span className="material-symbols-outlined">qr_code_2</span>
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          recentAssets.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">No recent assets.</div>
          ) : (
            <div className="space-y-4">
              {recentAssets.map((r) => (
                <div key={r.id} onClick={() => onOpenRecent(r)} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between cursor-pointer active:bg-slate-50 dark:active:bg-slate-800">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">#{r.assetTag}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusPillRecent(r).className}`}>{statusPillRecent(r).label}</span>
                    </div>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-white">{r.name}</h4>
                    <div className="flex items-center text-slate-500 dark:text-slate-400 mt-1">
                      <span className="material-symbols-outlined text-sm mr-1">location_on</span>
                      <span className="text-sm">{r.locationName ?? '—'}</span>
                    </div>
                  </div>
                  <button className="size-10 flex items-center justify-center bg-slate-50 dark:bg-slate-800 rounded-lg text-primary">
                    <span className="material-symbols-outlined">qr_code_2</span>
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
};

export default Assets;
