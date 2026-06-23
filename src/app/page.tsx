// src/app/page.tsx

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import ProductCard from '@/components/ProductCard';

export const revalidate = 60; // Re-fetch data every 60 seconds

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });

  // Public landing — anyone can browse and search. Login is only needed to use
  // the cart (so portfolio visitors aren't blocked by a sign-in wall).
  const { data: products, error } = await supabase
    .from('products')
    .select('*, product_variants(price)')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching products:', error);
    return <p>Error loading products.</p>;
  }

  if (!products || products.length === 0) {
    return <p>No products found.</p>;
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
            Everything you need, beautifully ranked.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-indigo-100 sm:text-base">
            Smart hybrid search across electronics, fashion, books &amp; more — find it by name or
            just describe it.
          </p>
        </div>
      </section>

      {/* Category quick-links */}
      <div className="mb-8 flex flex-wrap gap-2">
        {[
          { href: '/category/electronics', label: 'Electronics' },
          { href: '/category/dress', label: 'Dress' },
          { href: '/category/books', label: 'Books' },
          { href: '/category/accessories', label: 'Accessories' },
        ].map((c) => (
          <a
            key={c.href}
            href={c.href}
            className="rounded-full border border-white/10 bg-slate-800/60 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:border-indigo-400/50 hover:text-white"
          >
            {c.label}
          </a>
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