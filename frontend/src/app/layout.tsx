import type { Metadata } from 'next';
import { Outfit, Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../components/auth/AuthProvider';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Travel Planner — Plan Smarter, Travel Better',
  description:
    'Generate AI-powered day-by-day travel itineraries, estimate your budget, and get a real-time confidence score that tells you exactly where your plan is strong — and where to improve it.',
  keywords: ['travel planner', 'AI itinerary', 'trip planning', 'travel budget'],
  openGraph: {
    title: 'AI Travel Planner',
    description: 'Generate AI-powered travel itineraries with real-time confidence scoring.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body className="bg-void text-text-primary font-body antialiased">
        {/* AuthProvider runs init() on mount to restore session from httpOnly cookie */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
