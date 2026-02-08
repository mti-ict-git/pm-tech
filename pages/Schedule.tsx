import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGetSchedulingCalendar, apiGetSchedulingDay, type SchedulingCalendarItem, type SchedulingDayItem } from '../lib/api';

const Schedule: React.FC = () => {
  const navigate = useNavigate();

  const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const [mode, setMode] = useState<'month' | 'week' | 'day' | 'upcoming'>('month');
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [calendarItems, setCalendarItems] = useState<SchedulingCalendarItem[]>([]);
  const [dayItems, setDayItems] = useState<SchedulingDayItem[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthKey = useMemo(() => {
    const y = monthDate.getFullYear();
    const m = String(monthDate.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [monthDate]);

  const selectedKey = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingCalendar(true);
      setError(null);
      try {
        const res = await apiGetSchedulingCalendar(monthKey);
        if (!cancelled) setCalendarItems(res.items);
      } catch {
        if (!cancelled) setError('Failed to load calendar');
      } finally {
        if (!cancelled) setLoadingCalendar(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingDay(true);
      setError(null);
      try {
        const res = await apiGetSchedulingDay(selectedKey);
        if (!cancelled) setDayItems(res.items);
      } catch {
        if (!cancelled) setError('Failed to load day schedule');
      } finally {
        if (!cancelled) setLoadingDay(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const calendarByDate = useMemo(() => {
    const map = new Map<string, { hasScheduled: boolean; hasDue: boolean; hasOverdue: boolean; total: number }> ();
    for (const it of calendarItems) {
      const prev = map.get(it.date) ?? { hasScheduled: false, hasDue: false, hasOverdue: false, total: 0 };
      map.set(it.date, {
        hasScheduled: prev.hasScheduled || it.type === 'scheduled',
        hasDue: prev.hasDue || it.type === 'due',
        hasOverdue: prev.hasOverdue || it.type === 'overdue',
        total: prev.total + it.count,
      });
    }
    return map;
  }, [calendarItems]);

  const daysInMonth = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const last = new Date(year, month + 1, 0);
    return last.getDate();
  }, [monthDate]);

  const startOffset = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    return new Date(year, month, 1).getDay();
  }, [monthDate]);

  const monthLabel = useMemo(() => {
    return monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [monthDate]);

  const selectedLabel = useMemo(() => {
    return selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, [selectedDate]);

  const formatTime = (iso: string): { time: string; ampm: string } => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { time: '—', ampm: '' };
    const hrs = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const h12 = hrs % 12 === 0 ? 12 : hrs % 12;
    const time = `${String(h12).padStart(2, '0')}:${mins}`;
    return { time, ampm };
  };

  const isUuid = (value: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  };

  const goPrevMonth = (): void => {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const goNextMonth = (): void => {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const onPickDay = (day: number): void => {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    setSelectedDate(next);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-white dark:bg-slate-900">
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">offline_pin</span>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Offline Ready</span>
          </div>
          <h2 className="text-lg font-bold leading-tight">Schedule</h2>
          <div className="flex items-center gap-3">
            <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <span className="material-symbols-outlined">search</span>
            </button>
            <button onClick={() => navigate('/tasks')} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <span className="material-symbols-outlined">list</span>
            </button>
          </div>
        </div>
        
        {/* View Toggle */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
          <button onClick={() => navigate('/tasks')} className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 rounded-lg">
            <span className="material-symbols-outlined text-lg">format_list_bulleted</span>
            List
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold bg-white dark:bg-slate-700 text-primary dark:text-white rounded-lg shadow-sm">
            <span className="material-symbols-outlined text-lg material-symbols-filled">calendar_month</span>
            Calendar
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
          <button onClick={() => setMode('month')} className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap ${mode === 'month' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium'}`}>Month</button>
          <button onClick={() => setMode('week')} className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap ${mode === 'week' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium'}`}>Week</button>
          <button onClick={() => setMode('day')} className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap ${mode === 'day' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium'}`}>Day</button>
          <button onClick={() => setMode('upcoming')} className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap ${mode === 'upcoming' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium'}`}>Upcoming</button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24">
        {/* Calendar Grid */}
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 my-2">
          <div className="flex items-center justify-between mb-4">
            <button onClick={goPrevMonth} className="p-2 text-slate-400"><span className="material-symbols-outlined">chevron_left</span></button>
            <h3 className="font-bold text-lg">{monthLabel}</h3>
            <button onClick={goNextMonth} className="p-2 text-slate-400"><span className="material-symbols-outlined">chevron_right</span></button>
          </div>
          <div className="grid grid-cols-7 gap-y-2 text-center">
            {weekDays.map(day => (
              <div key={day} className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{day}</div>
            ))}

            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`empty-${i}`} className="h-10" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dayKey = `${monthKey}-${String(day).padStart(2, '0')}`;
              const meta = calendarByDate.get(dayKey);
              const now = new Date();
              const isToday =
                day === now.getDate() &&
                monthDate.getMonth() === now.getMonth() &&
                monthDate.getFullYear() === now.getFullYear();
              const isSelected = dayKey === selectedKey;
              const hasEvent = meta ? meta.total > 0 : false;
              const hasOverdue = meta ? meta.hasOverdue : false;
              const hasDue = meta ? meta.hasDue : false;

              let btnClass =
                'h-10 w-full flex items-center justify-center text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 relative';
              if (isToday) btnClass = 'h-10 w-full flex items-center justify-center text-sm font-bold rounded-lg bg-primary text-white shadow-lg shadow-primary/30';
              if (isSelected) btnClass = 'h-10 w-full flex items-center justify-center text-sm font-bold rounded-lg border-2 border-primary text-primary bg-primary/10';
              if (hasEvent && !isSelected && !isToday) btnClass += hasOverdue || hasDue ? ' border-2 border-[#f59e0b]' : ' border-2 border-primary/30';

              return (
                <button key={dayKey} onClick={() => onPickDay(day)} className={btnClass} disabled={loadingCalendar}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Tasks */}
        <div className="flex items-center justify-between mt-6 mb-4">
          <h3 className="text-lg font-bold">Tasks on {selectedLabel}</h3>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">{dayItems.length} Scheduled</span>
        </div>

        <div className="space-y-3">
          {error ? (
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : loadingDay ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
          ) : dayItems.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">No tasks scheduled for this day.</div>
          ) : (
            dayItems.map((t) => {
              const { time, ampm } = formatTime(t.scheduledDueAt);
              const borderColor = t.bucket === 'overdue' ? 'border-status-red' : t.bucket === 'due' ? 'border-[#f59e0b]' : 'border-primary';
              const priorityClass =
                t.priority.toLowerCase() === 'high'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
              const statusDot =
                t.status.toLowerCase() === 'in_progress'
                  ? 'bg-[#10b981]'
                  : t.bucket === 'overdue'
                    ? 'bg-status-red'
                    : 'bg-slate-300';
              const statusTextClass =
                t.status.toLowerCase() === 'in_progress'
                  ? 'text-[#10b981]'
                  : t.bucket === 'overdue'
                    ? 'text-status-red'
                    : 'text-slate-500';
              const title = t.asset.name || t.asset.assetTag || t.template.name;
              const canOpen = isUuid(t.id);
              const onOpen = () => {
                if (!canOpen) return;
                navigate(`/task/${t.id}`);
              };

              return (
                <div
                  key={t.id}
                  onClick={onOpen}
                  className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border-l-4 ${borderColor} border-t border-r border-b border-slate-100 dark:border-slate-800 flex items-start gap-4 ${canOpen ? 'cursor-pointer' : 'opacity-70'}`}
                >
                  <div className="flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 min-w-[70px]">
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{time}</span>
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{ampm}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">{title}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${priorityClass}`}>{t.priority}</span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">settings_input_component</span>
                      {t.asset.assetTag ? `Asset: ${t.asset.assetTag}` : 'Asset'}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${statusDot}`}></div>
                        <span className={`text-xs font-medium ${statusTextClass}`}>{t.bucket === 'due' ? 'Due Today' : t.bucket === 'overdue' ? 'Overdue' : t.status.replace('_', ' ')}</span>
                      </div>
                      <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
      
      {/* Bottom Nav placeholder logic is handled by global nav, but schedule page in design has a specific nav. 
          For consistency with my App structure, I won't duplicate the nav here if I use Layout.
          However, the Schedule page might be used standalone. 
          Given the route setup, it's inside Layout, so BottomNav is present. 
          I will remove the duplicated nav code here and rely on Layout.tsx. 
      */}
    </div>
  );
};

export default Schedule;
