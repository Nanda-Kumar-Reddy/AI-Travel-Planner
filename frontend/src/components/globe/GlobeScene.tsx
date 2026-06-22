'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTheme } from 'next-themes';
import * as THREE from 'three';

// ── Globe mesh ────────────────────────────────────────────────────────────────
function GlobeMesh({ isDark }: { isDark: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);

  // Theme-aware colors
  const oceanColor  = isDark ? '#0f172a' : '#bfdbfe';
  const landColor   = isDark ? '#312e81' : '#6366f1';
  const atmosColor  = isDark ? '#6366f1' : '#818cf8';
  const atmosOpacity = isDark ? 0.18 : 0.28;
  const gridColor   = isDark ? '#4f46e5' : '#818cf8';
  const gridOpacity = isDark ? 0.15 : 0.12;

  // Procedural lat/lon grid texture
  const gridTexture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fill ocean
    ctx.fillStyle = oceanColor;
    ctx.fillRect(0, 0, size, size);

    // Lat/lon grid
    ctx.strokeStyle = gridColor;
    ctx.globalAlpha = gridOpacity;
    ctx.lineWidth = 0.8;
    const latLines = 12;
    const lonLines = 24;
    for (let i = 0; i <= latLines; i++) {
      const y = (i / latLines) * size;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    for (let i = 0; i <= lonLines; i++) {
      const x = (i / lonLines) * size;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }

    // Stylised land masses (simplified blobs)
    ctx.globalAlpha = 1;
    ctx.fillStyle = landColor;

    // North America
    ctx.beginPath();
    ctx.ellipse(100, 180, 60, 70, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Europe
    ctx.beginPath();
    ctx.ellipse(275, 155, 32, 38, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Africa
    ctx.beginPath();
    ctx.ellipse(280, 265, 40, 65, 0, 0, Math.PI * 2);
    ctx.fill();
    // Asia
    ctx.beginPath();
    ctx.ellipse(370, 165, 80, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    // Australia
    ctx.beginPath();
    ctx.ellipse(410, 300, 35, 28, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // South America
    ctx.beginPath();
    ctx.ellipse(155, 300, 32, 55, 0.1, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  // Slow auto-rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.08;
    }
    if (atmosphereRef.current) {
      atmosphereRef.current.rotation.y += delta * 0.06;
    }
  });

  return (
    <>
      {/* Atmosphere shell — slightly larger than globe */}
      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1.06, 64, 64]} />
        <meshPhongMaterial
          color={atmosColor}
          transparent
          opacity={atmosOpacity}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Globe sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhongMaterial map={gridTexture} />
      </mesh>
    </>
  );
}

// ── Scene lighting ────────────────────────────────────────────────────────────
function Lights({ isDark }: { isDark: boolean }) {
  const ambientIntensity    = isDark ? 0.15 : 0.55;
  const directionalIntensity = isDark ? 0.85 : 1.25;
  const rimIntensity         = isDark ? 0.3  : 0.15;

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        position={[3, 2, 3]}
        intensity={directionalIntensity}
        color={isDark ? '#c7d2fe' : '#fef3c7'}
      />
      {/* Rim light from left for depth */}
      <directionalLight
        position={[-3, 0, -2]}
        intensity={rimIntensity}
        color={isDark ? '#6366f1' : '#818cf8'}
      />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface GlobeSceneProps {
  /** Canvas size in px; drops to 300 on mobile (< 640px) */
  size?: number;
  className?: string;
}

export function GlobeScene({ size = 480, className = '' }: GlobeSceneProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Outer glow ring — theme aware */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none z-10"
        style={{
          boxShadow: isDark
            ? '0 0 60px 20px rgba(99,102,241,0.18), inset 0 0 40px rgba(99,102,241,0.08)'
            : '0 0 50px 15px rgba(129,140,248,0.22), inset 0 0 30px rgba(129,140,248,0.10)',
        }}
      />
      <Canvas
        camera={{ position: [0, 0, 2.6], fov: 40 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
      >
        <Lights isDark={isDark} />
        <GlobeMesh isDark={isDark} />
      </Canvas>
    </div>
  );
}
