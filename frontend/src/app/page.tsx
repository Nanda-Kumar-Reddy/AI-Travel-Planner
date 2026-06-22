'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import { Plane, Sparkles, Shield, TrendingUp, ChevronRight, MapPin } from 'lucide-react';
import { ThemeToggle } from '../components/theme/ThemeToggle';

// ── Globe fallback (shown while WebGL loads) ───────────────────────────────────────
function GlobeFallback({ size }: { size: number }) {
  return (
    <div
      className="rounded-full skeleton"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

// next/dynamic with ssr:false — avoids WebGL SSR crash
const GlobeScene = dynamic(
  () => import('../components/globe/GlobeScene').then((m) => m.GlobeScene),
  { ssr: false, loading: () => <GlobeFallback size={420} /> }
);

// ── Animation variants ────────────────────────────────────────────────────────
const heroContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const heroItem = {
  hidden: { opacity: 0, y: 24 },
  show:  { opacity: 1, y: 0,  transition: { type: 'spring', stiffness: 260, damping: 22 } },
};

const featureCards = [
  {
    icon: Sparkles,
    title: 'AI-Generated Itineraries',
    description: 'Gemini crafts day-by-day plans tailored to your interests, duration, and budget — in seconds.',
  },
  {
    icon: Shield,
    title: 'Real-Time Risk Co-Pilot',
    description: 'Pacing, budget overruns, and weather risks flagged instantly, with one-click AI fixes.',
  },
  {
    icon: TrendingUp,
    title: 'Confidence Scoring',
    description: 'Every itinerary gets a live score so you know exactly how solid your plan is before you travel.',
  },
];

// ── Landing page ──────────────────────────────────────────────────────────────
export default function HomePage() {
  const prefersReduced = useReducedMotion();


  // If reduced motion, use simpler fade-only animation
  const itemVariant = prefersReduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : heroItem;

  const containerVariant = prefersReduced
    ? { hidden: {}, show: { transition: { staggerChildren: 0 } } }
    : heroContainer;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-void)', color: 'var(--color-text-primary)' }}
    >
      {/* ── Ambient background blobs ──────────────────────────────────────── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full blur-3xl"
          style={{ background: 'rgba(99,102,241,0.07)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full blur-3xl"
          style={{ background: 'rgba(99,102,241,0.05)' }}
        />
      </div>

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <header className="nav-glass sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
            >
              <Plane size={16} style={{ color: 'var(--color-accent)' }} strokeWidth={1.5} />
            </div>
            <span
              className="font-display font-semibold text-sm hidden sm:block"
              style={{ color: 'var(--color-text-primary)' }}
            >
              AI Travel Planner
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="btn-ghost text-sm px-3 py-1.5"
              id="landing-signin"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="btn-primary text-sm px-4 py-2 hidden sm:inline-flex"
              id="landing-get-started-nav"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero section ─────────────────────────────────────────────────── */}
      <main className="flex-1">
        <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

            {/* Left — copy */}
            <motion.div
              variants={containerVariant}
              initial="hidden"
              animate="show"
              className="max-w-xl"
            >
              {/* Eyebrow badge */}
              <motion.div variants={itemVariant} className="mb-6">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border"
                  style={{
                    color: 'var(--color-accent)',
                    backgroundColor: 'rgba(99,102,241,0.10)',
                    borderColor: 'rgba(99,102,241,0.25)',
                  }}
                >
                  <Sparkles size={11} />
                  Powered by Gemini AI
                </span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                variants={itemVariant}
                className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl leading-[1.1] tracking-tight mb-5"
              >
                Plan smarter.{' '}
                <span
                  className="text-gradient-accent"
                  style={{ display: 'inline-block' }}
                >
                  Travel better.
                </span>
              </motion.h1>

              {/* Sub-headline */}
              <motion.p
                variants={itemVariant}
                className="text-lg leading-relaxed mb-8"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Generate complete, day-by-day travel itineraries in seconds.
                Get a real-time confidence score, AI risk flags, and one-click
                fixes — before you ever book a flight.
              </motion.p>

              {/* CTAs */}
              <motion.div variants={itemVariant} className="flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="btn-primary gap-2"
                  id="landing-cta-primary"
                >
                  Start planning for free
                  <ChevronRight size={16} />
                </Link>
                <Link
                  href="/login"
                  className="btn-secondary gap-2"
                  id="landing-cta-secondary"
                >
                  <MapPin size={15} />
                  See a demo trip
                </Link>
              </motion.div>

              {/* Social proof micro-line */}
              <motion.p
                variants={itemVariant}
                className="mt-5 text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                No credit card required · Takes &lt; 60 seconds to generate your first itinerary
              </motion.p>
            </motion.div>

            {/* Right — 3D Globe */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                prefersReduced
                  ? { duration: 0.3 }
                  : { type: 'spring', stiffness: 120, damping: 20, delay: 0.25 }
              }
              className="flex justify-center lg:justify-end"
            >
              {/* Responsive globe: 300px on mobile, 420px on sm+ via CSS container query */}
              <div className="block sm:hidden">
                <GlobeScene size={300} className="drop-shadow-2xl" />
              </div>
              <div className="hidden sm:block">
                <GlobeScene size={420} className="drop-shadow-2xl" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <div
          className="max-w-6xl mx-auto px-4 sm:px-6"
          style={{ borderTop: '1px solid var(--color-border)' }}
        />

        {/* ── Feature cards ────────────────────────────────────────────────── */}
        <section
          className="max-w-6xl mx-auto px-4 sm:px-6 py-20"
          aria-label="Key features"
        >
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={
              prefersReduced
                ? { duration: 0.2 }
                : { type: 'spring', stiffness: 240, damping: 24 }
            }
          >
            <h2
              className="font-display text-2xl sm:text-3xl font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Everything you need to travel with confidence
            </h2>
            <p
              className="text-base max-w-lg mx-auto"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              From initial research to day-by-day scheduling, AI Travel Planner covers every phase of your trip.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {featureCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.title}
                  className="card card-interactive p-6"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={
                    prefersReduced
                      ? { duration: 0.2 }
                      : {
                          type: 'spring',
                          stiffness: 250,
                          damping: 22,
                          delay: i * 0.08,
                        }
                  }
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      background: 'rgba(99,102,241,0.12)',
                      border: '1px solid rgba(99,102,241,0.2)',
                    }}
                  >
                    <Icon size={18} style={{ color: 'var(--color-accent)' }} strokeWidth={1.5} />
                  </div>
                  <h3
                    className="font-display font-semibold text-base mb-2"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {card.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── Final CTA strip ──────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          <motion.div
            className="card p-10 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={
              prefersReduced
                ? { duration: 0.2 }
                : { type: 'spring', stiffness: 220, damping: 24, delay: 0.1 }
            }
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.02) 100%)',
              borderColor: 'rgba(99,102,241,0.2)',
            }}
          >
            <h2
              className="font-display text-2xl sm:text-3xl font-bold mb-3"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Ready to plan your next adventure?
            </h2>
            <p
              className="mb-7 text-base"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Join travellers who trust AI to make every day count.
            </p>
            <Link
              href="/register"
              className="btn-primary inline-flex"
              id="landing-cta-final"
            >
              Create your free itinerary
              <ChevronRight size={16} />
            </Link>
          </motion.div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer
        className="border-t py-6"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <span>© {new Date().getFullYear()} AI Travel Planner</span>
          <span>Built with Gemini AI · Editorial Indigo design system</span>
        </div>
      </footer>
    </div>
  );
}
