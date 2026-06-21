import Link from 'next/link';

// Landing page — actual hero content built in Phase 9 UI polish
// This is the structural scaffold with routing only
export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-void px-4">
      <div className="text-center max-w-2xl">
        <h1 className="font-display text-5xl font-bold text-gradient mb-4">
          AI Travel Planner
        </h1>
        <p className="text-text-secondary text-lg mb-8">
          Generate intelligent, confidence-scored travel itineraries powered by Gemini AI.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/register" className="btn-primary">
            Get Started
          </Link>
          <Link href="/login" className="btn-secondary">
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
