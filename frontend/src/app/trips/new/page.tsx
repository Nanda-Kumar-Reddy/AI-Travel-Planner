'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, MapPin, Calendar, DollarSign, Tag, ArrowRight, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
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

const BUDGET_OPTIONS: { value: BudgetTier; label: string; description: string; color: string }[] = [
  { value: 'Low', label: 'Budget', description: 'Under $50/day', color: 'border-risk-low/50 bg-risk-low/5 hover:border-risk-low' },
  { value: 'Medium', label: 'Mid-Range', description: '$100–$200/day', color: 'border-accent/50 bg-accent/5 hover:border-accent' },
  { value: 'High', label: 'Luxury', description: '$300+/day', color: 'border-accent-warm/50 bg-accent-warm/5 hover:border-accent-warm' },
];

// ─── Loading Screen ─────────────────────────────────────────────────────────
function GeneratingScreen({ destination }: { destination: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-void px-4 text-center">
      <div className="relative mb-8">
        {/* Animated SVG flight path */}
        <svg width="240" height="120" viewBox="0 0 240 120" className="overflow-visible">
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#6366F1" />
            </marker>
          </defs>
          {/* Dashed arc path */}
          <path
            d="M 20 90 Q 120 10 220 90"
            fill="none"
            stroke="#2A2A3F"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          {/* Animated solid path */}
          <path
            d="M 20 90 Q 120 10 220 90"
            fill="none"
            stroke="#6366F1"
            strokeWidth="2.5"
            strokeDasharray="320"
            strokeDashoffset="320"
            markerEnd="url(#arrowhead)"
            className="flight-path"
          />
          {/* Origin dot */}
          <circle cx="20" cy="90" r="5" fill="#6366F1" className="animate-pulse" />
          {/* Destination dot */}
          <circle cx="220" cy="90" r="5" fill="#F59E0B" />
          {/* Plane icon at midpoint */}
          <g transform="translate(115, 25) rotate(-35)">
            <text fontSize="22" textAnchor="middle" dominantBaseline="middle">✈</text>
          </g>
        </svg>
      </div>

      <div className="space-y-3 max-w-xs">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          Planning your trip to
        </h2>
        <p className="font-display text-3xl font-bold text-gradient-accent">{destination}</p>

        <div className="flex items-center justify-center gap-2 text-text-secondary text-sm mt-4">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          <span>Gemini is crafting your itinerary…</span>
        </div>

        <div className="mt-6 space-y-2 text-left">
          {[
            'Researching top experiences',
            'Optimising your daily schedule',
            'Finding the best hotels',
            'Estimating your budget',
          ].map((step, i) => (
            <div
              key={step}
              className="flex items-center gap-2 text-xs text-text-muted animate-fade-in"
              style={{ animationDelay: `${i * 0.8}s`, animationFillMode: 'both' }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step components ────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i < current ? 'w-8 bg-accent' : i === current ? 'w-8 bg-accent' : 'w-4 bg-border'
          )}
        />
      ))}
      <span className="text-xs text-text-muted ml-2">{current + 1} / {total}</span>
    </div>
  );
}

// ─── Main Form Component ─────────────────────────────────────────────────────
function NewTripForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<FormData>({
    destination: '',
    startDate: '',
    durationDays: 5,
    budgetTier: 'Medium',
    interests: [],
  });

  const toggleInterest = (interest: string) => {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(interest)
        ? f.interests.filter((i) => i !== interest)
        : [...f.interests, interest],
    }));
  };

  const canNext = () => {
    if (step === 0) return form.destination.trim().length >= 2;
    if (step === 1) return form.durationDays >= 1 && form.durationDays <= 30;
    if (step === 2) return form.interests.length >= 1;
    return true;
  };

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

  return (
    <div className="min-h-screen bg-void flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 -left-40 w-80 h-80 bg-accent/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-40 w-96 h-96 bg-accent-warm/6 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-lg relative">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost p-2 -ml-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">Plan a new trip</h1>
            <p className="text-text-secondary text-sm">AI-powered, personalised itinerary</p>
          </div>
        </div>

        <div className="card p-8">
          <StepIndicator current={step} total={3} />

          {/* Error */}
          {error && (
            <div role="alert" className="mb-4 px-4 py-3 rounded-lg bg-risk-high/10 border border-risk-high/25 text-risk-high text-sm">
              {error}
            </div>
          )}

          {/* Step 0 — Destination + Date */}
          {step === 0 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-text-primary">Where to?</h2>
                  <p className="text-text-muted text-xs">Enter a city or region</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="destination" className="block text-sm font-medium text-text-secondary">Destination *</label>
                <input
                  id="destination"
                  type="text"
                  className="input"
                  placeholder="Paris, Tokyo, New York…"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="startDate" className="block text-sm font-medium text-text-secondary">
                  Start date <span className="text-text-muted font-normal">(optional — improves weather accuracy)</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input
                    id="startDate"
                    type="date"
                    className="input pl-10"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1 — Duration + Budget */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-text-primary">Duration & Budget</h2>
                  <p className="text-text-muted text-xs">How long, and what's your style?</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="durationDays" className="block text-sm font-medium text-text-secondary">
                  Duration: <span className="text-accent font-semibold">{form.durationDays} {form.durationDays === 1 ? 'day' : 'days'}</span>
                </label>
                <input
                  id="durationDays"
                  type="range"
                  min={1} max={21} step={1}
                  value={form.durationDays}
                  onChange={(e) => setForm((f) => ({ ...f, durationDays: Number(e.target.value) }))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-xs text-text-muted">
                  <span>1 day</span><span>21 days</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-text-secondary">Budget tier</span>
                <div className="grid grid-cols-3 gap-2">
                  {BUDGET_OPTIONS.map(({ value, label, description, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, budgetTier: value }))}
                      className={cn(
                        'p-3 rounded-xl border text-center transition-all duration-200',
                        color,
                        form.budgetTier === value ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''
                      )}
                    >
                      <div className="font-display font-semibold text-sm text-text-primary">{label}</div>
                      <div className="text-xs text-text-muted mt-0.5">{description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Interests */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-text-primary">Your interests</h2>
                  <p className="text-text-muted text-xs">Select at least one to personalise your itinerary</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((interest) => (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm border transition-all duration-150',
                      form.interests.includes(interest)
                        ? 'bg-accent text-white border-accent'
                        : 'bg-transparent text-text-secondary border-border hover:border-accent/50 hover:text-text-primary'
                    )}
                  >
                    {interest}
                  </button>
                ))}
              </div>
              {form.interests.length > 0 && (
                <p className="text-xs text-accent">{form.interests.length} selected</p>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="btn-secondary flex-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            {step < 2 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
                className="btn-primary flex-1"
                id="next-step"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canNext()}
                className="btn-primary flex-1 justify-center"
                id="generate-trip"
              >
                <Sparkles className="w-4 h-4" />
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
