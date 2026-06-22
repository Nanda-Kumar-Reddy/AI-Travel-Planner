'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/auth.store';

/**
 * AuthProvider — runs the auth store's init() action once on app mount.
 * This hits GET /api/auth/me to check if the httpOnly cookie is valid
 * and populates the user state before any protected routes render.
 *
 * Must be a Client Component because it uses useEffect.
 * Place it in the root layout wrapping {children}.
 *
 * ── Why the `initialized` ref is critical ────────────────────────────────────
 * React 18 StrictMode (active in development) intentionally runs effects twice
 * to expose bugs:
 *   mount → cleanup → mount
 *
 * Without the ref guard, init() would be called twice concurrently:
 *   1. Both calls hit GET /api/auth/me → both get 401 (access token expired)
 *   2. Call 1 triggers silent refresh, sets isRefreshing flag, fires refresh
 *   3. Call 2 sees isRefreshing=true, skips refresh, gets ApiError(401)
 *   4. Call 2's catch block runs: setUser(null)
 *   5. Call 1's refresh succeeds → retries /me → gets user → setUser(user)
 *   6. Call 2's catch runs AFTER call 1 sets user → final state: user=null
 *   → User appears logged out even though session is valid
 *
 * The ref guard ensures init() fires exactly once, regardless of StrictMode.
 * Note: in production StrictMode is inactive, so this only matters in dev.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const init = useAuthStore((state) => state.init);
  const initialized = useRef(false);

  useEffect(() => {
    // Guard: only run init() once, even if StrictMode double-invokes this effect
    if (initialized.current) return;
    initialized.current = true;
    init();
  }, [init]);

  return <>{children}</>;
}
