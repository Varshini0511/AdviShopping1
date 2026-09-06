// src/app/search/page.tsx

import ProductCard from '@/components/ProductCard';
import { runSearchPipeline, type SearchFilters } from '@/lib/search-pipeline';

const CATEGORIES = ['Electronics', 'Dress', 'Books', 'Accessories'];

export default async function SearchPage({
  searchParams,
}: {
  // Next.js 15: params/searchParams are Promises and must be awaited.
  searchParams?: Promise<{
    q?: string;
    max_price?: string;
    in_stock?: string;
    category?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params?.q?.trim() || '';

  if (!query) {
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-3xl font-bold">Please enter a search term.</h1>
      </div>
    );
  }

  // Parse metadata filters from the URL.
  const maxPriceNum = Number(params?.max_price);
  const filters: SearchFilters = {
    category: params?.category || null,
    inStock: params?.in_stock === 'on',
    maxPrice: params?.max_price && !Number.isNaN(maxPriceNum) ? maxPriceNum : null,
  };

  const { stages, results, summary, llmEnabled } = await runSearchPipeline(query, filters);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-sm font-medium mb-4 text-slate-400">
        Search results for: <span className="font-bold text-white">{query}</span>
      </h1>

      {/* Metadata filter bar (GET — re-runs the pipeline with hard filters) */}
      <form
        method="get"
        action="/search"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
      >
        <input type="hidden" name="q" value={query} />

        <label className="flex flex-col text-xs text-slate-400">
          Category
          <select
            name="category"
            defaultValue={filters.category ?? ''}
            className="mt-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs text-slate-400">
          Max price ($)
          <input
            type="number"
            name="max_price"
            min="0"
            step="10"
            defaultValue={filters.maxPrice ?? ''}
            placeholder="any"
            className="mt-1 w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500"
          />
        </label>

        <label className="flex items-center gap-2 pb-1.5 text-sm text-slate-300">
          <input
            type="checkbox"
            name="in_stock"
            defaultChecked={filters.inStock}
            className="h-4 w-4 rounded border-slate-600 bg-slate-800"
          />
          In stock only
        </label>

        <button
          type="submit"
          className="ml-auto rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Apply
        </button>
      </form>

      {/* Stage 6 — the LLM conversational answer */}
      {llmEnabled && summary && (
        <div className="mb-6 rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-4 text-slate-200">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-300 mb-1">
            🛍️ Shopping Assistant
          </p>
          <p className="text-sm leading-relaxed">{summary}</p>
        </div>
      )}

      {results.length > 0 ? (
        <ol className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
          {results.map((product, i) => (
            <li key={product.id} className="flex flex-col">
              <div className="relative">
                <span className="absolute -left-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-md">
                  {i + 1}
                </span>
                <ProductCard product={product} />
              </div>
              {product.why && (
                <p className="mt-2 text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Why:</span> {product.why}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-slate-400">
          No products found matching your search{' '}
          {(filters.category || filters.inStock || filters.maxPrice) && 'and filters'}.
        </p>
      )}

      {/* Pipeline transparency — the 6 stages */}
      <details className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">
          🔎 How these results were ranked (6-stage pipeline)
        </summary>
        <div className="mt-4 space-y-4">
          {stages.map((stage) => (
            <div key={stage.name}>
              <p className="text-sm font-bold text-slate-200">
                {stage.name}{' '}
                <span className="font-normal text-slate-500">— {stage.note}</span>
              </p>
              {stage.items.length > 0 && (
                <ol className="mt-1 list-decimal pl-6 text-xs text-slate-400">
                  {stage.items.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      {item.name}
                      {item.meta && (
                        <span className="ml-2 text-slate-600">({item.meta})</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
