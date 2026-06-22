'use client';

import { useState } from 'react';
import { Mail, X, RefreshCw, CheckCircle } from 'lucide-react';
import { useAuthStore, ApiError } from '../../store/auth.store';

/**
 * EmailVerificationBanner — non-blocking reminder shown when the logged-in
 * user has not verified their email address.
 *
 * Design decisions:
 * - Non-blocking (see docs/AUTH.md): users can use the app, they just see this banner.
 * - Dismissible: respect that the user knows about it and may verify later.
 * - Resend button: one-click to get a new link if the original expired or was lost.
 * - Anti-enumeration: resend always shows "link sent" regardless of backend outcome.
 */
export function EmailVerificationBanner() {
  const { user, resendVerification } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Only show if user is logged in, email is not verified, and banner not dismissed
  if (!user || user.emailVerified !== false || dismissed) return null;

  const handleResend = async () => {
    setIsSending(true);
    setError('');
    try {
      await resendVerification(user.email);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full px-4 py-3 flex items-center gap-3 text-sm"
      style={{
        background: 'hsl(245 60% 18% / 0.85)',
        borderBottom: '1px solid hsl(245 60% 40% / 0.3)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Mail className="w-4 h-4 text-accent shrink-0" />

      <span className="text-text-secondary flex-1 min-w-0">
        {sent ? (
          <span className="flex items-center gap-1.5 text-risk-low">
            <CheckCircle className="w-3.5 h-3.5" />
            Verification link sent — check your inbox (or the server console in mock mode).
          </span>
        ) : (
          <>
            <span className="text-text-primary font-medium">Verify your email</span>
            {' '}— check your inbox for a link from us.{' '}
            {error && <span className="text-risk-high">{error} </span>}
            <button
              onClick={handleResend}
              disabled={isSending}
              className="text-accent hover:text-accent/80 underline underline-offset-2 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
              aria-label="Resend verification email"
            >
              {isSending ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : null}
              {isSending ? 'Sending…' : 'Resend link'}
            </button>
          </>
        )}
      </span>

      <button
        onClick={() => setDismissed(true)}
        className="text-text-muted hover:text-text-secondary transition-colors shrink-0"
        aria-label="Dismiss email verification reminder"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
