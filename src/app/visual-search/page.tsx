// src/app/visual-search/page.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import ProductCard, { type Product } from '@/components/ProductCard';

export default function VisualSearchPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setLoading(true);
    setError(null);
    setResults([]);
    setSearched(true);

    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch('/api/image-search', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-100">Visual Search</h1>
      <p className="mt-1 text-sm text-slate-400">
        Upload a photo and find the most visually-similar products (powered by CLIP image embeddings).
      </p>

      {/* Upload */}
      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center transition hover:border-indigo-400/60">
        <span className="text-3xl">📷</span>
        <span className="text-sm font-medium text-slate-200">Click to upload an image</span>
        <span className="text-xs text-slate-500">JPG, PNG or WebP</span>
        <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </label>

      {/* Query preview */}
      {preview && (
        <div className="mt-6 flex items-center gap-4">
          <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-700">
            <Image src={preview} alt="Your image" fill className="object-cover" unoptimized />
          </div>
          <p className="text-sm text-slate-400">
            {loading ? 'Searching for similar products…' : 'Your image'}
          </p>
        </div>
      )}

      {error && <p className="mt-6 text-sm text-rose-400">{error}</p>}

      {/* Results */}
      {results.length > 0 && (
        <>
          <h2 className="mt-8 mb-4 text-lg font-bold text-slate-100">Visually similar</h2>
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {results.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}

      {searched && !loading && !error && results.length === 0 && (
        <p className="mt-8 text-slate-400">No similar products found.</p>
      )}
    </div>
  );
}
