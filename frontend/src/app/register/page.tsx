'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, UserPlus, Plane, Check, Mail } from 'lucide-react';
import { useAuthStore, ApiError } from '../../store/auth.store';
import { cn } from '../../lib/utils';



function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Number or symbol', ok: /[0-9!@#$%^&*]/.test(password) },
  ];

  if (!password) return null;
  return (
    <ul className="mt-2 space-y-1" aria-label="Password requirements">
      {checks.map(({ label, ok }) => (
        <li
          key={label}
          className={cn(
            'flex items-center gap-1.5 text-xs transition-colors',
            ok ? 'text-risk-low' : 'text-text-muted'
          )}
        >
          <Check className={cn('w-3 h-3', ok ? 'opacity-100' : 'opacity-30')} />
          {label}
        </li>
      ))}
    </ul>
  );
}

// ── Google Sign-Up Button ─────────────────────────────────────────────────────

function GoogleSignUpButton({ onSuccess, onError }: {
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
      text: 'signup_with',
      width: node.offsetWidth || 380,
      shape: 'rectangular',
    });
  }, [onSuccess, onError]);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="https://accounts.google.com/gsi/client" async defer />
      <div ref={containerRef} id="google-signup-button" className="w-full" />
    </>
  );
}

// ── Register Page ─────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const { register, loginWithGoogle, user, isLoading } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Post-registration success state — show "check your email" instead of redirecting
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  // Already logged in → redirect
  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Phase 11: register() no longer auto-logs-in.
      // It returns { message, email } and we show the "check email" success state.
      const result = await register({ name, email, password });
      setRegisteredEmail(result.email);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (idToken: string) => {
    setError('');
    setIsGoogleLoading(true);
    try {
      // Google sign-up goes through the same /api/auth/google endpoint.
      // If it's a new user, case 3 creates the account with emailVerified:true.
      // If it's an existing user, they get logged in directly.
      await loginWithGoogle(idToken);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Google sign-up failed. Please try again.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleError = (msg: string) => setError(msg);

  const isFormValid = name.trim().length >= 2 && email.includes('@') && password.length >= 8;
  const anyLoading = isLoading || isSubmitting || isGoogleLoading;

  // ── Success state: show "check your email" ────────────────────────────────
  if (registeredEmail) {
    return (
      <main className="min-h-screen bg-void flex items-center justify-center px-4 py-12">
        <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-warm/8 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Plane className="w-5 h-5 text-accent" strokeWidth={1.5} />
            </div>
            <span className="font-display text-xl font-semibold text-text-primary">
              AI Travel Planner
            </span>
          </div>

          <div className="card p-8 space-y-6 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
                <Mail className="w-8 h-8 text-accent" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold text-text-primary">
                Check your email
              </h1>
              <p className="text-text-secondary text-sm">
                We&apos;ve sent a verification link to{' '}
                <span className="text-text-primary font-medium">{registeredEmail}</span>.
                Click the link to activate your account.
              </p>
              <p className="text-text-muted text-xs mt-2">
                In development / demo mode, the link is logged to the server console
                (EMAIL_MODE=mock).
              </p>
            </div>

            <Link
              href="/login"
              className="btn-primary w-full justify-center inline-flex"
              id="register-success-go-to-login"
            >
              Go to sign in
            </Link>

            <p className="text-text-muted text-xs">
              Didn&apos;t get an email?{' '}
              <button
                onClick={() => setRegisteredEmail(null)}
                className="text-accent hover:text-accent/80 underline underline-offset-2"
              >
                Try a different email
              </button>
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ── Registration form ─────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-void flex items-center justify-center px-4 py-12">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-warm/8 rounded-full blur-3xl" />
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
            <h1 className="font-display text-2xl font-bold text-text-primary">Create your account</h1>
            <p className="text-text-secondary text-sm">Start planning your next adventure</p>
          </div>

          {/* Error message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 px-4 py-3 rounded-lg bg-risk-high/10 border border-risk-high/25 text-risk-high text-sm"
            >
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Google Sign-Up */}
          <div className="space-y-3">
            <GoogleSignUpButton onSuccess={handleGoogleSuccess} onError={handleGoogleError} />
            {isGoogleLoading && (
              <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
                <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                Continuing with Google…
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-text-muted">
              <span className="bg-surface px-2">or create account with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-medium text-text-secondary">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="Alex Johnson"
                disabled={anyLoading}
                minLength={2}
              />
            </div>

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
                onChange={(e) => setEmail(e.target.value)}
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
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn('input pr-11')}
                  placeholder="Min. 8 characters"
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
              <PasswordStrength password={password} />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={anyLoading || !isFormValid}
              className="btn-primary w-full justify-center"
              id="register-submit"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Create account
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
              <span className="bg-surface px-2">Already have an account?</span>
            </div>
          </div>

          <Link href="/login" className="btn-secondary w-full justify-center" id="go-to-login">
            Sign in instead
          </Link>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          Your data is private and isolated — only you can see your trips.
        </p>
      </div>
    </main>
  );
}
