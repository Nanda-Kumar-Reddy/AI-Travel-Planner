'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '../../store/auth.store';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute — wraps pages that require authentication.
 *
 * Behavior:
 * - While isInitialized is false (i.e., the initial /me check is in flight),
 *   render nothing (avoids flash of redirect before we know auth state).
 * - Once initialized: if no user, redirect to /login?returnTo=<current path>
 *   so the user lands back where they intended after logging in.
 * - If authenticated: render children.
 *
 * Usage: wrap protected page layouts, e.g.:
 *   export default function DashboardLayout({ children }) {
 *     return <ProtectedRoute>{children}</ProtectedRoute>;
 *   }
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isInitialized } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isInitialized) return; // still checking — wait
    if (!user) {
      const returnTo = encodeURIComponent(pathname);
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [user, isInitialized, router, pathname]);

  // Don't render anything until we know auth state
  // (avoids flash of protected content or premature redirect)
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Unauthenticated — return null while redirect is in progress
  if (!user) return null;

  return <>{children}</>;
}
