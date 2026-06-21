'use client';

import { useEffect } from 'react';
import { useAuthStore } from '../../store/auth.store';

/**
 * AuthProvider — runs the auth store's init() action once on app mount.
 * This hits GET /api/auth/me to check if the httpOnly cookie is valid
 * and populates the user state before any protected routes render.
 *
 * Must be a Client Component because it uses useEffect.
 * Place it in the root layout wrapping {children}.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const init = useAuthStore((state) => state.init);

  useEffect(() => {
    init();
  }, [init]);

  return <>{children}</>;
}
