'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plane, MapPin, Calendar, DollarSign, Tag, ArrowRight, ArrowLeft, Loader2, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { api, ApiError } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import type { Trip, BudgetTier } from '../../../../../shared/src/index';

// ─── Types ─────────────────────────────────────────────────────────────────
interface FormData {
  destination: string;
  startDate: string;
  durationDays: number;
  budgetTier: BudgetTier;
  interests: string[];
}

const INTEREST_OPTIONS = [
  'Culture & History', 'Food & Dining', 'Adventure & Outdoors', 'Art & Museums',
  'Nightlife', 'Shopping', 'Nature & Wildlife', 'Architecture',
  'Beach & Water', 'Local Markets', 'Photography', 'Wellness & Spa',
];

const BUDGET_OPTIONS: { value: BudgetTier; label: string; description: string }[] = [
  { value: 'Low',    label: 'Budget',    description: 'Under $50/day' },
  { value: 'Medium', label: 'Mid-Range', description: '$100–$200/day' },
  { value: 'High',   label: 'Luxury',    description: '$300+/day' },
];

// ─── Generating screen ──────────────────────────────────────────────────────
function GeneratingScreen({ destination }: { destination: string }) {
  const prefersReduced = useReducedMotion();

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-4 text-center"
      style={{ background: 'var(--color-void)' }}
    >
      <div className="relative mb-8">
        <svg width="240" height="120" viewBox="0 0 240 120" className="overflow-visible" aria-hidden="true">
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="var(--color-accent)" />
            </marker>
          </defs>
          {/* Dashed arc — background track */}
          <path
            d="M 20 90 Q 120 10 220 90"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          {/* Animated solid path */}
          <path
            d="M 20 90 Q 120 10 220 90"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeDasharray="320"
            strokeDashoffset="320"
            markerEnd="url(#arrowhead)"
            className={prefersReduced ? undefined : 'flight-path'}
            style={prefersReduced ? { strokeDashoffset: 0 } : undefined}
          />
          {/* Origin dot */}
          <circle cx="20" cy="90" r="5" fill="var(--color-accent)" className={prefersReduced ? undefined : 'animate-pulse'} />
          {/* Destination dot */}
          <circle cx="220" cy="90" r="5" fill="var(--color-accent-warm)" />
          {/* Plane icon */}
          <g transform="translate(115, 25) rotate(-35)">
            <text fontSize="22" textAnchor="middle" dominantBaseline="middle">✈</text>
          </g>
        </svg>
      </div>

      <div className="space-y-3 max-w-xs">
        <h2 className="font-display text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Planning your trip to
        </h2>
        <p className="font-display text-3xl font-bold text-gradient-accent">{destination}</p>

        <div className="flex items-center justify-center gap-2 text-sm mt-4" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 size={15} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          <span>Gemini is crafting your itinerary…</span>
        </div>

        <div className="mt-6 space-y-2 text-left">
          {[
            'Researching top experiences',
            'Optimising your daily schedule',
            'Finding the best hotels',
            'Estimating your budget',
          ].map((step, i) => (
            <motion.div
              key={step}
              className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
              initial={{ opacity: 0, x: prefersReduced ? 0 : -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                prefersReduced
                  ? { duration: 0.15, delay: i * 0.1 }
                  : { type: 'spring', stiffness: 240, damping: 22, delay: i * 0.8 }
              }
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'rgba(99,102,241,0.6)' }}
              />
              {step}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step indicator ─────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ width: i <= current ? 32 : 16 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          className="h-1.5 rounded-full"
          style={{ background: i <= current ? 'var(--color-accent)' : 'var(--color-border)' }}
        />
      ))}
      <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
        {current + 1} / {total}
      </span>
    </div>
  );
}

// ─── Main form ──────────────────────────────────────────────────────────────
function NewTripForm() {
  const router = useRouter();
  const prefersReduced = useReducedMotion();
  const [step, setStep]               = useState(0);
  const [direction, setDirection]     = useState<1 | -1>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError]             = useState('');

  const [form, setForm] = useState<FormData>({
    destination: '',
    startDate: '',
    durationDays: 5,
    budgetTier: 'Medium',
    interests: [],
  });

  const toggleInterest = (interest: string) => {
    setForm(f => ({
      ...f,
      interests: f.interests.includes(interest)
        ? f.interests.filter(i => i !== interest)
        : [...f.interests, interest],
    }));
  };

  const canNext = () => {
    if (step === 0) return form.destination.trim().length >= 2;
    if (step === 1) return form.durationDays >= 1 && form.durationDays <= 30;
    if (step === 2) return form.interests.length >= 1;
    return true;
  };

  const goNext = () => { setDirection(1); setStep(s => s + 1); };
  const goBack = () => { setDirection(-1); setStep(s => s - 1); };

  const handleSubmit = async () => {
    setError('');
    setIsGenerating(true);
    try {
      const { trip } = await api.post<{ trip: Trip }>('/api/trips', {
        destination: form.destination.trim(),
        durationDays: form.durationDays,
        budgetTier: form.budgetTier,
        interests: form.interests,
        startDate: form.startDate || null,
      });
      router.push(`/trips/${trip._id}`);
    } catch (err) {
      setIsGenerating(false);
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  if (isGenerating) return <GeneratingScreen destination={form.destination} />;

  // Spring slide: reduced motion → simple fade
  const stepVariants = prefersReduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.15 } },
        exit:    { opacity: 0, transition: { duration: 0.1 } },
      }
    : {
        initial: { opacity: 0, x: direction * 28 },
        animate: {
          opacity: 1, x: 0,
          transition: { type: 'spring', stiffness: 300, damping: 28 },
        },
        exit: {
          opacity: 0, x: direction * -20,
          transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
        },
      };

  const budgetBorderMap: Record<string, string> = {
    Low:    'var(--color-risk-low)',
    Medium: 'var(--color-accent)',
    High:   'var(--color-accent-warm)',
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--color-void)' }}
    >
      {/* Ambient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-1/4 -left-40 w-80 h-80 rounded-full blur-3xl"
          style={{ background: 'rgba(99,102,241,0.07)' }}
        />
        <div
          className="absolute bottom-1/4 -right-40 w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'rgba(245,158,11,0.05)' }}
        />
      </div>

      <div className="w-full max-w-lg relative">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost p-2 -ml-2">
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Plan a new trip
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              AI-powered, personalised itinerary
            </p>
          </div>
        </div>

        <div className="card p-8" style={{ overflow: 'hidden' }}>
          <StepIndicator current={step} total={3} />

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="mb-4 px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'rgba(var(--color-risk-high-rgb), 0.08)',
                border: '1px solid rgba(var(--color-risk-high-rgb), 0.25)',
                color: 'var(--color-risk-high)',
              }}
            >
              {error}
            </div>
          )}

          {/* Animated step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {/* Step 0 — Destination + Date */}
              {step === 0 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)' }}
                    >
                      <MapPin size={18} style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <div>
                      <h2 className="font-display font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Where to?
                      </h2>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Enter a city or region</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="destination" className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Destination *
                    </label>
                    <input
                      id="destination"
                      type="text"
                      className="input"
                      placeholder="Paris, Tokyo, New York…"
                      value={form.destination}
                      onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="startDate" className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Start date{' '}
                      <span className="font-normal" style={{ color: 'var(--color-text-muted)' }}>
                        (optional — improves weather accuracy)
                      </span>
                    </label>
                    <div className="relative">
                      <Calendar
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--color-text-muted)' }}
                      />
                      <input
                        id="startDate"
                        type="date"
                        className="input pl-10"
                        value={form.startDate}
                        onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1 — Duration + Budget */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)' }}
                    >
                      <DollarSign size={18} style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <div>
                      <h2 className="font-display font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Duration & Budget
                      </h2>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>How long, and what's your style?</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="durationDays" className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Duration:{' '}
                      <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                        {form.durationDays} {form.durationDays === 1 ? 'day' : 'days'}
                      </span>
                    </label>
                    <input
                      id="durationDays"
                      type="range"
                      min={1} max={21} step={1}
                      value={form.durationDays}
                      onChange={e => setForm(f => ({ ...f, durationDays: Number(e.target.value) }))}
                      className="w-full"
                      style={{ accentColor: 'var(--color-accent)' }}
                    />
                    <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      <span>1 day</span><span>21 days</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Budget tier
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {BUDGET_OPTIONS.map(({ value, label, description }) => {
                        const isSelected = form.budgetTier === value;
                        return (
                          <motion.button
                            key={value}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, budgetTier: value }))}
                            className="p-3 rounded-xl border text-center transition-all duration-200"
                            style={{
                              borderColor: isSelected
                                ? budgetBorderMap[value]
                                : 'var(--color-border)',
                              background: isSelected
                                ? `rgba(${value === 'Low'
                                    ? 'var(--color-risk-low-rgb)'
                                    : value === 'High'
                                      ? '245,158,11'
                                      : 'var(--color-accent-rgb)'
                                  }, 0.08)`
                                : 'transparent',
                              boxShadow: isSelected
                                ? `0 0 0 2px ${budgetBorderMap[value]}40`
                                : undefined,
                            }}
                            whileHover={prefersReduced ? {} : { scale: 1.02 }}
                            whileTap={prefersReduced ? {} : { scale: 0.98 }}
                          >
                            <div className="font-display font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                              {label}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                              {description}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 — Interests */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)' }}
                    >
                      <Tag size={18} style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <div>
                      <h2 className="font-display font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Your interests
                      </h2>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Select at least one to personalise your itinerary
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {INTEREST_OPTIONS.map(interest => {
                      const isSelected = form.interests.includes(interest);
                      return (
                        <motion.button
                          key={interest}
                          type="button"
                          onClick={() => toggleInterest(interest)}
                          className="px-3 py-1.5 rounded-full text-sm border transition-all duration-150"
                          style={{
                            background: isSelected ? 'var(--color-accent)' : 'transparent',
                            color: isSelected ? '#fff' : 'var(--color-text-secondary)',
                            borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                          }}
                          whileHover={prefersReduced ? {} : { scale: 1.04 }}
                          whileTap={prefersReduced ? {} : { scale: 0.96 }}
                        >
                          {interest}
                        </motion.button>
                      );
                    })}
                  </div>

                  {form.interests.length > 0 && (
                    <p className="text-xs" style={{ color: 'var(--color-accent)' }}>
                      {form.interests.length} selected
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation buttons */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button type="button" onClick={goBack} className="btn-secondary flex-1">
                <ArrowLeft size={15} /> Back
              </button>
            )}
            {step < 2 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext()}
                className="btn-primary flex-1"
                id="next-step"
              >
                Next <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canNext()}
                className="btn-primary flex-1 justify-center"
                id="generate-trip"
              >
                <Sparkles size={15} />
                Generate itinerary
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewTripPage() {
  return (
    <ProtectedRoute>
      <NewTripForm />
    </ProtectedRoute>
  );
}
