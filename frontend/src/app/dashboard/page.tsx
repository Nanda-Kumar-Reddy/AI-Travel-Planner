'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Plane, Plus, MapPin, Calendar, Clock, TrendingUp, Trash2 } from 'lucide-react';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { useAuthStore } from '../../store/auth.store';
import { api, ApiError } from '../../lib/api';
import { formatDate, formatUSD, cn } from '../../lib/utils';
import { ScoreRing, FlagChips, type FlagLike } from '../../components/risk/RiskComponents';
import type { Trip } from '../../../../shared/src/index';
import { useEffect } from 'react';

// ── Trip card ─────────────────────────────────────────────────────────────────
function TripCard({ trip, onDelete }: { trip: Trip; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm(`Delete trip to ${trip.destination}? This cannot be undone.`)) return;
    setDeleting(true);
    try { await api.delete(`/api/trips/${trip._id}`); onDelete(trip._id); }
    catch { setDeleting(false); }
  };

  const score = trip.confidenceScore ?? 100;
  const budgeColors: Record<string, string> = { Low: 'text-risk-low', Medium: 'text-accent', High: 'text-accent-warm' };

  return (
    <Link href={`/trips/${trip._id}`} className="card card-interactive block p-5 group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0 group-hover:bg-accent/25 transition-colors">
            <MapPin className="w-5 h-5 text-accent" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-display font-semibold text-text-primary leading-tight">{trip.destination}</h2>
            <span className={cn('text-xs font-medium', budgeColors[trip.budgetTier] ?? 'text-text-muted')}>
              {trip.budgetTier} budget
            </span>
          </div>
        </div>
        <ScoreRing score={score} size={52} strokeWidth={5} />
      </div>

      <FlagChips flags={(trip.riskFlags ?? []) as FlagLike[]} />

      <div className="flex items-center gap-4 text-xs text-text-muted mt-3 mb-3">
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{trip.durationDays}d</span>
        {trip.startDate && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(trip.startDate)}</span>}
        <span className="ml-auto flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />{formatDate(trip.createdAt)}</span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className={cn('text-xs px-2 py-0.5 rounded-full border',
          trip.status === 'ready' ? 'bg-risk-low/10 text-risk-low border-risk-low/25' : 'bg-text-muted/10 text-text-muted border-border')}>
          {trip.status}
        </span>
        <button onClick={handleDelete} disabled={deleting}
          className="opacity-0 group-hover:opacity-100 btn-ghost text-risk-high hover:bg-risk-high/10 py-1 px-2 text-xs"
          aria-label="Delete trip">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </Link>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardContent() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { trips: data } = await api.get<{ trips: Trip[] }>('/api/trips');
        setTrips(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load trips.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleLogout = async () => { await logout(); router.replace('/login'); };
  const handleDelete = (id: string) => setTrips((prev) => prev.filter((t) => t._id !== id));

  const totalBudget = trips.reduce((sum, t) => sum + (t.estimatedBudget?.total ?? 0), 0);

  return (
    <div className="min-h-screen bg-void">
      <header className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Plane className="w-4 h-4 text-accent" strokeWidth={1.5} />
            </div>
            <span className="font-display font-semibold text-text-primary hidden sm:block">AI Travel Planner</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-text-primary leading-none">{user?.name}</p>
              <p className="text-xs text-text-muted mt-0.5">{user?.email}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent font-display font-semibold text-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <button onClick={handleLogout} className="btn-ghost gap-1.5" id="logout-btn">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-text-primary">My Trips</h1>
            <p className="text-text-secondary mt-1 text-sm">
              {trips.length === 0 ? 'No trips yet' : `${trips.length} trip${trips.length > 1 ? 's' : ''} planned`}
              {trips.length > 0 && totalBudget > 0 && ` · ${formatUSD(totalBudget)} estimated`}
            </p>
          </div>
          <button className="btn-primary shrink-0" id="new-trip-btn" onClick={() => router.push('/trips/new')}>
            <Plus className="w-4 h-4" /> New Trip
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-6 px-4 py-3 rounded-lg bg-risk-high/10 border border-risk-high/25 text-risk-high text-sm">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5 space-y-4 animate-pulse">
                <div className="skeleton h-4 w-2/3 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="skeleton h-3 w-full rounded" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && trips.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trips.map((trip) => <TripCard key={trip._id} trip={trip} onDelete={handleDelete} />)}
          </div>
        )}

        {!isLoading && trips.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
              <MapPin className="w-8 h-8 text-text-muted" strokeWidth={1.2} />
            </div>
            <h2 className="font-display text-xl font-semibold text-text-primary mb-2">No trips yet</h2>
            <p className="text-text-secondary text-sm max-w-xs mb-6">
              Create your first AI-powered itinerary and let Gemini plan every detail.
            </p>
            <button className="btn-primary" onClick={() => router.push('/trips/new')}>
              <Plus className="w-4 h-4" /> Plan my first trip
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return <ProtectedRoute><DashboardContent /></ProtectedRoute>;
}
