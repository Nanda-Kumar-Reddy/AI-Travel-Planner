'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plane, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';

type VerifyState = 'loading' | 'success' | 'error' | 'already-verified';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerifyState>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No verification token found in the URL. Please use the link from your email.');
      return;
    }

    // Immediately call verify on mount — user landed here by clicking the email link
    async function verify() {
      try {
        const result = await api.get<{ message: string }>(`/api/auth/verify-email?token=${token}`);
        if (result.message.includes('already')) {
          setState('already-verified');
        } else {
          setState('success');
        }
        setMessage(result.message);
      } catch (err) {
        setState('error');
        if (err instanceof ApiError) {
          setMessage(err.message);
        } else {
          setMessage('Something went wrong. Please try requesting a new verification link.');
        }
      }
    }

    verify();
  }, [token]);

  return (
    <main className="min-h-screen bg-void flex items-center justify-center px-4 py-12">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent-warm/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
            <Plane className="w-5 h-5 text-accent" strokeWidth={1.5} />
          </div>
          <span className="font-display text-xl font-semibold text-text-primary">
            AI Travel Planner
          </span>
        </div>

        <div className="card p-8 space-y-6 text-center">
          {state === 'loading' && (
            <>
              <div className="flex justify-center">
                <Loader2 className="w-12 h-12 text-accent animate-spin" />
              </div>
              <h1 className="font-display text-2xl font-bold text-text-primary">
                Verifying your email…
              </h1>
              <p className="text-text-secondary text-sm">Just a moment.</p>
            </>
          )}

          {(state === 'success' || state === 'already-verified') && (
            <>
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-risk-low/15 border border-risk-low/30 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-risk-low" />
                </div>
              </div>
              <h1 className="font-display text-2xl font-bold text-text-primary">
                {state === 'already-verified' ? 'Already verified' : 'Email verified!'}
              </h1>
              <p className="text-text-secondary text-sm">{message}</p>
              <Link
                href="/login"
                className="btn-primary w-full justify-center inline-flex"
                id="verify-go-to-login"
              >
                Sign in to your account
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-risk-high/15 border border-risk-high/30 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-risk-high" />
                </div>
              </div>
              <h1 className="font-display text-2xl font-bold text-text-primary">
                Verification failed
              </h1>
              <p className="text-text-secondary text-sm">{message}</p>
              <div className="space-y-3">
                <Link
                  href="/login"
                  className="btn-primary w-full justify-center inline-flex"
                  id="verify-error-go-to-login"
                >
                  Sign in and request a new link
                </Link>
                <Link
                  href="/register"
                  className="btn-secondary w-full justify-center inline-flex"
                  id="verify-error-go-to-register"
                >
                  Create a new account
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
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
      <VerifyEmailContent />
    </Suspense>
  );
}
