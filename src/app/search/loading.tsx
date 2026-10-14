// src/app/search/loading.tsx
//
// Streamed to the browser immediately while the 6-stage pipeline runs. The
// first search after the server has been idle also has to load the embedding
// model, so say so instead of leaving a silent skeleton.

import ProductCardSkeleton from '@/components/ProductCardSkeleton';

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-4">
        <p className="text-sm font-semibold text-indigo-200">Running the search pipeline…</p>
        <p className="mt-1 text-xs text-slate-400">
          Keyword + semantic retrieval, fusion, rerank. If the demo has been idle, the first search also
          loads the ML models and can take up to a minute — later searches are fast.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
      </div>
    </div>
  );
}
