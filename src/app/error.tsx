// src/app/error.tsx — error boundary for any route segment that throws.
'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">Something went wrong</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
        This page failed to load. If the demo has been idle it may still be waking up — try again in a
        few seconds.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          Back to the store
        </Link>
      </div>
    </div>
  );
}
