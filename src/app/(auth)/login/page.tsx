// src/app/(auth)/login/page.tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// A shared, public demo account so visitors can try the cart + shopping agent
// without registering. These are NEXT_PUBLIC_ on purpose: the credentials are
// meant to be visible. The button only appears when both are configured.
// Create the account with `node scripts/create-demo-user.mjs`.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
const DEMO_ENABLED = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-base text-slate-100 sm:text-sm placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

type Mode = 'signin' | 'signup';

const EXPIRED_LINK_MESSAGE =
  'That confirmation link is invalid, expired or was already used (each link works once, for about an hour, and a newer email replaces older ones). Enter your email below and press Resend for a fresh one.';

function AuthForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // /callback sends us here with ?confirmed=1 (email verified, but this browser
  // couldn't complete the session) or ?authError=… (bad/expired link).
  const authError = params.get('authError');
  const [error, setError] = useState<string | null>(authError ? EXPIRED_LINK_MESSAGE : null);
  const [notice, setNotice] = useState<string | null>(
    params.get('confirmed') === '1' ? 'Your email is confirmed — sign in below.' : null
  );
  const [busy, setBusy] = useState(false);
  // Set when sign-in fails only because the email link hasn't been clicked yet
  // (or the link was bad), so we can offer to resend it.
  const [needsConfirm, setNeedsConfirm] = useState(Boolean(authError));
  const supabase = createClientComponentClient();

  // Some link errors arrive in the URL fragment (#error_code=otp_expired), which
  // the server never sees — read them client-side too.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hash.get('error_code') || hash.get('error')) {
      setError(EXPIRED_LINK_MESSAGE);
      setNeedsConfirm(true);
    }
  }, []);

  const isSignup = mode === 'signup';

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setNeedsConfirm(false);
  }

  async function signIn(emailValue: string, passwordValue: string, resetDemoData = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setNeedsConfirm(false);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password: passwordValue,
    });

    if (error || !data.user) {
      if (/not confirmed/i.test(error?.message ?? '')) {
        setNeedsConfirm(true);
        setError(
          "Your email address isn't confirmed yet. Open the link we emailed you (check spam too), or resend it below."
        );
      } else {
        setError(error?.message ?? 'Sign in failed.');
      }
      setBusy(false);
      return;
    }

    // The demo account is shared, so start every demo session from an empty
    // cart / wishlist (RLS lets a user delete only their own rows). Failures
    // are non-fatal — saved_items may not exist if wishlist.sql wasn't run.
    if (resetDemoData) {
      await supabase.from('cart_items').delete().eq('user_id', data.user.id);
      await supabase.from('saved_items').delete().eq('user_id', data.user.id);
    }

    // Full navigation so server components pick up the new session cookie.
    window.location.href = '/';
  }

  async function signUp() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Where the confirmation link in the email lands (exchanges the code for
      // a session, then redirects home). Must be in Supabase's allowed
      // redirect URLs: Authentication → URL Configuration.
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // Email confirmation is OFF in the project: we already have a session.
    if (data.session) {
      window.location.href = '/';
      return;
    }

    // Supabase hides whether an email is registered (to prevent enumeration)
    // by returning a user with no identities for an existing address.
    if (data.user && data.user.identities?.length === 0) {
      setError('An account with this email already exists. Try signing in instead.');
      setBusy(false);
      return;
    }

    setNotice(`Almost there — we sent a confirmation link to ${email}. Click it, then come back and sign in.`);
    setBusy(false);
  }

  async function resendConfirmation() {
    if (!email.trim()) {
      setError('Enter your email address above first, then press Resend.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    if (error) setError(error.message);
    else setNotice(`We sent a new confirmation link to ${email}. It can take a minute to arrive.`);
    setBusy(false);
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSignup) void signUp();
    else void signIn(email, password);
  };

  return (
    <div className="container mx-auto flex justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur sm:p-8">
          <h1 className="text-xl font-bold text-slate-100">
            {isSignup ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {isSignup
              ? 'Sign up to save a cart and use the shopping agent.'
              : 'Browsing and search are public. Sign in to use the cart and the shopping agent.'}
          </p>

          {DEMO_ENABLED && !isSignup && (
            <div className="mt-6">
              <button
                type="button"
                disabled={busy}
                onClick={() => void signIn(DEMO_EMAIL!, DEMO_PASSWORD!, true)}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {busy ? 'Signing in…' : 'Try the demo — no sign-up'}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Shared demo account. Its cart is cleared each time someone starts a demo session.
              </p>
              <div className="my-6 flex items-center gap-3 text-xs text-slate-500">
                <span className="h-px flex-1 bg-slate-800" />
                or sign in with your own account
                <span className="h-px flex-1 bg-slate-800" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className={DEMO_ENABLED && !isSignup ? '' : 'mt-6'}>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
                required
              />
            </div>
            <div className="mb-6">
              <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                minLength={isSignup ? 6 : undefined}
                className={inputClass}
                required
              />
              {isSignup && <p className="mt-1.5 text-xs text-slate-500">At least 6 characters.</p>}
            </div>
            <button
              type="submit"
              disabled={busy}
              className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                DEMO_ENABLED && !isSignup
                  ? 'border border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            </button>

            {error && (
              <p role="alert" className="mt-4 text-center text-sm text-rose-400">
                {error}
              </p>
            )}
            {needsConfirm && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void resendConfirmation()}
                className="mt-3 w-full rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-60"
              >
                Resend confirmation email
              </button>
            )}
            {notice && (
              <p
                role="status"
                className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-200"
              >
                {notice}
              </p>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {isSignup ? 'Already have an account?' : 'New here?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
              className="font-semibold text-indigo-400 underline-offset-4 hover:text-indigo-300 hover:underline"
            >
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary in the App Router, or
// the production build fails when it prerenders this page.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
