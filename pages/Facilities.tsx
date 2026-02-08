import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiGetLookups, apiListFacilities, type Facility, type LookupLocation } from '../lib/api';

const pmPill = (f: Facility): { label: string; className: string } => {
  if (f.pm.enabled === true) return { label: 'PM Enabled', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' };
  if (f.pm.enabled === false) return { label: 'PM Disabled', className: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400' };
  return { label: 'PM Unknown', className: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400' };
};

const activePill = (f: Facility): { label: string; className: string } => {
  if (f.isActive) return { label: 'Active', className: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' };
  return { label: 'Inactive', className: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' };
};

const Facilities: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LookupLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiGetLookups();
        if (!cancelled) setLocations((res.locations ?? []).filter((l) => l.isActive));
      } catch {
        if (!cancelled) setLocations([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiListFacilities({
          page: 1,
          pageSize: 50,
          search: search.trim() ? search.trim() : undefined,
          locationId: selectedLocationId === 'all' ? undefined : selectedLocationId,
        });
        if (!cancelled) setFacilities(res.items);
      } catch {
        if (!cancelled) setError('Failed to load facilities');
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
  }, [search, selectedLocationId]);

  const locationChips = useMemo(() => [{ id: 'all', name: 'All' }, ...locations.map((l) => ({ id: l.id, name: l.name }))], [locations]);

  const onNavigate = (path: string) => {
    setMenuOpen(false);
    navigate(path);
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
                onClick={() => onNavigate('/assets')}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${location.pathname.startsWith('/assets') ? 'bg-primary text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined">inventory_2</span>
                Assets
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/facilities')}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${location.pathname.startsWith('/facilities') ? 'bg-primary text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined">domain</span>
                Facilities
              </button>
            </div>
          </div>
      </div>

      <div className="sticky top-0 left-0 right-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
        <div className="flex items-center p-4 pb-2 justify-between">
          <button type="button" className="text-primary flex size-10 items-center justify-center" onClick={() => setMenuOpen(true)}>
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
          <h2 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center">Facilities</h2>
          <div className="text-emerald-500 flex size-10 items-center justify-center">
            <span className="material-symbols-outlined text-2xl" title="Offline-first Synced">cloud_done</span>
          </div>
        </div>

        <div className="px-4 py-2">
          <label className="flex flex-col w-full">
            <div className="flex w-full items-stretch rounded-xl h-11 bg-slate-200/50 dark:bg-slate-800/50">
              <div className="text-slate-500 flex items-center justify-center pl-4">
                <span className="material-symbols-outlined text-xl">search</span>
              </div>
              <input
                className="flex w-full border-none bg-transparent focus:outline-0 focus:ring-0 h-full placeholder:text-slate-500 px-3 text-base font-normal"
                placeholder="Search facility name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
        </div>

        <div className="flex gap-2 p-4 overflow-x-auto hide-scrollbar">
          {locationChips.map((loc) => (
            <div
              key={loc.id}
              onClick={() => setSelectedLocationId(loc.id)}
              className={`flex h-9 shrink-0 items-center justify-center px-5 rounded-full cursor-pointer ${selectedLocationId === loc.id ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
            >
              <p className="text-sm font-medium">{loc.name}</p>
            </div>
          ))}
        </div>
      </div>

      <main className="px-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Facilities</h3>
        </div>

        {error ? (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : loading ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
        ) : facilities.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">No facilities found.</div>
        ) : (
          <div className="space-y-4">
            {facilities.map((f) => (
              <div key={f.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${activePill(f).className}`}>{activePill(f).label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pmPill(f).className}`}>{pmPill(f).label}</span>
                  </div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">{f.name}</h4>
                  <div className="flex items-center text-slate-500 dark:text-slate-400 mt-1">
                    <span className="material-symbols-outlined text-sm mr-1">location_on</span>
                    <span className="text-sm">{f.location?.name ?? '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Facilities;
