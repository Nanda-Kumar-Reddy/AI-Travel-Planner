'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plane, Mail, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuthStore, ApiError } from '../../store/auth.store';

// ── Resend button — full loading / success / error states ─────────────────────

interface ResendButtonProps {
  email: string;
}

function ResendSection({ email }: ResendButtonProps) {
  type ResendState = 'idle' | 'loading' | 'success' | 'error';

  const { resendVerification } = useAuthStore();
  const [state, setState] = useState<ResendState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleResend = async () => {
    setState('loading');
    setErrorMessage('');
    try {
      await resendVerification(email);
      setState('success');
    } catch (err) {
      setState('error');
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("We couldn't reach the server. Please check your connection and try again.");
      }
    }
  };

  if (state === 'success') {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-risk-low">
        <CheckCircle className="w-4 h-4 shrink-0" />
        <span>Email sent — check your inbox.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-3 px-4 py-3 rounded-lg bg-risk-high/10 border border-risk-high/25 text-risk-high text-sm"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <button
        onClick={handleResend}
        disabled={state === 'loading'}
        className="btn-secondary w-full justify-center"
        id="verify-pending-resend"
      >
        {state === 'loading' ? (
          <>
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            {state === 'error' ? 'Try sending again' : "Resend verification email"}
          </>
        )}
      </button>
    </div>
  );
}

// ── Page content (reads query param) ─────────────────────────────────────────

function VerifyPendingContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

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
        <div className="card p-8 space-y-6 text-center">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Mail className="w-8 h-8 text-accent" />
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-text-primary">
              Check your email
            </h1>
            {email ? (
              <p className="text-text-secondary text-sm">
                We sent a verification link to{' '}
                <span className="text-text-primary font-medium">{email}</span>.
                Click the link to activate your account.
              </p>
            ) : (
              <p className="text-text-secondary text-sm">
                We sent a verification link to your email address. Click the link to activate your
                account.
              </p>
            )}
          </div>

          {/* Resend section */}
          <div className="space-y-3">
            <p className="text-text-muted text-xs">
              Didn&apos;t receive it? Check your spam folder or resend the email.
            </p>
            {email ? (
              <ResendSection email={email} />
            ) : (
              <Link href="/register" className="btn-secondary w-full justify-center" id="verify-pending-go-to-register">
                Back to sign up
              </Link>
            )}
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-text-muted">
              <span className="bg-surface px-2">Already verified?</span>
            </div>
          </div>

          <Link
            href="/login"
            className="btn-primary w-full justify-center inline-flex"
            id="verify-pending-go-to-login"
          >
            Sign in to your account
          </Link>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          The verification link expires in 24 hours.
        </p>
      </div>
    </main>
  );
}

export default function VerifyPendingPage() {
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
      <VerifyPendingContent />
    </Suspense>
  );
}
