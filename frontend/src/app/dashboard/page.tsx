'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LogOut, Plane, Plus, MapPin, Calendar, Clock, TrendingUp, Trash2, AlertTriangle, X,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { useAuthStore } from '../../store/auth.store';
import { ThemeToggle } from '../../components/theme/ThemeToggle';
import { api, ApiError } from '../../lib/api';
import { formatDate, formatUSD, cn } from '../../lib/utils';
import { ScoreRing, FlagChips, type FlagLike } from '../../components/risk/RiskComponents';
import type { Trip } from '../../../../shared/src/index';

// ── Delete confirm modal ──────────────────────────────────────────────────────
interface DeleteConfirmModalProps {
  destination: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}
function DeleteConfirmModal({ destination, onConfirm, onCancel, isDeleting }: DeleteConfirmModalProps) {
  const prefersReduced = useReducedMotion();
  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="delete-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
        onClick={onCancel}
      >
        {/* Panel */}
        <motion.div
          key="delete-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 16 }}
          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 8 }}
          transition={prefersReduced ? { duration: 0.15 } : { type: 'spring', stiffness: 380, damping: 28 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="absolute top-4 right-4 btn-ghost p-1.5"
            aria-label="Close"
          >
            <X size={16} />
          </button>

          {/* Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            style={{
              background: 'rgba(var(--color-risk-high-rgb), 0.10)',
              border: '1px solid rgba(var(--color-risk-high-rgb), 0.25)',
            }}
          >
            <AlertTriangle size={22} style={{ color: 'var(--color-risk-high)' }} />
          </div>

          <h3
            id="delete-modal-title"
            className="font-display font-bold text-lg mb-1"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Delete trip?
          </h3>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{destination}</span> will be permanently removed. This cannot be undone.
          </p>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="btn-secondary flex-1 justify-center"
              id="delete-modal-cancel"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all"
              style={{
                background: isDeleting
                  ? 'rgba(var(--color-risk-high-rgb), 0.5)'
                  : 'var(--color-risk-high)',
              }}
              id="delete-modal-confirm"
            >
              {isDeleting ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Deleting…</>
              ) : (
                <><Trash2 size={14} />Delete Trip</>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

// ── Trip card ─────────────────────────────────────────────────────────────────
function TripCard({ trip, onDelete }: { trip: Trip; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const prefersReduced = useReducedMotion();

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try { await api.delete(`/api/trips/${trip._id}`); onDelete(trip._id); }
    catch { setDeleting(false); setShowDeleteModal(false); }
  };

  const score = trip.confidenceScore ?? 100;

  const budgetColorMap: Record<string, string> = {
    Low:    'var(--color-risk-low)',
    Medium: 'var(--color-accent)',
    High:   'var(--color-accent-warm)',
  };
  const budgetColor = budgetColorMap[trip.budgetTier] ?? 'var(--color-text-muted)';

  return (
    <motion.div
      layout
      exit={
        prefersReduced
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
      }
    >
      <Link
        href={`/trips/${trip._id}`}
        className="card card-interactive block p-5 group"
        id={`trip-card-${trip._id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 group-hover:opacity-90 transition-opacity"
              style={{
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.22)',
              }}
            >
              <MapPin size={18} style={{ color: 'var(--color-accent)' }} strokeWidth={1.5} />
            </div>
            <div>
              <h2
                className="font-display font-semibold leading-tight"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {trip.destination}
              </h2>
              <span className="text-xs font-medium" style={{ color: budgetColor }}>
                {trip.budgetTier} budget
              </span>
            </div>
          </div>
          <ScoreRing score={score} size={52} strokeWidth={5} />
        </div>

        <FlagChips flags={(trip.riskFlags ?? []) as FlagLike[]} />

        <div
          className="flex items-center gap-4 text-xs mt-3 mb-3"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span className="flex items-center gap-1">
            <Clock size={13} />{trip.durationDays}d
          </span>
          {trip.startDate && (
            <span className="flex items-center gap-1">
              <Calendar size={13} />{formatDate(trip.startDate)}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1">
            <TrendingUp size={13} />{formatDate(trip.createdAt)}
          </span>
        </div>

        <div
          className="flex items-center justify-between pt-3 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full border',
              trip.status === 'ready'
                ? 'text-[var(--color-risk-low)] bg-[rgba(var(--color-risk-low-rgb),0.08)] border-[rgba(var(--color-risk-low-rgb),0.25)]'
                : 'text-[var(--color-text-muted)] border-[var(--color-border)]'
            )}
          >
            {trip.status}
          </span>
          <button
            onClick={handleDeleteClick}
            disabled={deleting}
            className="opacity-0 group-hover:opacity-100 btn-ghost py-1 px-2 text-xs transition-opacity"
            style={{ color: 'var(--color-risk-high)' }}
            aria-label="Delete trip"
            id={`delete-trip-${trip._id}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </Link>

      <AnimatePresence>
        {showDeleteModal && (
          <DeleteConfirmModal
            destination={trip.destination}
            onConfirm={handleConfirmDelete}
            onCancel={() => setShowDeleteModal(false)}
            isDeleting={deleting}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onNewTrip }: { onNewTrip: () => void }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-24 text-center"
      initial={{ opacity: 0, y: prefersReduced ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReduced ? { duration: 0.2 } : { type: 'spring', stiffness: 220, damping: 24 }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
      >
        <MapPin size={28} style={{ color: 'var(--color-text-muted)' }} strokeWidth={1.2} />
      </div>
      <h2 className="font-display text-xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
        No trips yet
      </h2>
      <p className="text-sm max-w-xs mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        Create your first AI-powered itinerary and let Trao plan every detail.
      </p>
      <button className="btn-primary" onClick={onNewTrip}>
        <Plus size={15} /> Plan my first trip
      </button>
    </motion.div>
  );
}

// ── Dashboard content ─────────────────────────────────────────────────────────
function DashboardContent() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [trips, setTrips]       = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState('');
  const prefersReduced = useReducedMotion();

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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-void)' }}>
      {/* Header */}
      <header className="nav-glass sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
            >
              <Plane size={16} style={{ color: 'var(--color-accent)' }} strokeWidth={1.5} />
            </div>
            <span
              className="font-display font-semibold hidden sm:block"
              style={{ color: 'var(--color-text-primary)' }}
            >
              AI Travel Planner
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* User info */}
            <div className="text-right hidden sm:block mr-1">
              <p className="text-sm font-medium leading-none" style={{ color: 'var(--color-text-primary)' }}>
                {user?.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {user?.email}
              </p>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-display font-semibold text-sm"
              style={{
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.28)',
                color: 'var(--color-accent)',
              }}
            >
              {user?.name?.charAt(0).toUpperCase()}
            </div>

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="btn-ghost gap-1.5"
              id="logout-btn"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Page heading */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              My Trips
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {trips.length === 0
                ? 'No trips yet'
                : `${trips.length} trip${trips.length > 1 ? 's' : ''} planned`}
              {trips.length > 0 && totalBudget > 0 && ` · ${formatUSD(totalBudget)} estimated`}
            </p>
          </div>
          <button
            className="btn-primary shrink-0"
            id="new-trip-btn"
            onClick={() => router.push('/trips/new')}
          >
            <Plus size={15} /> New Trip
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'rgba(var(--color-risk-high-rgb), 0.08)',
              border: '1px solid rgba(var(--color-risk-high-rgb), 0.25)',
              color: 'var(--color-risk-high)',
            }}
          >
            {error}
          </div>
        )}

        {/* Loading skeletons */}
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

        {/* Trip grid — staggered mount animation */}
        {!isLoading && trips.length > 0 && (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: {
                transition: {
                  staggerChildren: prefersReduced ? 0 : 0.06,
                },
              },
            }}
          >
            <AnimatePresence mode="popLayout">
              {trips.map((trip) => (
                <motion.div
                  key={trip._id}
                  variants={{
                    hidden: { opacity: 0, y: prefersReduced ? 0 : 20 },
                    show:   {
                      opacity: 1,
                      y: 0,
                      transition: prefersReduced
                        ? { duration: 0.15 }
                        : { type: 'spring', stiffness: 280, damping: 24 },
                    },
                  }}
                >
                  <TripCard trip={trip} onDelete={handleDelete} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Empty state */}
        {!isLoading && trips.length === 0 && !error && (
          <EmptyState onNewTrip={() => router.push('/trips/new')} />
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return <ProtectedRoute><DashboardContent /></ProtectedRoute>;
}
