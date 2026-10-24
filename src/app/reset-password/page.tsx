// src/app/reset-password/page.tsx
//
// Where the "reset your password" email lands. The link carries a one-time
// `?code=`; this page swaps it for a session and then lets the user choose a
// new password with supabase.auth.updateUser.
//
// The code can only be exchanged by the SAME browser that asked for the reset
// (the PKCE verifier lives there), so opening the link on another device shows
// the "invalid link" state with a way to request a new one.
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-base text-slate-100 sm:text-sm placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

function ResetForm() {
  const supabase = createClientComponentClient();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // React StrictMode runs effects twice in development; a one-time code can only
  // be exchanged once, so make sure we only try it once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const linkFailed = url.searchParams.has('error') || url.searchParams.has('error_code') || url.hash.includes('error');

      if (linkFailed) {
        setPhase('invalid');
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        // Take the one-time code out of the address bar whatever happened.
        window.history.replaceState({}, '', '/reset-password');
        if (exchangeError) {
          setPhase('invalid');
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      setPhase(data.session ? 'ready' : 'invalid');
    })();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) return setError('Use at least 6 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) return setError(updateError.message);
    setPhase('done');
  }

  return (
    <div className="container mx-auto flex justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur sm:p-8">
        <h1 className="text-xl font-bold text-slate-100">Choose a new password</h1>

        {phase === 'checking' && (
          <p role="status" className="mt-4 text-sm text-slate-400">
            Checking your reset link…
          </p>
        )}

        {phase === 'invalid' && (
          <div className="mt-4 space-y-4">
            <p role="alert" className="text-sm text-rose-300">
              This reset link is invalid, has expired, or was opened in a different browser from the one that asked for it.
              Links work once and last about an hour.
            </p>
            <Link
              href="/login?mode=reset"
              className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Request a new link
            </Link>
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={handleSubmit} className="mt-4">
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                required
              />
              <p className="mt-1.5 text-xs text-slate-500">At least 6 characters.</p>
            </div>
            <div className="mb-6">
              <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Update password'}
            </button>
            {error && (
              <p role="alert" className="mt-4 text-center text-sm text-rose-400">
                {error}
              </p>
            )}
          </form>
        )}

        {phase === 'done' && (
          <div className="mt-4 space-y-4">
            <p
              role="status"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
            >
              Your password has been updated and you are signed in.
            </p>
            <Link
              href="/"
              className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Continue to the store
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams-free, but keep a Suspense boundary: the page reads the URL on
  // the client and this keeps prerendering safe if that changes.
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
