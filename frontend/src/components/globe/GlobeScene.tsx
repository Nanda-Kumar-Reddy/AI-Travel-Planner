'use client';

import { useTheme } from 'next-themes';

interface GlobeSceneProps {
  size?: number;
  className?: string;
}

export function GlobeScene({ size = 480, className = '' }: GlobeSceneProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const ocean  = isDark ? '#0f172a' : '#bfdbfe';
  const land   = isDark ? '#312e81' : '#6366f1';
  const grid   = isDark ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.18)';
  const atmos  = isDark ? 'rgba(99,102,241,0.16)' : 'rgba(129,140,248,0.20)';
  const glow   = isDark
    ? '0 0 60px 20px rgba(99,102,241,0.18), inset 0 0 40px rgba(99,102,241,0.08)'
    : '0 0 50px 15px rgba(129,140,248,0.22), inset 0 0 30px rgba(129,140,248,0.10)';

  const gridSize = Math.round(size / 9);
  const animDur  = 22; // seconds per full rotation

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: 'relative' }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes globe-spin {
          from { background-position-x: 0; }
          to   { background-position-x: -${size}px; }
        }
        @keyframes atmos-pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1; }
        }
        @keyframes continent-drift {
          from { transform: translateX(0); }
          to   { transform: translateX(-${size}px); }
        }
      `}</style>

      {/* ── Sphere shell ─────────────────────────────────────────────── */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative',
          background: `radial-gradient(circle at 32% 36%, ${land} 0%, ${ocean} 55%)`,
          boxShadow: glow,
        }}
      >
        {/* Scrolling lat/lon grid — simulates rotation */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              repeating-linear-gradient(0deg,   ${grid} 0, ${grid} 1px, transparent 1px, transparent ${gridSize}px),
              repeating-linear-gradient(90deg,  ${grid} 0, ${grid} 1px, transparent 1px, transparent ${gridSize}px)
            `,
            backgroundSize: `${size}px ${size}px`,
            animation: `globe-spin ${animDur}s linear infinite`,
          }}
        />

        {/* Stylised continent blobs drifting with the rotation */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            animation: `continent-drift ${animDur}s linear infinite`,
          }}
        >
          {/* Duplicate strip so the loop is seamless */}
          {[0, size].map((offset) => (
            <svg
              key={offset}
              viewBox={`0 0 ${size} ${size}`}
              style={{ position: 'absolute', top: 0, left: offset, width: size, height: size }}
            >
              {/* North America */}
              <ellipse cx={size * 0.20} cy={size * 0.35} rx={size * 0.11} ry={size * 0.13}
                fill={land} opacity={0.85} transform={`rotate(-12,${size*0.20},${size*0.35})`} />
              {/* Europe */}
              <ellipse cx={size * 0.54} cy={size * 0.30} rx={size * 0.06} ry={size * 0.075}
                fill={land} opacity={0.85} transform={`rotate(8,${size*0.54},${size*0.30})`} />
              {/* Africa */}
              <ellipse cx={size * 0.55} cy={size * 0.52} rx={size * 0.078} ry={size * 0.13}
                fill={land} opacity={0.85} />
              {/* Asia */}
              <ellipse cx={size * 0.72} cy={size * 0.32} rx={size * 0.15} ry={size * 0.115}
                fill={land} opacity={0.85} transform={`rotate(5,${size*0.72},${size*0.32})`} />
              {/* Australia */}
              <ellipse cx={size * 0.80} cy={size * 0.59} rx={size * 0.068} ry={size * 0.054}
                fill={land} opacity={0.80} transform={`rotate(18,${size*0.80},${size*0.59})`} />
              {/* South America */}
              <ellipse cx={size * 0.30} cy={size * 0.58} rx={size * 0.062} ry={size * 0.105}
                fill={land} opacity={0.85} transform={`rotate(8,${size*0.30},${size*0.58})`} />
            </svg>
          ))}
        </div>

        {/* Atmosphere limb on right edge */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle at 72% 62%, transparent 38%, ${atmos} 100%)`,
            animation: `atmos-pulse 4s ease-in-out infinite`,
          }}
        />

        {/* Edge vignette — depth illusion */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 50%, transparent 46%, rgba(0,0,0,0.42) 100%)',
          }}
        />

        {/* Specular highlight */}
        <div
          style={{
            position: 'absolute',
            top: '12%',
            left: '14%',
            width: '32%',
            height: '26%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.13) 0%, transparent 70%)',
          }}
        />
      </div>
    </div>
  );
}
