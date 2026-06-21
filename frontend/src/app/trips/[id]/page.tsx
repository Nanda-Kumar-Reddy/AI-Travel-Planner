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
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { ScoreRing, FlagChips } from '../../../components/risk/RiskComponents';
import { api, ApiError } from '../../../lib/api';
import { formatDate, cn } from '../../../lib/utils';
import type { Trip, Activity, ItineraryDay, DayDiff } from '../../../../../shared/src/index';

// ── Types ─────────────────────────────────────────────────────────────────────
type RiskFlag = Trip['riskFlags'][number];

// ── Budget chart colours ──────────────────────────────────────────────────────
const BUDGET_COLORS = {
  Transport: '#6366F1', Accommodation: '#F59E0B', Food: '#10B981', Activities: '#8B5CF6',
};

function usd(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const steps = 40;
    let step = 0;
    const id = setInterval(() => {
      step++;
      setVal(Math.round(start + diff * (step / steps)));
      if (step >= steps) { setVal(target); prev.current = target; clearInterval(id); }
    }, duration / steps);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

// ── Risk flag panel (expandable chips with Fix This) ──────────────────────────
interface RiskPanelProps {
  flags: RiskFlag[];
  tripId: string;
  onFixed: (trip: Trip, diff: DayDiff) => void;
}

function RiskPanel({ flags, tripId, onFixed }: RiskPanelProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [fixingIdx, setFixingIdx] = useState<number | null>(null);
  const [fixError, setFixError] = useState('');

  if (!flags.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-risk-low">
        <ShieldCheck className="w-4 h-4" />
        <span>No risk flags — looking good!</span>
      </div>
    );
  }

  const SEV_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' } as const;
  const SEV_BG = { high: 'bg-risk-high/10 border-risk-high/25', medium: 'bg-amber-400/10 border-amber-400/25', low: 'bg-risk-low/10 border-risk-low/25' };
  const TYPE_ICON = { pacing: '🗺️', budget: '💸', weather: '🌧️' };

  const handleFix = async (flag: RiskFlag, idx: number) => {
    if (flag.dayNumber == null) return; // trip-level flag, no day to regenerate
    setFixingIdx(idx);
    setFixError('');
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
    } finally {
      setFixingIdx(null);
    }
  };

  return (
    <div className="space-y-2">
      {flags.map((flag, idx) => {
        const color = SEV_COLOR[flag.severity as keyof typeof SEV_COLOR] ?? '#6B7280';
        const isExpanded = expandedIdx === idx;
        const isFixing = fixingIdx === idx;
        const canFix = flag.dayNumber != null;

        return (
          <div key={flag._id ?? idx}
            className={cn('rounded-xl border transition-all', SEV_BG[flag.severity as keyof typeof SEV_BG] ?? 'bg-surface-2 border-border')}>
            {/* Chip header */}
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
              <span className="text-base shrink-0">{TYPE_ICON[flag.type as keyof typeof TYPE_ICON] ?? '⚠️'}</span>
              <span className="flex-1 text-xs font-medium leading-snug" style={{ color }}>
                {flag.message}
              </span>
              {isExpanded
                ? <ChevronUp className="w-3.5 h-3.5 text-text-muted shrink-0" />
                : <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />}
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-current/10">
                {flag.suggestedFix && (
                  <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                    <span className="font-semibold text-text-primary">Fix: </span>
                    {flag.suggestedFix}
                  </p>
                )}
                {fixError && <p className="text-xs text-risk-high">{fixError}</p>}
                {canFix && (
                  <button
                    id={`fix-flag-${idx}`}
                    onClick={() => handleFix(flag, idx)}
                    disabled={isFixing}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: `${color}20`,
                      color,
                      border: `1px solid ${color}40`,
                    }}>
                    {isFixing
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Fixing Day {flag.dayNumber}…</>
                      : <><Wrench className="w-3.5 h-3.5" />Fix This (Day {flag.dayNumber})</>}
                  </button>
                )}
              </div>
            )}
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
  const [error, setError] = useState('');
  const total = useCountUp(budget?.total ?? 0);

  const handleRefresh = async () => {
    setError(''); setIsRefreshing(true);
    try {
      const { estimatedBudget } = await api.post<{ estimatedBudget: Trip['estimatedBudget'] }>(`/api/trips/${tripId}/budget/refresh`, {});
      onRefreshed(estimatedBudget);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Refresh failed.'); }
    finally { setIsRefreshing(false); }
  };

  if (!budget) return null;
  const chartData = [
    { name: 'Transport', value: budget.transport },
    { name: 'Accommodation', value: budget.accommodation },
    { name: 'Food', value: budget.food },
    { name: 'Activities', value: budget.activities },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) =>
    active && payload?.length ? (
      <div className="bg-surface border border-border rounded-lg px-3 py-2 text-sm shadow-xl">
        <p className="font-semibold text-text-primary">{payload[0].name}</p>
        <p className="text-accent font-bold">{usd(payload[0].value)}</p>
      </div>
    ) : null;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-text-primary flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber-400" /> Estimated Budget
        </h2>
        <button onClick={handleRefresh} disabled={isRefreshing} className="btn-ghost gap-1.5 text-xs py-1.5 px-3" id="refresh-budget-btn">
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="text-xs text-risk-high">{error}</p>}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" innerRadius="55%" outerRadius="80%"
              paddingAngle={3} startAngle={90} endAngle={-270}
              animationBegin={0} animationDuration={900} isAnimationActive>
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
          <div className="font-display text-2xl font-bold text-amber-400 tabular-nums">{usd(total)}</div>
          <div className="text-xs text-text-muted">total</div>
        </div>
      </div>
      <div className="space-y-2">
        {chartData.map(({ name, value }) => (
          <div key={name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: BUDGET_COLORS[name as keyof typeof BUDGET_COLORS] }} />
              <span className="text-text-secondary">{name}</span>
            </span>
            <span className="text-text-primary font-semibold tabular-nums">{usd(value)}</span>
          </div>
        ))}
      </div>
      <div className="pt-3 border-t border-border flex justify-between items-center">
        <span className="text-sm font-medium text-text-secondary">Total</span>
        <span className="font-display text-lg font-bold text-amber-400">{usd(budget.total)}</span>
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

  const tierStyles: Record<string, { badge: string }> = {
    Budget: { badge: 'bg-risk-low/15 text-risk-low border-risk-low/30' },
    'Mid-Range': { badge: 'bg-accent/15 text-accent border-accent/30' },
    Luxury: { badge: 'bg-amber-400/15 text-amber-400 border-amber-400/30' },
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-text-primary flex items-center gap-2">
          <Hotel className="w-4 h-4 text-accent" /> Hotels
        </h2>
        <button onClick={handleRefresh} disabled={isRefreshing} className="btn-ghost gap-1.5 text-xs py-1.5 px-3" id="refresh-hotels-btn">
          <Sparkles className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Updating…' : 'New Picks'}
        </button>
      </div>
      {error && <p className="text-xs text-risk-high">{error}</p>}
      {isRefreshing
        ? <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-surface-2 border border-border"/>)}</div>
        : <div className="space-y-3">
            {hotels?.map((hotel, i) => {
              const s = tierStyles[hotel.tier] ?? tierStyles['Mid-Range'];
              return (
                <div key={i} className="p-4 rounded-xl bg-surface-2 border border-border">
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <h3 className="font-display font-semibold text-sm text-text-primary">{hotel.name}</h3>
                    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0', s.badge)}>{hotel.tier}</span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed mb-2">{hotel.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-muted">{usd(hotel.pricePerNightUSD)}/night</span>
                    {hotel.rating && <span className="text-xs text-amber-400 font-semibold">★ {hotel.rating.toFixed(1)}</span>}
                  </div>
                </div>
              );
            })}
          </div>}
    </div>
  );
}

// ── Activity card ─────────────────────────────────────────────────────────────
const TIME_ICON = { Morning: Sun, Afternoon: Sunset, Evening: Moon };
const TIME_COLOR = { Morning: 'text-amber-400', Afternoon: 'text-accent', Evening: 'text-purple-400' };

interface ActivityCardProps {
  activity: Activity; tripId: string; dayNumber: number;
  isHighlighted: boolean; onRemoved: (t: Trip) => void;
}
function ActivityCard({ activity, tripId, dayNumber, isHighlighted, onRemoved }: ActivityCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [isGone, setIsGone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  if (isGone) return null;

  const Icon = TIME_ICON[activity.timeOfDay] ?? Sun;

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const { trip } = await api.delete<{ trip: Trip }>(`/api/trips/${tripId}/days/${dayNumber}/activities/${activity._id}`);
      setIsGone(true);
      setTimeout(() => onRemoved(trip), 300);
    } catch { setIsRemoving(false); setShowConfirm(false); }
  };

  return (
    <div className={cn(
      'group relative flex gap-3 p-4 rounded-xl bg-surface-2 border transition-all duration-500',
      isHighlighted ? 'border-risk-low shadow-[0_0_0_2px_rgba(34,197,94,0.25)] animate-pulse-once' : 'border-border hover:border-accent/30',
      isRemoving ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
    )}>
      {isHighlighted && (
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-risk-low text-white text-[10px] font-bold shadow-sm">NEW</span>
      )}
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', TIME_COLOR[activity.timeOfDay])} strokeWidth={1.5} />
        <div className="w-px flex-1 bg-border min-h-[12px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-display font-semibold text-sm text-text-primary leading-tight">{activity.title}</h4>
          <span className="text-xs text-amber-400 font-medium shrink-0">
            {activity.estimatedCostUSD === 0 ? 'Free' : usd(activity.estimatedCostUSD)}
          </span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">{activity.description}</p>
        <span className="mt-1.5 inline-block text-xs text-text-muted bg-surface border border-border px-2 py-0.5 rounded-full">{activity.timeOfDay}</span>
      </div>
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {!showConfirm
          ? <button onClick={() => setShowConfirm(true)} disabled={isRemoving} className="p-1.5 rounded-lg text-text-muted hover:text-risk-high hover:bg-risk-high/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          : <div className="flex flex-col gap-1">
              <button onClick={handleRemove} disabled={isRemoving} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-risk-high text-white">{isRemoving ? '…' : 'Remove'}</button>
              <button onClick={() => setShowConfirm(false)} className="px-2 py-1 rounded-md text-[11px] text-text-muted">Cancel</button>
            </div>}
      </div>
    </div>
  );
}

// ── Add activity form ─────────────────────────────────────────────────────────
interface AddActivityFormProps { tripId: string; dayNumber: number; onAdded: (t: Trip) => void; onCancel: () => void }
function AddActivityForm({ tripId, dayNumber, onAdded, onCancel }: AddActivityFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [costUSD, setCostUSD] = useState('0');
  const [timeOfDay, setTimeOfDay] = useState<Activity['timeOfDay']>('Morning');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setError(''); setIsSubmitting(true);
    try {
      const { trip } = await api.post<{ trip: Trip }>(`/api/trips/${tripId}/days/${dayNumber}/activities`,
        { title: title.trim(), description: description.trim(), estimatedCostUSD: Number(costUSD), timeOfDay });
      onAdded(trip);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed.'); setIsSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">New Activity</span>
        <button type="button" onClick={onCancel}><X className="w-4 h-4 text-text-muted hover:text-text-primary" /></button>
      </div>
      {error && <p className="text-xs text-risk-high">{error}</p>}
      <input type="text" className="input text-sm" placeholder="Activity title *" value={title} onChange={e => setTitle(e.target.value)} autoFocus disabled={isSubmitting} />
      <textarea className="input text-sm resize-none" placeholder="Description (optional)" rows={2} value={description} onChange={e => setDescription(e.target.value)} disabled={isSubmitting} />
      <div className="flex gap-2">
        <select className="input text-sm flex-1" value={timeOfDay} onChange={e => setTimeOfDay(e.target.value as Activity['timeOfDay'])} disabled={isSubmitting}>
          <option>Morning</option><option>Afternoon</option><option>Evening</option>
        </select>
        <input type="number" className="input text-sm flex-1" placeholder="Cost (USD)" value={costUSD} onChange={e => setCostUSD(e.target.value)} min="0" disabled={isSubmitting} />
      </div>
      <button type="submit" disabled={isSubmitting || !title.trim()} className="btn-primary w-full justify-center text-sm py-2">
        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {isSubmitting ? 'Adding…' : 'Add Activity'}
      </button>
    </form>
  );
}

// ── Regen sheet ───────────────────────────────────────────────────────────────
interface RegenSheetProps { tripId: string; dayNumber: number; onSuccess: (t: Trip, d: DayDiff) => void; onClose: () => void }
function RegenSheet({ tripId, dayNumber, onSuccess, onClose }: RegenSheetProps) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) { setError('Please describe what you want to change.'); return; }
    setError(''); setIsSubmitting(true);
    try {
      const r = await api.post<{ trip: Trip; diff: DayDiff }>(`/api/trips/${tripId}/days/${dayNumber}/regenerate`, { userFeedback: feedback.trim() });
      onSuccess(r.trip, r.diff);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed.'); setIsSubmitting(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 bg-surface border-t border-border rounded-t-2xl p-6 space-y-4 shadow-2xl max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-text-primary">Regenerate Day {dayNumber}</h3>
            <p className="text-xs text-text-muted mt-0.5">Gemini will create a fresh plan from your feedback</p>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="btn-ghost p-2"><X className="w-5 h-5" /></button>
        </div>
        {error && <div role="alert" className="px-4 py-3 rounded-lg bg-risk-high/10 border border-risk-high/25 text-risk-high text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea className="input resize-none w-full" rows={3}
            placeholder="e.g. Make it more outdoor-focused, replace museums with parks and hikes…"
            value={feedback} onChange={e => setFeedback(e.target.value)} disabled={isSubmitting} autoFocus />
          <button type="submit" disabled={isSubmitting || !feedback.trim()} className="btn-primary w-full justify-center">
            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />Regenerating…</> : <><Send className="w-4 h-4" />Regenerate Day {dayNumber}</>}
          </button>
        </form>
      </div>
    </>
  );
}

// ── Day shimmer ───────────────────────────────────────────────────────────────
function DayShimmer() {
  return (
    <div className="space-y-2 ml-11 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-surface-2 border border-border" />)}
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

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent text-white font-display font-bold text-sm flex items-center justify-center shrink-0">{day.dayNumber}</div>
          <h3 className="font-display font-semibold text-text-primary">Day {day.dayNumber}</h3>
          <span className="text-xs text-text-muted">{dayTotal === 0 ? 'Free' : usd(dayTotal)} est.</span>
        </div>
        <button onClick={() => onRegenerateRequest(day.dayNumber)} className="btn-ghost gap-1.5 text-xs py-1.5 px-3">
          <RefreshCw className="w-3.5 h-3.5" />Regenerate
        </button>
      </div>
      <div className="space-y-2 ml-11">
        {day.activities.map((activity, i) => (
          <ActivityCard key={activity._id ?? i} activity={activity} tripId={trip._id}
            dayNumber={day.dayNumber} isHighlighted={changedIds.has(activity._id ?? '')}
            onRemoved={onTripUpdate} />
        ))}
        {showAddForm
          ? <AddActivityForm tripId={trip._id} dayNumber={day.dayNumber}
              onAdded={t => { onTripUpdate(t); setShowAddForm(false); }} onCancel={() => setShowAddForm(false)} />
          : <button onClick={() => setShowAddForm(true)}
              className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-border text-text-muted hover:border-accent/50 hover:text-accent transition-colors text-sm">
              <Plus className="w-4 h-4" />Add activity
            </button>}
      </div>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function TripDetailContent() {
  const params = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [prevScore, setPrevScore] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [regenSheetDay, setRegenSheetDay] = useState<number | null>(null);
  const [regenLoadingDay, setRegenLoadingDay] = useState<number | null>(null);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
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

  if (isLoading) return <div className="min-h-screen bg-void flex items-center justify-center"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  if (error || !trip) return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-4">
      <p className="text-risk-high">{error || 'Trip not found.'}</p>
      <Link href="/dashboard" className="btn-secondary">← Back</Link>
    </div>
  );

  const score = trip.confidenceScore ?? 100;

  return (
    <div className="min-h-screen bg-void">
      {regenSheetDay !== null && (
        <RegenSheet tripId={trip._id} dayNumber={regenSheetDay}
          onSuccess={handleRegenSuccess} onClose={() => setRegenSheetDay(null)} />
      )}

      {/* Sticky header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="btn-ghost p-2 shrink-0"><ArrowLeft className="w-4 h-4" /></Link>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-text-primary truncate">{trip.destination}</h1>
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{trip.durationDays}d</span>
                {trip.startDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(trip.startDate)}</span>}
                {trip.destinationLat != null && <span className="hidden sm:flex items-center gap-1"><MapPin className="w-3 h-3" />{trip.destinationLat.toFixed(2)}°, {trip.destinationLng?.toFixed(2)}°</span>}
              </div>
            </div>
          </div>
          {/* Header score ring */}
          <div className="flex items-center gap-2 shrink-0">
            <ScoreRing score={score} size={48} strokeWidth={5} fromScore={prevScore} />
            <div className="hidden sm:block text-xs text-text-muted leading-tight">
              <p className="font-semibold" style={{ color: score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444' }}>
                {score >= 80 ? 'Excellent' : score >= 60 ? 'Review flags' : 'Action needed'}
              </p>
              <p>{trip.riskFlags?.length ?? 0} flag{(trip.riskFlags?.length ?? 0) !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Itinerary */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-text-primary">Itinerary</h2>
              <span className="text-sm text-text-muted">{trip.itinerary.length} days</span>
            </div>
            {trip.itinerary.map(day =>
              regenLoadingDay === day.dayNumber ? (
                <section key={day.dayNumber}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-accent text-white font-display font-bold text-sm flex items-center justify-center">{day.dayNumber}</div>
                    <h3 className="font-display font-semibold text-text-primary">Day {day.dayNumber}</h3>
                    <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                    <span className="text-xs text-text-muted">Regenerating…</span>
                  </div>
                  <DayShimmer />
                </section>
              ) : (
                <DaySection key={day.dayNumber} day={day} trip={trip} changedIds={changedIds}
                  onTripUpdate={handleTripUpdate} onRegenerateRequest={setRegenSheetDay} />
              )
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Risk co-pilot panel */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-text-primary flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> Risk Co-Pilot
                </h2>
                <ScoreRing score={score} size={44} strokeWidth={4} fromScore={prevScore} />
              </div>
              <FlagChips flags={(trip.riskFlags ?? []) as Array<{ type: string; severity: string }>} />
              <RiskPanel flags={trip.riskFlags as RiskFlag[]} tripId={trip._id}
                onFixed={(updatedTrip, diff) => handleRegenSuccess(updatedTrip, diff)} />
            </div>

            <BudgetBreakdown budget={trip.estimatedBudget}
              tripId={trip._id} onRefreshed={b => setTrip(prev => prev ? { ...prev, estimatedBudget: b } : prev)} />
            <HotelsPanel hotels={trip.hotels} tripId={trip._id}
              onRefreshed={h => setTrip(prev => prev ? { ...prev, hotels: h } : prev)} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TripDetailPage() {
  return <ProtectedRoute><TripDetailContent /></ProtectedRoute>;
}
