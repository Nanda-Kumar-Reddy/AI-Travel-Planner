'use client';

import { useEffect, useState } from 'react';

// ── Animated SVG confidence ring ──────────────────────────────────────────────
export interface ScoreRingProps { score: number; size?: number; strokeWidth?: number; fromScore?: number }

export function ScoreRing({ score, size = 64, strokeWidth = 6, fromScore }: ScoreRingProps) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circ);
  const [displayScore, setDisplayScore] = useState(fromScore ?? 0);

  useEffect(() => {
    const t = setTimeout(() => setOffset(circ * (1 - score / 100)), 80);
    return () => clearTimeout(t);
  }, [score, circ]);

  useEffect(() => {
    const start = fromScore ?? 0;
    const diff = score - start;
    if (diff === 0) { setDisplayScore(score); return; }
    const steps = 40;
    let step = 0;
    const id = setInterval(() => {
      step++;
      setDisplayScore(Math.round(start + diff * (step / steps)));
      if (step >= steps) { setDisplayScore(score); clearInterval(id); }
    }, 800 / steps);
    return () => clearInterval(id);
  }, [score, fromScore]);

  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s ease, stroke 0.3s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-sm leading-none" style={{ color }}>{displayScore}</span>
      </div>
    </div>
  );
}

// ── Risk flag chips ───────────────────────────────────────────────────────────
export const SEV_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' } as const;
export const TYPE_LABEL = { pacing: 'Pace', budget: 'Budget', weather: 'Weather' } as const;

export type FlagLike = { type: string; severity: string };

export function FlagChips({ flags }: { flags: FlagLike[] }) {
  if (!flags?.length) return null;
  const seen = new Set<string>();
  const deduped = flags.filter((f) => {
    const k = `${f.type}-${f.severity}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {deduped.map((f, i) => {
        const c = SEV_COLOR[f.severity as keyof typeof SEV_COLOR] ?? '#6B7280';
        return (
          <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
            style={{ color: c, borderColor: `${c}40`, backgroundColor: `${c}12` }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
            {TYPE_LABEL[f.type as keyof typeof TYPE_LABEL] ?? f.type}
          </span>
        );
      })}
    </div>
  );
}
