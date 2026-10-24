// src/app/page.tsx

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';

export const revalidate = 60; // Re-fetch data every 60 seconds

// Queries chosen because they share no words with the products they find —
// they only work because of semantic search.
const EXAMPLE_QUERIES = [
  'device to call someone',
  'something to listen to music',
  'book about building good habits',
  'iPhone 15',
];

const CAPABILITIES = [
  {
    icon: '🔎',
    title: 'Hybrid search',
    body: 'Keyword + semantic retrieval, rank-fused, reranked by a cross-encoder. Every search shows its 6 stages.',
    href: '/search?q=device%20to%20call%20someone',
    cta: 'See it rank',
  },
  {
    icon: '💬',
    title: 'Shopping agent',
    body: 'Open the chat in the corner and say “add a watch to my cart”. It calls real tools — and can’t invent products.',
    href: '/login',
    cta: 'Try the demo login',
  },
  {
    icon: '📷',
    title: 'Visual search',
    body: 'Upload a photo and CLIP finds visually similar products in the catalog.',
    href: '/visual-search',
    cta: 'Upload an image',
  },
  {
    icon: '📄',
    title: 'Document AI',
    body: 'Extract structured data from invoices, receipts and datasheets — validated and cross-checked.',
    href: '/extract',
    cta: 'Try a sample',
  },
];

export default async function Home() {
  // Deployment flag: the image model needs ~150 MB the free host may not have.
  const visualSearchOff = process.env.DISABLE_VISUAL_SEARCH === 'true';
  const supabase = createServerComponentClient({ cookies });

  // Public landing — anyone can browse and search. Login is only needed to use
  // the cart (so portfolio visitors aren't blocked by a sign-in wall).
  const { data: products, error } = await supabase
    .from('products')
    // Explicit columns, NOT '*': products also holds two embedding vectors
    // (~6 KB each) that would otherwise be serialized into every card's props
    // and shipped to the browser — ~400 KB of dead weight on this page.
    .select(
      'id, name, description, image_url, stock, bestseller, rating, review_count, discount_percent, product_variants(price)'
    )
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching products:', error);
    return (
      <p className="container mx-auto px-4 py-16 text-center text-slate-400">
        We couldn&apos;t load the catalog right now. Please refresh in a moment.
      </p>
    );
  }

  if (!products || products.length === 0) {
    return (
      <p className="container mx-auto px-4 py-16 text-center text-slate-400">No products found.</p>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Hero */}
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-12 text-white shadow-xl shadow-indigo-900/30 sm:px-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            Search that understands what you mean.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-indigo-100 sm:text-base">
            Describe what you need — not what it&apos;s called. Keyword and semantic retrieval,
            fused and reranked, with a shopping agent that can act on your cart.
          </p>

          <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-indigo-200">
            Try a search
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((q) => (
              <Link
                key={q}
                href={`/search?q=${encodeURIComponent(q)}`}
                className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
              >
                {q}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* The three AI capabilities */}
      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CAPABILITIES.map((c) => (
          <div key={c.title} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-slate-100">
              <span aria-hidden className="mr-2">{c.icon}</span>
              {c.title}
              {c.title === 'Visual search' && visualSearchOff && (
                <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  off on this demo
                </span>
              )}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.body}</p>
            {c.href && (
              <Link href={c.href} className="mt-2 inline-block text-xs font-semibold text-indigo-400 hover:text-indigo-300">
                {c.cta} →
              </Link>
            )}
          </div>
        ))}
      </section>

      {/* Category quick-links */}
      <div className="mb-8 flex flex-wrap gap-2">
        {[
          { href: '/category/electronics', label: 'Electronics' },
          { href: '/category/dress', label: 'Dress' },
          { href: '/category/books', label: 'Books' },
          { href: '/category/accessories', label: 'Accessories' },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-full border border-white/10 bg-slate-800/60 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:border-indigo-400/50 hover:text-white"
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="mb-5 flex items-end justify-between">
        <h2 className="text-xl font-bold text-slate-100">Discover products</h2>
        <span className="text-sm text-slate-400">{products.length} items</span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => {
          const prices = (product.product_variants ?? [])
            .map((v: { price: number }) => Number(v.price))
            .filter((n: number) => !Number.isNaN(n));
          const price = prices.length ? Math.min(...prices) : null;
          const fromPrice = new Set(prices).size > 1;
          return (
            <ProductCard key={product.id} product={{ ...product, price, fromPrice }} />
          );
        })}
      </div>
    </div>
  );
}