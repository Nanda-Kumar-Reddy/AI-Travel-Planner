import type { Metadata } from 'next';
import { Outfit, Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '../components/auth/AuthProvider';
import { ThemeProvider } from '../components/theme/ThemeProvider';

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

// Anti-flash script: runs synchronously before paint to apply stored theme
// Must be inlined (beforeInteractive) to block paint until theme is applied
const antiFlashScript = `
(function() {
  try {
    var stored = localStorage.getItem('atp-theme');
    var theme = stored === 'light' ? 'light'
              : stored === 'dark'  ? 'dark'
              : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Synchronous anti-flash script — must run before any CSS paint */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: antiFlashScript }}
        />
      </head>
      <body className="antialiased" style={{ fontFamily: 'var(--font-body)' }} suppressHydrationWarning>
        <ThemeProvider>
          {/* AuthProvider runs init() on mount to restore session from httpOnly cookie */}
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
