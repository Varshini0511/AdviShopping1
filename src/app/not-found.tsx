// src/app/not-found.tsx — shown for unknown URLs.

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-400">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-100 sm:text-3xl">We couldn&apos;t find that page</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
        The link may be broken or the product may have been removed. Try searching instead.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Back to the store
        </Link>
        <Link
          href="/search?q=something%20to%20listen%20to%20music"
          className="rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          Try a search
        </Link>
      </div>
    </div>
  );
}
