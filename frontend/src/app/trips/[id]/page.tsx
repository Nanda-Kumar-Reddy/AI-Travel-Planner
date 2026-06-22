'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft, MapPin, Calendar, Clock, DollarSign, Hotel, Sun, Sunset, Moon,
  AlertTriangle, Loader2, Trash2, Plus, RefreshCw, X, Send, Sparkles,
  ChevronDown, ChevronUp, Wrench, ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { ScoreRing, FlagChips } from '../../../components/risk/RiskComponents';
import { ThemeToggle } from '../../../components/theme/ThemeToggle';
import { api, ApiError } from '../../../lib/api';
import { formatDate, cn } from '../../../lib/utils';
import type { Trip, Activity, ItineraryDay, DayDiff } from '../../../../../shared/src/index';

// ── Types ─────────────────────────────────────────────────────────────────────
type RiskFlag = Trip['riskFlags'][number];

// ── Budget chart colours ──────────────────────────────────────────────────────
const BUDGET_COLORS = {
  Transport:     '#6366F1',
  Accommodation: '#F59E0B',
  Food:          '#10B981',
  Activities:    '#8B5CF6',
};

function usd(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900, skip = false) {
  const [val, setVal] = useState(skip ? target : 0);
  const prev = useRef(0);
  useEffect(() => {
    if (skip) { setVal(target); prev.current = target; return; }
    const start = prev.current;
    const diff  = target - start;
    if (diff === 0) return;
    const steps = 40;
    let step = 0;
    const id = setInterval(() => {
      step++;
      setVal(Math.round(start + diff * (step / steps)));
      if (step >= steps) { setVal(target); prev.current = target; clearInterval(id); }
    }, duration / steps);
    return () => clearInterval(id);
  }, [target, duration, skip]);
  return val;
}

// ── Risk flag panel ───────────────────────────────────────────────────────────
interface RiskPanelProps {
  flags: RiskFlag[];
  tripId: string;
  onFixed: (trip: Trip, diff: DayDiff) => void;
}

function RiskPanel({ flags, tripId, onFixed }: RiskPanelProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [fixingIdx,   setFixingIdx]   = useState<number | null>(null);
  const [fixError,    setFixError]    = useState('');
  const prefersReduced = useReducedMotion();

  if (!flags.length) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-risk-low)' }}>
        <ShieldCheck size={15} />
        <span>No risk flags — looking good!</span>
      </div>
    );
  }

  const SEV_BG: Record<string, string> = {
    high:   'bg-[rgba(var(--color-risk-high-rgb),0.08)] border-[rgba(var(--color-risk-high-rgb),0.22)]',
    medium: 'bg-[rgba(var(--color-risk-medium-rgb),0.08)] border-[rgba(var(--color-risk-medium-rgb),0.22)]',
    low:    'bg-[rgba(var(--color-risk-low-rgb),0.08)] border-[rgba(var(--color-risk-low-rgb),0.22)]',
  };
  const SEV_CSS: Record<string, string> = {
    high:   'var(--color-risk-high)',
    medium: 'var(--color-risk-medium)',
    low:    'var(--color-risk-low)',
  };
  const TYPE_ICON: Record<string, string> = { pacing: '🗺️', budget: '💸', weather: '🌧️' };

  const handleFix = async (flag: RiskFlag, idx: number) => {
    if (flag.dayNumber == null) return;
    setFixingIdx(idx); setFixError('');
    try {
      const riskContext = [flag.message, flag.suggestedFix].filter(Boolean).join(' — ');
      const result = await api.post<{ trip: Trip; diff: DayDiff }>(
        `/api/trips/${tripId}/days/${flag.dayNumber}/regenerate`,
        { riskContext }
      );
      setExpandedIdx(null);
      onFixed(result.trip, result.diff);
    } catch (err) {
      setFixError(err instanceof ApiError ? err.message : 'Fix failed. Try again.');
    } finally { setFixingIdx(null); }
  };

  return (
    <div className="space-y-2">
      {flags.map((flag, idx) => {
        const color     = SEV_CSS[flag.severity] ?? 'var(--color-text-muted)';
        const isExpanded = expandedIdx === idx;
        const isFixing   = fixingIdx === idx;
        const canFix     = flag.dayNumber != null;

        return (
          <div
            key={flag._id ?? idx}
            className={cn('rounded-xl border transition-all', SEV_BG[flag.severity] ?? 'border-[var(--color-border)]')}
          >
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
              aria-expanded={isExpanded}
            >
              <span className="text-base shrink-0">{TYPE_ICON[flag.type] ?? '⚠️'}</span>
              <span className="flex-1 text-xs font-medium leading-snug" style={{ color }}>
                {flag.message}
              </span>
              {isExpanded
                ? <ChevronUp size={13} style={{ color: 'var(--color-text-muted)' }} className="shrink-0" />
                : <ChevronDown size={13} style={{ color: 'var(--color-text-muted)' }} className="shrink-0" />
              }
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={
                    prefersReduced
                      ? { duration: 0.1 }
                      : { type: 'spring', stiffness: 300, damping: 28 }
                  }
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-3 border-t border-current/10">
                    {flag.suggestedFix && (
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Fix: </span>
                        {flag.suggestedFix}
                      </p>
                    )}
                    {fixError && <p className="text-xs" style={{ color: 'var(--color-risk-high)' }}>{fixError}</p>}
                    {canFix && (
                      <button
                        id={`fix-flag-${idx}`}
                        onClick={() => handleFix(flag, idx)}
                        disabled={isFixing}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: `rgba(${flag.severity === 'high'
                            ? 'var(--color-risk-high-rgb)'
                            : flag.severity === 'medium'
                              ? 'var(--color-risk-medium-rgb)'
                              : 'var(--color-risk-low-rgb)'}, 0.12)`,
                          color,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        {isFixing
                          ? <><Loader2 size={13} className="animate-spin" />Fixing Day {flag.dayNumber}…</>
                          : <><Wrench size={13} />Fix This (Day {flag.dayNumber})</>}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ── Budget breakdown donut ────────────────────────────────────────────────────
interface BudgetBreakdownProps {
  budget: Trip['estimatedBudget'];
  tripId: string;
  onRefreshed: (b: Trip['estimatedBudget']) => void;
}
function BudgetBreakdown({ budget, tripId, onRefreshed }: BudgetBreakdownProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]               = useState('');
  const prefersReduced = useReducedMotion();
  const total = useCountUp(budget?.total ?? 0, 900, prefersReduced ?? false);

  const handleRefresh = async () => {
    setError(''); setIsRefreshing(true);
    try {
      const { estimatedBudget } = await api.post<{ estimatedBudget: Trip['estimatedBudget'] }>(
        `/api/trips/${tripId}/budget/refresh`, {}
      );
      onRefreshed(estimatedBudget);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Refresh failed.'); }
    finally { setIsRefreshing(false); }
  };

  if (!budget) return null;
  const chartData = [
    { name: 'Transport',     value: budget.transport },
    { name: 'Accommodation', value: budget.accommodation },
    { name: 'Food',          value: budget.food },
    { name: 'Activities',    value: budget.activities },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) =>
    active && payload?.length ? (
      <div
        className="rounded-lg px-3 py-2 text-sm shadow-xl"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      >
        <p className="font-semibold">{payload[0].name}</p>
        <p className="font-bold" style={{ color: 'var(--color-accent-warm)' }}>{usd(payload[0].value)}</p>
      </div>
    ) : null;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <DollarSign size={15} style={{ color: 'var(--color-accent-warm)' }} /> Estimated Budget
        </h2>
        <button onClick={handleRefresh} disabled={isRefreshing} className="btn-ghost gap-1.5 text-xs py-1.5 px-3" id="refresh-budget-btn">
          <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--color-risk-high)' }}>{error}</p>}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" innerRadius="55%" outerRadius="80%"
              paddingAngle={3} startAngle={90} endAngle={-270}
              animationBegin={0} animationDuration={prefersReduced ? 0 : 900} isAnimationActive={!prefersReduced}>
              {chartData.map(({ name }) => (
                <Cell key={name} fill={BUDGET_COLORS[name as keyof typeof BUDGET_COLORS]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="relative -mt-32 mb-20 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="font-display text-2xl font-bold tabular-nums" style={{ color: 'var(--color-accent-warm)' }}>{usd(total)}</div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>total</div>
        </div>
      </div>
      <div className="space-y-2">
        {chartData.map(({ name, value }) => (
          <div key={name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: BUDGET_COLORS[name as keyof typeof BUDGET_COLORS] }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>{name}</span>
            </span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{usd(value)}</span>
          </div>
        ))}
      </div>
      <div className="pt-3 border-t flex justify-between items-center" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Total</span>
        <span className="font-display text-lg font-bold" style={{ color: 'var(--color-accent-warm)' }}>{usd(budget.total)}</span>
      </div>
    </div>
  );
}

// ── Hotels panel ──────────────────────────────────────────────────────────────
interface HotelsPanelProps { hotels: Trip['hotels']; tripId: string; onRefreshed: (h: Trip['hotels']) => void }
function HotelsPanel({ hotels, tripId, onRefreshed }: HotelsPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const handleRefresh = async () => {
    setError(''); setIsRefreshing(true);
    try {
      const { hotels: h } = await api.post<{ hotels: Trip['hotels'] }>(`/api/trips/${tripId}/hotels`, {});
      onRefreshed(h);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed.'); }
    finally { setIsRefreshing(false); }
  };

  const tierStyles: Record<string, string> = {
    Budget:     'text-[var(--color-risk-low)] bg-[rgba(var(--color-risk-low-rgb),0.10)] border-[rgba(var(--color-risk-low-rgb),0.28)]',
    'Mid-Range':'text-[var(--color-accent)] bg-[rgba(var(--color-accent-rgb),0.10)] border-[rgba(var(--color-accent-rgb),0.25)]',
    Luxury:     'text-[var(--color-accent-warm)] bg-[rgba(245,158,11,0.10)] border-[rgba(245,158,11,0.28)]',
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Hotel size={15} style={{ color: 'var(--color-accent)' }} /> Hotels
        </h2>
        <button onClick={handleRefresh} disabled={isRefreshing} className="btn-ghost gap-1.5 text-xs py-1.5 px-3" id="refresh-hotels-btn">
          <Sparkles size={13} className={cn(isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Updating…' : 'New Picks'}
        </button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--color-risk-high)' }}>{error}</p>}
      {isRefreshing
        ? <div className="space-y-3 animate-pulse">
            {[1,2,3].map(i => (
              <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }} />
            ))}
          </div>
        : <div className="space-y-3">
            {hotels?.map((hotel, i) => (
              <div key={i} className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{hotel.name}</h3>
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0', tierStyles[hotel.tier] ?? tierStyles['Mid-Range'])}>
                    {hotel.tier}
                  </span>
                </div>
                <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--color-text-secondary)' }}>{hotel.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{usd(hotel.pricePerNightUSD)}/night</span>
                  {hotel.rating && <span className="text-xs font-semibold" style={{ color: 'var(--color-accent-warm)' }}>★ {hotel.rating.toFixed(1)}</span>}
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ── Activity card ─────────────────────────────────────────────────────────────
const TIME_ICON  = { Morning: Sun, Afternoon: Sunset, Evening: Moon };
const TIME_COLOR = {
  Morning:   'var(--color-accent-warm)',
  Afternoon: 'var(--color-accent)',
  Evening:   '#a78bfa',
};

interface ActivityCardProps {
  activity: Activity; tripId: string; dayNumber: number;
  isHighlighted: boolean; onRemoved: (t: Trip) => void;
}
function ActivityCard({ activity, tripId, dayNumber, isHighlighted, onRemoved }: ActivityCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [isGone, setIsGone]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const prefersReduced = useReducedMotion();
  if (isGone) return null;

  const Icon = TIME_ICON[activity.timeOfDay] ?? Sun;

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const { trip } = await api.delete<{ trip: Trip }>(`/api/trips/${tripId}/days/${dayNumber}/activities/${activity._id}`);
      setIsGone(true);
      setTimeout(() => onRemoved(trip), prefersReduced ? 0 : 300);
    } catch { setIsRemoving(false); setShowConfirm(false); }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: prefersReduced ? 0 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={prefersReduced
        ? { opacity: 0 }
        : { opacity: 0, x: -10, scale: 0.97, transition: { duration: 0.2 } }
      }
      transition={prefersReduced
        ? { duration: 0.15 }
        : { type: 'spring', stiffness: 300, damping: 26 }
      }
      className={cn(
        'group relative flex gap-3 p-4 rounded-xl border transition-colors duration-300',
        isHighlighted
          ? 'animate-pulse-once'
          : '',
      )}
      style={{
        background: 'var(--color-surface-2)',
        borderColor: isHighlighted ? 'var(--color-risk-low)' : 'var(--color-border)',
        boxShadow: isHighlighted ? '0 0 0 2px rgba(var(--color-risk-low-rgb), 0.25)' : undefined,
        opacity: isRemoving ? 0.4 : 1,
        transform: isRemoving ? 'scale(0.97)' : undefined,
      }}
    >
      {isHighlighted && (
        <span
          className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm"
          style={{ background: 'var(--color-risk-low)', color: '#fff' }}
        >
          NEW
        </span>
      )}
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        <Icon size={13} style={{ color: TIME_COLOR[activity.timeOfDay] }} strokeWidth={1.5} />
        <div className="w-px flex-1 min-h-[12px]" style={{ background: 'var(--color-border)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-display font-semibold text-sm leading-tight" style={{ color: 'var(--color-text-primary)' }}>
            {activity.title}
          </h4>
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--color-accent-warm)' }}>
            {activity.estimatedCostUSD === 0 ? 'Free' : usd(activity.estimatedCostUSD)}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {activity.description}
        </p>
        <span
          className="mt-1.5 inline-block text-xs px-2 py-0.5 rounded-full"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          {activity.timeOfDay}
        </span>
      </div>
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {!showConfirm
          ? <button
              onClick={() => setShowConfirm(true)}
              disabled={isRemoving}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Trash2 size={13} />
            </button>
          : <div className="flex flex-col gap-1">
              <button
                onClick={handleRemove}
                disabled={isRemoving}
                className="px-2 py-1 rounded-md text-[11px] font-semibold text-white"
                style={{ background: 'var(--color-risk-high)' }}
              >
                {isRemoving ? '…' : 'Remove'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-2 py-1 rounded-md text-[11px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Cancel
              </button>
            </div>
        }
      </div>
    </motion.div>
  );
}

// ── Add activity form ─────────────────────────────────────────────────────────
interface AddActivityFormProps { tripId: string; dayNumber: number; onAdded: (t: Trip) => void; onCancel: () => void }
function AddActivityForm({ tripId, dayNumber, onAdded, onCancel }: AddActivityFormProps) {
  const [title, setTitle]         = useState('');
  const [description, setDescription] = useState('');
  const [costUSD, setCostUSD]     = useState('0');
  const [timeOfDay, setTimeOfDay] = useState<Activity['timeOfDay']>('Morning');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setError(''); setIsSubmitting(true);
    try {
      const { trip } = await api.post<{ trip: Trip }>(
        `/api/trips/${tripId}/days/${dayNumber}/activities`,
        { title: title.trim(), description: description.trim(), estimatedCostUSD: Number(costUSD), timeOfDay }
      );
      onAdded(trip);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed.'); setIsSubmitting(false); }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="p-4 rounded-xl space-y-3"
      style={{
        border: '2px dashed rgba(99,102,241,0.4)',
        background: 'rgba(99,102,241,0.04)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
          New Activity
        </span>
        <button type="button" onClick={onCancel}>
          <X size={15} style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--color-risk-high)' }}>{error}</p>}
      <input type="text" className="input text-sm" placeholder="Activity title *" value={title} onChange={e => setTitle(e.target.value)} autoFocus disabled={isSubmitting} />
      <textarea className="input text-sm resize-none" placeholder="Description (optional)" rows={2} value={description} onChange={e => setDescription(e.target.value)} disabled={isSubmitting} />
      <div className="flex gap-2">
        <select className="input text-sm flex-1" value={timeOfDay} onChange={e => setTimeOfDay(e.target.value as Activity['timeOfDay'])} disabled={isSubmitting}>
          <option>Morning</option><option>Afternoon</option><option>Evening</option>
        </select>
        <input type="number" className="input text-sm flex-1" placeholder="Cost (USD)" value={costUSD} onChange={e => setCostUSD(e.target.value)} min="0" disabled={isSubmitting} />
      </div>
      <button type="submit" disabled={isSubmitting || !title.trim()} className="btn-primary w-full justify-center text-sm py-2">
        {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        {isSubmitting ? 'Adding…' : 'Add Activity'}
      </button>
    </motion.form>
  );
}

// ── Regen sheet ───────────────────────────────────────────────────────────────
interface RegenSheetProps { tripId: string; dayNumber: number; onSuccess: (t: Trip, d: DayDiff) => void; onClose: () => void }
function RegenSheet({ tripId, dayNumber, onSuccess, onClose }: RegenSheetProps) {
  const [feedback, setFeedback]       = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]             = useState('');
  const prefersReduced = useReducedMotion();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) { setError('Please describe what you want to change.'); return; }
    setError(''); setIsSubmitting(true);
    try {
      const r = await api.post<{ trip: Trip; diff: DayDiff }>(
        `/api/trips/${tripId}/days/${dayNumber}/regenerate`,
        { userFeedback: feedback.trim() }
      );
      onSuccess(r.trip, r.diff);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed.'); setIsSubmitting(false); }
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 inset-x-0 z-50 p-6 space-y-4 shadow-2xl max-w-2xl mx-auto rounded-t-2xl"
        style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={
          prefersReduced
            ? { duration: 0.15 }
            : { type: 'spring', stiffness: 350, damping: 32 }
        }
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Regenerate Day {dayNumber}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Trao will create a fresh plan from your feedback
            </p>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="btn-ghost p-2">
            <X size={18} />
          </button>
        </div>
        {error && (
          <div
            role="alert"
            className="px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'rgba(var(--color-risk-high-rgb), 0.08)',
              border: '1px solid rgba(var(--color-risk-high-rgb), 0.25)',
              color: 'var(--color-risk-high)',
            }}
          >
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            className="input resize-none w-full" rows={3}
            placeholder="e.g. Make it more outdoor-focused, replace museums with parks and hikes…"
            value={feedback} onChange={e => setFeedback(e.target.value)}
            disabled={isSubmitting} autoFocus
          />
          <button type="submit" disabled={isSubmitting || !feedback.trim()} className="btn-primary w-full justify-center">
            {isSubmitting
              ? <><Loader2 size={15} className="animate-spin" />Regenerating…</>
              : <><Send size={15} />Regenerate Day {dayNumber}</>}
          </button>
        </form>
      </motion.div>
    </>
  );
}

// ── Day shimmer ───────────────────────────────────────────────────────────────
function DayShimmer() {
  return (
    <div className="space-y-2 ml-11 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }} />
      ))}
    </div>
  );
}

// ── Day section ───────────────────────────────────────────────────────────────
interface DaySectionProps {
  day: ItineraryDay; trip: Trip; changedIds: Set<string>;
  onTripUpdate: (t: Trip) => void; onRegenerateRequest: (n: number) => void;
}
function DaySection({ day, trip, changedIds, onTripUpdate, onRegenerateRequest }: DaySectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const dayTotal = day.activities.reduce((s, a) => s + a.estimatedCostUSD, 0);
  const prefersReduced = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: prefersReduced ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReduced
          ? { duration: 0.15 }
          : { type: 'spring', stiffness: 240, damping: 24 }
      }
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg font-display font-bold text-sm flex items-center justify-center shrink-0 text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            {day.dayNumber}
          </div>
          <h3 className="font-display font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Day {day.dayNumber}
          </h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {dayTotal === 0 ? 'Free' : usd(dayTotal)} est.
          </span>
        </div>
        <button onClick={() => onRegenerateRequest(day.dayNumber)} className="btn-ghost gap-1.5 text-xs py-1.5 px-3">
          <RefreshCw size={13} /> Regenerate
        </button>
      </div>
      <div className="space-y-2 ml-11">
        <AnimatePresence mode="popLayout">
          {day.activities.map((activity, i) => (
            <ActivityCard
              key={activity._id ?? i}
              activity={activity} tripId={trip._id}
              dayNumber={day.dayNumber}
              isHighlighted={changedIds.has(activity._id ?? '')}
              onRemoved={onTripUpdate}
            />
          ))}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {showAddForm
            ? <AddActivityForm
                key="form"
                tripId={trip._id} dayNumber={day.dayNumber}
                onAdded={t => { onTripUpdate(t); setShowAddForm(false); }}
                onCancel={() => setShowAddForm(false)}
              />
            : <motion.button
                key="add-btn"
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center gap-2 p-3 rounded-xl text-sm transition-colors"
                style={{
                  border: '1px dashed var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
                whileHover={prefersReduced ? {} : { borderColor: 'rgba(99,102,241,0.5)', color: 'var(--color-accent)' }}
              >
                <Plus size={15} /> Add activity
              </motion.button>
          }
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

// ── Mobile Risk Co-Pilot accordion ────────────────────────────────────────────
function MobileRiskAccordion({ trip, onFixed }: { trip: Trip; onFixed: (t: Trip, d: DayDiff) => void }) {
  const [open, setOpen] = useState(false);
  const score = trip.confidenceScore ?? 100;
  const prefersReduced = useReducedMotion();

  return (
    <div className="card lg:hidden mb-5">
      <button
        className="w-full flex items-center justify-between p-4"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} style={{ color: 'var(--color-accent-warm)' }} />
          <span className="font-display font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
            Risk Co-Pilot
          </span>
          {(trip.riskFlags?.length ?? 0) > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(var(--color-risk-high-rgb),0.12)', color: 'var(--color-risk-high)' }}
            >
              {trip.riskFlags.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ScoreRing score={score} size={36} strokeWidth={3.5} />
          {open
            ? <ChevronUp size={15} style={{ color: 'var(--color-text-muted)' }} />
            : <ChevronDown size={15} style={{ color: 'var(--color-text-muted)' }} />
          }
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={prefersReduced ? { duration: 0.1 } : { type: 'spring', stiffness: 280, damping: 26 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <FlagChips flags={(trip.riskFlags ?? []) as Array<{ type: string; severity: string }>} />
              <RiskPanel
                flags={trip.riskFlags as RiskFlag[]}
                tripId={trip._id}
                onFixed={onFixed}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function TripDetailContent() {
  const params = useParams<{ id: string }>();
  const [trip,          setTrip]          = useState<Trip | null>(null);
  const [prevScore,     setPrevScore]     = useState<number | undefined>(undefined);
  const [isLoading,     setIsLoading]     = useState(true);
  const [error,         setError]         = useState('');
  const [regenSheetDay, setRegenSheetDay] = useState<number | null>(null);
  const [regenLoadingDay, setRegenLoadingDay] = useState<number | null>(null);
  const [changedIds,    setChangedIds]    = useState<Set<string>>(new Set());
  const diffTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      try {
        const { trip: data } = await api.get<{ trip: Trip }>(`/api/trips/${params.id}`);
        setTrip(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load trip.');
      } finally { setIsLoading(false); }
    })();
    return () => { if (diffTimerRef.current) clearTimeout(diffTimerRef.current); };
  }, [params.id]);

  const clearDiff = () => {
    if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
    diffTimerRef.current = setTimeout(() => setChangedIds(new Set()), 4000);
  };

  const handleRegenSuccess = (updatedTrip: Trip, diff: DayDiff) => {
    setRegenSheetDay(null);
    setRegenLoadingDay(diff.dayNumber);
    setTimeout(() => {
      setPrevScore(trip?.confidenceScore);
      setTrip(updatedTrip);
      setRegenLoadingDay(null);
      setChangedIds(new Set(diff.changedActivityIds));
      clearDiff();
    }, 600);
  };

  const handleTripUpdate = (updated: Trip) => {
    setPrevScore(trip?.confidenceScore);
    setTrip(updated);
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-void)' }}>
      <Loader2 size={30} style={{ color: 'var(--color-accent)' }} className="animate-spin" />
    </div>
  );

  if (error || !trip) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--color-void)' }}>
      <p style={{ color: 'var(--color-risk-high)' }}>{error || 'Trip not found.'}</p>
      <Link href="/dashboard" className="btn-secondary">← Back</Link>
    </div>
  );

  const score = trip.confidenceScore ?? 100;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-void)' }}>
      <AnimatePresence>
        {regenSheetDay !== null && (
          <RegenSheet
            key="regen-sheet"
            tripId={trip._id} dayNumber={regenSheetDay}
            onSuccess={handleRegenSuccess} onClose={() => setRegenSheetDay(null)}
          />
        )}
      </AnimatePresence>

      {/* Sticky header */}
      <header className="nav-glass sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="btn-ghost p-2 shrink-0">
              <ArrowLeft size={15} />
            </Link>
            <div className="min-w-0">
              <h1 className="font-display font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>
                {trip.destination}
              </h1>
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <span className="flex items-center gap-1"><Clock size={10} />{trip.durationDays}d</span>
                {trip.startDate && (
                  <span className="flex items-center gap-1"><Calendar size={10} />{formatDate(trip.startDate)}</span>
                )}
                {trip.destinationLat != null && (
                  <span className="hidden sm:flex items-center gap-1">
                    <MapPin size={10} />{trip.destinationLat.toFixed(2)}°, {trip.destinationLng?.toFixed(2)}°
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ScoreRing score={score} size={48} strokeWidth={5} fromScore={prevScore} />
            <div className="hidden sm:block text-xs leading-tight" style={{ color: 'var(--color-text-muted)' }}>
              <p className="font-semibold" style={{ color: score >= 80 ? 'var(--color-risk-low)' : score >= 60 ? 'var(--color-risk-medium)' : 'var(--color-risk-high)' }}>
                {score >= 80 ? 'Excellent' : score >= 60 ? 'Review flags' : 'Action needed'}
              </p>
              <p>{trip.riskFlags?.length ?? 0} flag{(trip.riskFlags?.length ?? 0) !== 1 ? 's' : ''}</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Mobile Risk Co-Pilot — accordion above itinerary */}
        <MobileRiskAccordion
          trip={trip}
          onFixed={(updatedTrip, diff) => handleRegenSuccess(updatedTrip, diff)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Itinerary — takes 2/3 on desktop */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Itinerary
              </h2>
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {trip.itinerary.length} days
              </span>
            </div>
            <motion.div
              className="space-y-8"
              variants={{
                show: { transition: { staggerChildren: 0.07 } },
                hidden: {},
              }}
              initial="hidden"
              animate="show"
            >
              {trip.itinerary.map(day =>
                regenLoadingDay === day.dayNumber ? (
                  <section key={day.dayNumber}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg font-display font-bold text-sm flex items-center justify-center text-white" style={{ background: 'var(--color-accent)' }}>
                        {day.dayNumber}
                      </div>
                      <h3 className="font-display font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Day {day.dayNumber}
                      </h3>
                      <Loader2 size={13} style={{ color: 'var(--color-accent)' }} className="animate-spin" />
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Regenerating…</span>
                    </div>
                    <DayShimmer />
                  </section>
                ) : (
                  <DaySection
                    key={day.dayNumber} day={day} trip={trip} changedIds={changedIds}
                    onTripUpdate={handleTripUpdate} onRegenerateRequest={setRegenSheetDay}
                  />
                )
              )}
            </motion.div>
          </div>

          {/* Desktop sidebar — hidden on mobile (mobile version above) */}
          <div className="hidden lg:block space-y-5">
            {/* Risk Co-Pilot */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--color-accent-warm)' }} /> Risk Co-Pilot
                </h2>
                <ScoreRing score={score} size={44} strokeWidth={4} fromScore={prevScore} />
              </div>
              <FlagChips flags={(trip.riskFlags ?? []) as Array<{ type: string; severity: string }>} />
              <RiskPanel
                flags={trip.riskFlags as RiskFlag[]}
                tripId={trip._id}
                onFixed={(updatedTrip, diff) => handleRegenSuccess(updatedTrip, diff)}
              />
            </div>

            <BudgetBreakdown
              budget={trip.estimatedBudget}
              tripId={trip._id}
              onRefreshed={b => setTrip(prev => prev ? { ...prev, estimatedBudget: b } : prev)}
            />
            <HotelsPanel
              hotels={trip.hotels}
              tripId={trip._id}
              onRefreshed={h => setTrip(prev => prev ? { ...prev, hotels: h } : prev)}
            />
          </div>

          {/* Mobile-only: budget + hotels below itinerary */}
          <div className="lg:hidden space-y-5">
            <BudgetBreakdown
              budget={trip.estimatedBudget}
              tripId={trip._id}
              onRefreshed={b => setTrip(prev => prev ? { ...prev, estimatedBudget: b } : prev)}
            />
            <HotelsPanel
              hotels={trip.hotels}
              tripId={trip._id}
              onRefreshed={h => setTrip(prev => prev ? { ...prev, hotels: h } : prev)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TripDetailPage() {
  return <ProtectedRoute><TripDetailContent /></ProtectedRoute>;
}
