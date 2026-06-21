'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Calendar, Clock, DollarSign,
  Hotel, Sun, Sunset, Moon, AlertTriangle, Loader2, CheckCircle
} from 'lucide-react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { api, ApiError } from '../../../lib/api';
import { formatUSD, formatDate, getConfidenceColor, getConfidenceLabel, cn } from '../../../lib/utils';
import type { Trip, Activity, ItineraryDay } from '../../../../../shared/src/index';

// ─── Time-of-day icon ─────────────────────────────────────────────────────────
function TimeIcon({ time }: { time: Activity['timeOfDay'] }) {
  const icons = { Morning: Sun, Afternoon: Sunset, Evening: Moon };
  const colors = { Morning: 'text-accent-warm', Afternoon: 'text-accent', Evening: 'text-purple-400' };
  const Icon = icons[time];
  return <Icon className={cn('w-3.5 h-3.5 shrink-0', colors[time])} />;
}

// ─── Single activity card ─────────────────────────────────────────────────────
function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <div className="flex gap-3 p-4 rounded-xl bg-surface-2 border border-border hover:border-accent/30 transition-colors">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <TimeIcon time={activity.timeOfDay} />
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-display font-semibold text-sm text-text-primary leading-tight">{activity.title}</h4>
          <span className="text-xs text-accent-warm font-medium shrink-0">
            {formatUSD(activity.estimatedCostUSD)}
          </span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">{activity.description}</p>
        <span className="mt-2 inline-block text-xs text-text-muted bg-surface border border-border px-2 py-0.5 rounded-full">
          {activity.timeOfDay}
        </span>
      </div>
    </div>
  );
}

// ─── Single day section ───────────────────────────────────────────────────────
function DaySection({ day }: { day: ItineraryDay }) {
  const dayTotal = day.activities.reduce((s, a) => s + a.estimatedCostUSD, 0);
  return (
    <section className="animate-slide-up" style={{ animationDelay: `${day.dayNumber * 0.08}s`, animationFillMode: 'both' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent text-white font-display font-bold text-sm flex items-center justify-center">
            {day.dayNumber}
          </div>
          <h3 className="font-display font-semibold text-text-primary">Day {day.dayNumber}</h3>
        </div>
        <span className="text-xs text-text-muted">{formatUSD(dayTotal)} est.</span>
      </div>
      <div className="space-y-2 ml-11">
        {day.activities.map((activity, i) => (
          <ActivityCard key={activity._id ?? i} activity={activity} />
        ))}
      </div>
    </section>
  );
}

// ─── Budget breakdown ─────────────────────────────────────────────────────────
function BudgetBreakdown({ budget }: { budget: Trip['estimatedBudget'] }) {
  if (!budget) return null;
  const items = [
    { label: 'Transport', value: budget.transport },
    { label: 'Accommodation', value: budget.accommodation },
    { label: 'Food', value: budget.food },
    { label: 'Activities', value: budget.activities },
  ];
  const maxVal = Math.max(...items.map((i) => i.value));
  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-display font-semibold text-text-primary flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-accent-warm" /> Estimated Budget
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
                style={{ width: `${maxVal > 0 ? (value / maxVal) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="pt-3 border-t border-border flex justify-between items-center">
        <span className="font-display font-semibold text-text-primary">Total</span>
        <span className="font-display text-xl font-bold text-accent-warm">{formatUSD(budget.total)}</span>
      </div>
    </div>
  );
}

// ─── Hotels panel ─────────────────────────────────────────────────────────────
function HotelsPanel({ hotels }: { hotels: Trip['hotels'] }) {
  if (!hotels?.length) return null;
  const tierColors = { Budget: 'text-risk-low', 'Mid-Range': 'text-accent', Luxury: 'text-accent-warm' };
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
              <span className={cn('text-xs font-semibold shrink-0', tierColors[hotel.tier])}>
                {hotel.tier}
              </span>
            </div>
            <p className="text-xs text-text-secondary mb-2">{hotel.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{formatUSD(hotel.pricePerNightUSD)}/night</span>
              {hotel.rating && (
                <span className="text-xs text-accent-warm">★ {hotel.rating.toFixed(1)}</span>
              )}
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
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: `${color}40`, backgroundColor: `${color}10` }}>
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="text-xs font-semibold" style={{ color }}>{score} — {label}</span>
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
  }, [params.id]);

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
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {trip.destinationLat.toFixed(2)}, {trip.destinationLng.toFixed(2)}
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
          {/* Itinerary — full width on mobile, 2/3 on desktop */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-text-primary">Itinerary</h2>
              <span className="text-sm text-text-muted">{trip.itinerary.length} days</span>
            </div>
            {trip.itinerary.map((day) => (
              <DaySection key={day.dayNumber} day={day} />
            ))}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <BudgetBreakdown budget={trip.estimatedBudget} />
            <HotelsPanel hotels={trip.hotels} />

            {/* Risk flags placeholder — populated by Phase 8 */}
            {trip.riskFlags.length > 0 && (
              <div className="card p-5">
                <h2 className="font-display font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-risk-medium" /> Risk Flags
                </h2>
                {trip.riskFlags.map((flag, i) => (
                  <div key={flag._id ?? i} className="p-3 rounded-lg bg-surface-2 border border-border text-sm">
                    <p className="text-text-secondary">{flag.message}</p>
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
