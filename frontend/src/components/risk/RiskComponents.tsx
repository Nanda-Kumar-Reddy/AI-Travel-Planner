'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

// ── Animated SVG confidence ring ──────────────────────────────────────────────
export interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  fromScore?: number;
}

export function ScoreRing({ score, size = 64, strokeWidth = 6, fromScore }: ScoreRingProps) {
  const prefersReduced = useReducedMotion();
  const r    = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;

  // If reduced motion: jump straight to target values, no animation
  const [offset, setOffset]           = useState(circ * (1 - (prefersReduced ? score : 0) / 100));
  const [displayScore, setDisplayScore] = useState(prefersReduced ? score : (fromScore ?? 0));

  // Stroke-dashoffset animation (the "fill" progress)
  useEffect(() => {
    if (prefersReduced) {
      setOffset(circ * (1 - score / 100));
      return;
    }
    const t = setTimeout(() => setOffset(circ * (1 - score / 100)), 80);
    return () => clearTimeout(t);
  }, [score, circ, prefersReduced]);

  // Numeric count-up
  useEffect(() => {
    if (prefersReduced) {
      setDisplayScore(score);
      return;
    }
    const start = fromScore ?? 0;
    const diff  = score - start;
    if (diff === 0) { setDisplayScore(score); return; }
    const steps = 40;
    let step = 0;
    const id = setInterval(() => {
      step++;
      setDisplayScore(Math.round(start + diff * (step / steps)));
      if (step >= steps) { setDisplayScore(score); clearInterval(id); }
    }, 800 / steps);
    return () => clearInterval(id);
  }, [score, fromScore, prefersReduced]);

  const color = score >= 80 ? 'var(--color-risk-low)'
              : score >= 60 ? 'var(--color-risk-medium)'
              :               'var(--color-risk-high)';

  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Needs review' : 'Action needed';

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      role="img"
      aria-label={`Confidence score: ${score} out of 100 — ${label}`}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        {/* Track circle — uses CSS var so it's visible in both themes */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{
            transition: prefersReduced
              ? 'none'
              : 'stroke-dashoffset 0.9s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-display font-bold text-sm leading-none"
          style={{ color }}
          aria-hidden="true"
        >
          {displayScore}
        </span>
      </div>
    </div>
  );
}

// ── Risk flag chips ───────────────────────────────────────────────────────────
export const SEV_COLOR = {
  high:   'var(--color-risk-high)',
  medium: 'var(--color-risk-medium)',
  low:    'var(--color-risk-low)',
} as const;

export const SEV_RGB = {
  high:   'var(--color-risk-high-rgb)',
  medium: 'var(--color-risk-medium-rgb)',
  low:    'var(--color-risk-low-rgb)',
} as const;

export const TYPE_LABEL = { pacing: 'Pace', budget: 'Budget', weather: 'Weather' } as const;

export type FlagLike = { type: string; severity: string };

export function FlagChips({ flags }: { flags: FlagLike[] }) {
  if (!flags?.length) return null;
  const seen = new Set<string>();
  const deduped = flags.filter((f) => {
    const k = `${f.type}-${f.severity}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {deduped.map((f, i) => {
        const c   = SEV_COLOR[f.severity as keyof typeof SEV_COLOR] ?? 'var(--color-text-muted)';
        const rgb = SEV_RGB[f.severity as keyof typeof SEV_RGB] ?? '107, 107, 136';
        return (
          <span
            key={i}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
            style={{
              color: c,
              borderColor: `rgba(${rgb}, 0.4)`,
              backgroundColor: `rgba(${rgb}, 0.10)`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
            {TYPE_LABEL[f.type as keyof typeof TYPE_LABEL] ?? f.type}
          </span>
        );
      })}
    </div>
  );
}
