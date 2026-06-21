'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Calendar, Clock, DollarSign,
  Hotel, Sun, Sunset, Moon, AlertTriangle, Loader2,
  CheckCircle, Trash2, Plus, RefreshCw, X, Send
} from 'lucide-react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { api, ApiError } from '../../../lib/api';
import { formatUSD, formatDate, getConfidenceColor, getConfidenceLabel, cn } from '../../../lib/utils';
import type { Trip, Activity, ItineraryDay, DayDiff } from '../../../../../shared/src/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TimeIcon({ time }: { time: Activity['timeOfDay'] }) {
  const icons = { Morning: Sun, Afternoon: Sunset, Evening: Moon };
  const colors = { Morning: 'text-amber-400', Afternoon: 'text-accent', Evening: 'text-purple-400' };
  const Icon = icons[time];
  return <Icon className={cn('w-3.5 h-3.5 shrink-0', colors[time])} strokeWidth={1.5} />;
}

function formatUSDLocal(n: number) {
  return n === 0 ? 'Free' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

// ─── Add Activity Form ────────────────────────────────────────────────────────
interface AddActivityFormProps {
  tripId: string;
  dayNumber: number;
  onAdded: (updatedTrip: Trip) => void;
  onCancel: () => void;
}

function AddActivityForm({ tripId, dayNumber, onAdded, onCancel }: AddActivityFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedCostUSD, setEstimatedCostUSD] = useState('0');
  const [timeOfDay, setTimeOfDay] = useState<Activity['timeOfDay']>('Morning');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setError('');
    setIsSubmitting(true);
    try {
      const { trip } = await api.post<{ trip: Trip }>(
        `/api/trips/${tripId}/days/${dayNumber}/activities`,
        { title: title.trim(), description: description.trim(), estimatedCostUSD: Number(estimatedCostUSD), timeOfDay }
      );
      onAdded(trip);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add activity.');
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 space-y-3 animate-fade-in"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">New Activity</span>
        <button type="button" onClick={onCancel} className="text-text-muted hover:text-text-primary">
          <X className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-xs text-risk-high">{error}</p>}
      <input
        type="text"
        className="input text-sm"
        placeholder="Activity title *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        disabled={isSubmitting}
      />
      <textarea
        className="input text-sm resize-none"
        placeholder="Description (optional)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isSubmitting}
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <select
            className="input text-sm"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value as Activity['timeOfDay'])}
            disabled={isSubmitting}
          >
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Evening</option>
          </select>
        </div>
        <div className="flex-1">
          <input
            type="number"
            className="input text-sm"
            placeholder="Cost (USD)"
            value={estimatedCostUSD}
            onChange={(e) => setEstimatedCostUSD(e.target.value)}
            min="0"
            disabled={isSubmitting}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={isSubmitting || !title.trim()}
        className="btn-primary w-full justify-center text-sm py-2"
      >
        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {isSubmitting ? 'Adding…' : 'Add Activity'}
      </button>
    </form>
  );
}

// ─── Regenerate Day Sheet ─────────────────────────────────────────────────────
interface RegenSheetProps {
  tripId: string;
  dayNumber: number;
  onSuccess: (updatedTrip: Trip, diff: DayDiff) => void;
  onClose: () => void;
}

function RegenSheet({ tripId, dayNumber, onSuccess, onClose }: RegenSheetProps) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) { setError('Please describe what you want to change.'); return; }
    setError('');
    setIsSubmitting(true);
    try {
      const result = await api.post<{ trip: Trip; diff: DayDiff }>(
        `/api/trips/${tripId}/days/${dayNumber}/regenerate`,
        { userFeedback: feedback.trim() }
      );
      onSuccess(result.trip, result.diff);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Regeneration failed. Try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      {/* Sheet */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-surface border-t border-border rounded-t-2xl p-6 space-y-5 animate-slide-up shadow-2xl max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-text-primary">Regenerate Day {dayNumber}</h3>
            <p className="text-xs text-text-muted mt-0.5">Gemini will create a new plan based on your feedback</p>
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="btn-ghost p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="px-4 py-3 rounded-lg bg-risk-high/10 border border-risk-high/25 text-risk-high text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              What should change?
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="e.g. Make it more outdoor-focused, replace indoor museums with parks and hiking…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !feedback.trim()}
            className="btn-primary w-full justify-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Regenerating with Gemini…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Regenerate Day {dayNumber}
              </>
            )}
          </button>
        </form>
      </div>
    </>
  );
}

// ─── Activity card (with remove + diff highlight) ─────────────────────────────
interface ActivityCardProps {
  activity: Activity;
  tripId: string;
  dayNumber: number;
  isHighlighted: boolean;
  onRemoved: (updatedTrip: Trip) => void;
}

function ActivityCard({ activity, tripId, dayNumber, isHighlighted, onRemoved }: ActivityCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [isGone, setIsGone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (isGone) return null;

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const { trip } = await api.delete<{ trip: Trip }>(
        `/api/trips/${tripId}/days/${dayNumber}/activities/${activity._id}`
      );
      // Animate out, then notify parent
      setIsGone(true);
      setTimeout(() => onRemoved(trip), 300);
    } catch {
      setIsRemoving(false);
      setShowConfirm(false);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex gap-3 p-4 rounded-xl bg-surface-2 border transition-all duration-500',
        isHighlighted
          ? 'border-risk-low shadow-[0_0_0_2px_rgba(34,197,94,0.3)] animate-pulse-once'
          : 'border-border hover:border-accent/30',
        isRemoving ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      )}
    >
      {/* Diff highlight label */}
      {isHighlighted && (
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-risk-low text-white text-[10px] font-bold">
          NEW
        </span>
      )}

      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        <TimeIcon time={activity.timeOfDay} />
        <div className="w-px flex-1 bg-border" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-display font-semibold text-sm text-text-primary leading-tight">
            {activity.title}
          </h4>
          <span className="text-xs text-amber-400 font-medium shrink-0">
            {formatUSDLocal(activity.estimatedCostUSD)}
          </span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">{activity.description}</p>
        <span className="mt-2 inline-block text-xs text-text-muted bg-surface border border-border px-2 py-0.5 rounded-full">
          {activity.timeOfDay}
        </span>
      </div>

      {/* Remove button */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isRemoving}
            className="p-1.5 rounded-lg text-text-muted hover:text-risk-high hover:bg-risk-high/10 transition-colors"
            aria-label="Remove activity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="flex flex-col gap-1">
            <button
              onClick={handleRemove}
              disabled={isRemoving}
              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-risk-high text-white"
            >
              {isRemoving ? '…' : 'Remove'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day section (with regenerate button + add activity form) ─────────────────
interface DaySectionProps {
  day: ItineraryDay;
  trip: Trip;
  changedIds: Set<string>;
  onTripUpdate: (t: Trip) => void;
  onRegenerateRequest: (dayNumber: number) => void;
}

function DaySection({ day, trip, changedIds, onTripUpdate, onRegenerateRequest }: DaySectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const dayTotal = day.activities.reduce((s, a) => s + a.estimatedCostUSD, 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
            {day.dayNumber}
          </div>
          <h3 className="font-display font-semibold text-text-primary">Day {day.dayNumber}</h3>
          <span className="text-xs text-text-muted">{formatUSDLocal(dayTotal)} est.</span>
        </div>
        <button
          onClick={() => onRegenerateRequest(day.dayNumber)}
          className="btn-ghost gap-1.5 text-xs py-1.5 px-3"
          title="Regenerate this day with AI"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerate
        </button>
      </div>

      <div className="space-y-2 ml-11">
        {day.activities.map((activity, i) => (
          <ActivityCard
            key={activity._id ?? i}
            activity={activity}
            tripId={trip._id}
            dayNumber={day.dayNumber}
            isHighlighted={changedIds.has(activity._id ?? '')}
            onRemoved={onTripUpdate}
          />
        ))}

        {showAddForm ? (
          <AddActivityForm
            tripId={trip._id}
            dayNumber={day.dayNumber}
            onAdded={(updated) => { onTripUpdate(updated); setShowAddForm(false); }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-border text-text-muted hover:border-accent/50 hover:text-accent transition-colors text-sm"
          >
            <Plus className="w-4 h-4" /> Add activity
          </button>
        )}
      </div>
    </section>
  );
}

// ─── Budget + Hotels panels ───────────────────────────────────────────────────
function BudgetBreakdown({ budget }: { budget: Trip['estimatedBudget'] }) {
  if (!budget) return null;
  const items = [
    { label: 'Transport', value: budget.transport },
    { label: 'Accommodation', value: budget.accommodation },
    { label: 'Food', value: budget.food },
    { label: 'Activities', value: budget.activities },
  ];
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-display font-semibold text-text-primary flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-amber-400" /> Estimated Budget
      </h2>
      <div className="space-y-3">
        {items.map(({ label, value }) => (
          <div key={label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-secondary">{label}</span>
              <span className="text-text-primary font-medium">{formatUSD(value)}</span>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-700"
                style={{ width: `${(value / maxVal) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="pt-3 border-t border-border flex justify-between items-center">
        <span className="font-display font-semibold text-text-primary">Total</span>
        <span className="font-display text-xl font-bold text-amber-400">{formatUSD(budget.total)}</span>
      </div>
    </div>
  );
}

function HotelsPanel({ hotels }: { hotels: Trip['hotels'] }) {
  if (!hotels?.length) return null;
  const tierColors: Record<string, string> = {
    Budget: 'text-risk-low',
    'Mid-Range': 'text-accent',
    Luxury: 'text-amber-400',
  };
  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-display font-semibold text-text-primary flex items-center gap-2">
        <Hotel className="w-4 h-4 text-accent" /> Recommended Hotels
      </h2>
      <div className="space-y-3">
        {hotels.map((hotel, i) => (
          <div key={hotel._id ?? i} className="p-4 rounded-xl bg-surface-2 border border-border">
            <div className="flex justify-between items-start gap-2 mb-1">
              <h3 className="font-display font-semibold text-sm text-text-primary">{hotel.name}</h3>
              <span className={cn('text-xs font-semibold shrink-0', tierColors[hotel.tier] ?? 'text-text-muted')}>
                {hotel.tier}
              </span>
            </div>
            <p className="text-xs text-text-secondary mb-2">{hotel.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{formatUSD(hotel.pricePerNightUSD)}/night</span>
              {hotel.rating && <span className="text-xs text-amber-400">★ {hotel.rating.toFixed(1)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Confidence badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ score }: { score: number }) {
  const color = getConfidenceColor(score);
  const label = getConfidenceLabel(score);
  const Icon = score >= 80 ? CheckCircle : AlertTriangle;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}10` }}>
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="text-xs font-semibold" style={{ color }}>{score} — {label}</span>
    </div>
  );
}

// ─── Regen shimmer skeleton ───────────────────────────────────────────────────
function DayShimmer() {
  return (
    <div className="space-y-2 ml-11 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-xl bg-surface-2 border border-border" />
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
function TripDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Regeneration state
  const [regenSheetDay, setRegenSheetDay] = useState<number | null>(null); // which day's sheet is open
  const [regenLoadingDay, setRegenLoadingDay] = useState<number | null>(null); // shimmer on this day
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set()); // for diff highlight

  // Clear diff highlights after 4s
  const diffTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const clearDiff = () => {
    if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
    diffTimerRef.current = setTimeout(() => setChangedIds(new Set()), 4000);
  };

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      try {
        const { trip: data } = await api.get<{ trip: Trip }>(`/api/trips/${params.id}`);
        setTrip(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load trip.');
      } finally {
        setIsLoading(false);
      }
    })();
    return () => { if (diffTimerRef.current) clearTimeout(diffTimerRef.current); };
  }, [params.id]);

  const handleRegenRequest = (dayNumber: number) => {
    setRegenSheetDay(dayNumber);
  };

  const handleRegenSuccess = (updatedTrip: Trip, diff: DayDiff) => {
    setRegenSheetDay(null);
    setRegenLoadingDay(diff.dayNumber); // show shimmer briefly
    setTimeout(() => {
      setTrip(updatedTrip);
      setRegenLoadingDay(null);
      setChangedIds(new Set(diff.changedActivityIds));
      clearDiff();
    }, 600); // brief shimmer for polish
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-4">
        <p className="text-risk-high">{error || 'Trip not found.'}</p>
        <Link href="/dashboard" className="btn-secondary">← Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void">
      {/* Regen sheet */}
      {regenSheetDay !== null && (
        <RegenSheet
          tripId={trip._id}
          dayNumber={regenSheetDay}
          onSuccess={handleRegenSuccess}
          onClose={() => setRegenSheetDay(null)}
        />
      )}

      {/* Sticky header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="btn-ghost p-2 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-text-primary truncate">{trip.destination}</h1>
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />{trip.durationDays}d
                </span>
                {trip.startDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />{formatDate(trip.startDate)}
                  </span>
                )}
                {trip.destinationLat && trip.destinationLng && (
                  <span className="flex items-center gap-1 hidden sm:flex">
                    <MapPin className="w-3 h-3" />
                    {trip.destinationLat.toFixed(2)}°, {trip.destinationLng.toFixed(2)}°
                  </span>
                )}
              </div>
            </div>
          </div>
          <ConfidenceBadge score={trip.confidenceScore ?? 100} />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Itinerary */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-text-primary">Itinerary</h2>
              <span className="text-sm text-text-muted">{trip.itinerary.length} days</span>
            </div>

            {trip.itinerary.map((day) =>
              regenLoadingDay === day.dayNumber ? (
                <section key={day.dayNumber}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-accent text-white font-display font-bold text-sm flex items-center justify-center">
                      {day.dayNumber}
                    </div>
                    <h3 className="font-display font-semibold text-text-primary">Day {day.dayNumber}</h3>
                    <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                    <span className="text-xs text-text-muted">Regenerating…</span>
                  </div>
                  <DayShimmer />
                </section>
              ) : (
                <DaySection
                  key={day.dayNumber}
                  day={day}
                  trip={trip}
                  changedIds={changedIds}
                  onTripUpdate={setTrip}
                  onRegenerateRequest={handleRegenRequest}
                />
              )
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <BudgetBreakdown budget={trip.estimatedBudget} />
            <HotelsPanel hotels={trip.hotels} />
            {trip.riskFlags.length > 0 && (
              <div className="card p-5">
                <h2 className="font-display font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> Risk Flags
                </h2>
                {trip.riskFlags.map((flag, i) => (
                  <div key={flag._id ?? i} className="p-3 rounded-lg bg-surface-2 border border-border text-sm mt-2">
                    <p className="text-text-secondary">{flag.message}</p>
                    <p className="text-xs text-text-muted mt-1">{flag.suggestedFix}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TripDetailPage() {
  return (
    <ProtectedRoute>
      <TripDetailContent />
    </ProtectedRoute>
  );
}
