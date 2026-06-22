'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, LogIn, Plane, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { useAuthStore, ApiError } from '../../store/auth.store';
import { cn } from '../../lib/utils';



function GoogleSignInButton({ onSuccess, onError }: {
  onSuccess: (idToken: string) => void;
  onError: (msg: string) => void;
}) {
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          onSuccess(response.credential);
        } else {
          onError('Google sign-in did not return a credential. Please try again.');
        }
      },
    });

    window.google.accounts.id.renderButton(node, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: node.offsetWidth || 380,
      shape: 'rectangular',
    });
  }, [onSuccess, onError]);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null; // Google Sign-In not configured — hide button entirely

  return (
    <>
      {/* Load GIS script — only when GOOGLE_CLIENT_ID is set */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="https://accounts.google.com/gsi/client" async defer />
      <div ref={containerRef} id="google-signin-button" className="w-full" />
    </>
  );
}

// ── Inline resend verification widget — shown on EMAIL_NOT_VERIFIED ───────────
// Lives on the login form so the user never has to navigate away to retry.

interface InlineResendProps {
  email: string;
}

function InlineResendWidget({ email }: InlineResendProps) {
  type ResendState = 'idle' | 'loading' | 'success' | 'error';
  const { resendVerification } = useAuthStore();
  const [state, setState] = useState<ResendState>('idle');
  const [resendError, setResendError] = useState('');

  const handleResend = async () => {
    setState('loading');
    setResendError('');
    try {
      await resendVerification(email);
      setState('success');
    } catch (err) {
      setState('error');
      if (err instanceof ApiError) {
        setResendError(err.message);
      } else {
        setResendError("We couldn't reach the server. Please check your connection and try again.");
      }
    }
  };

  if (state === 'success') {
    return (
      <div className="flex items-center gap-2 text-sm text-risk-low justify-center py-1">
        <CheckCircle className="w-4 h-4 shrink-0" />
        <span>Email sent — check your inbox.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state === 'error' && (
        <p className="text-xs text-risk-high text-center">{resendError}</p>
      )}
      <button
        onClick={handleResend}
        disabled={state === 'loading'}
        className="btn-secondary w-full justify-center text-sm"
        id="login-resend-verification"
      >
        {state === 'loading' ? (
          <>
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            {state === 'error' ? 'Try sending again' : 'Resend verification email'}
          </>
        )}
      </button>
    </div>
  );
}

// ── Login Form ────────────────────────────────────────────────────────────────

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/dashboard';

  const { login, loginWithGoogle, user, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // error: generic message or credential error message
  const [error, setError] = useState('');
  // emailNotVerified: distinct state for EMAIL_NOT_VERIFIED — show resend widget inline
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (user) {
      router.replace(decodeURIComponent(returnTo));
    }
  }, [user, router, returnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailNotVerified(false);

    // Enter loading state immediately — persists for the full request duration
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.replace(decodeURIComponent(returnTo));
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          // Phase 12: correct credentials, email just not verified.
          // Show the specific message + inline resend widget on the login form —
          // the user is already trying to get in, don't force navigation away.
          setEmailNotVerified(true);
          setUnverifiedEmail(email);
          setError(err.message);
        } else {
          // 401 invalid credentials — generic anti-enumeration message
          setError(err.message);
        }
      } else if (err instanceof TypeError) {
        // Network failure — request never reached the server
        setError("We couldn't reach the server. Please check your connection and try again.");
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (idToken: string) => {
    setError('');
    setEmailNotVerified(false);
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle(idToken);
      router.replace(decodeURIComponent(returnTo));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleError = (msg: string) => setError(msg);

  const anyLoading = isLoading || isSubmitting || isGoogleLoading;

  return (
    <main className="min-h-screen bg-void flex items-center justify-center px-4 py-12">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent-warm/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo mark */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
            <Plane className="w-5 h-5 text-accent" strokeWidth={1.5} />
          </div>
          <span className="font-display text-xl font-semibold text-text-primary">
            AI Travel Planner
          </span>
        </div>

        {/* Card */}
        <div className="card p-8 space-y-6">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-text-primary">Welcome back</h1>
            <p className="text-text-secondary text-sm">Sign in to access your trips</p>
          </div>

          {/* Error message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 px-4 py-3 rounded-lg bg-risk-high/10 border border-risk-high/25 text-risk-high text-sm"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Inline resend widget — only shown on EMAIL_NOT_VERIFIED */}
          {emailNotVerified && unverifiedEmail && (
            <div className="space-y-2">
              <p className="text-text-muted text-xs text-center">
                Verify your email to continue, or resend the link:
              </p>
              <InlineResendWidget email={unverifiedEmail} />
            </div>
          )}

          {/* Google Sign-In */}
          <div className="space-y-3">
            <GoogleSignInButton onSuccess={handleGoogleSuccess} onError={handleGoogleError} />
            {isGoogleLoading && (
              <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
                <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                Signing in with Google…
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-text-muted">
              <span className="bg-surface px-2">or sign in with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // Clear the NOT_VERIFIED state if the user edits the email
                  if (emailNotVerified) {
                    setEmailNotVerified(false);
                    setError('');
                  }
                }}
                className="input"
                placeholder="you@example.com"
                disabled={anyLoading}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn('input pr-11')}
                  placeholder="••••••••"
                  disabled={anyLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={anyLoading || !email || !password}
              className="btn-primary w-full justify-center"
              id="login-submit"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign in
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-text-muted">
              <span className="bg-surface px-2">Don&apos;t have an account?</span>
            </div>
          </div>

          <Link
            href="/register"
            className="btn-secondary w-full justify-center"
            id="go-to-register"
          >
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}

// Page export wraps LoginForm in Suspense so Next.js can statically
// generate the page shell without executing useSearchParams() at build time.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'var(--color-void)' }}
        >
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
