// src/components/VisualSearch.tsx
//
// The interactive visual-search UI. `disabled` comes from the server (the
// DISABLE_VISUAL_SEARCH deployment flag), so a visitor on a host without the
// memory for the image model is told up front instead of after uploading.
'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ProductCard, { type Product } from '@/components/ProductCard';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function VisualSearch({ disabled }: { disabled: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file || disabled) return;

    // Same rules the server enforces — checked here first for a faster, clearer
    // message (the server re-validates; never trust the client alone).
    if (!ALLOWED_TYPES.includes(file.type)) {
      setSearched(true);
      setResults([]);
      setPreview(null);
      setError('Please choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setSearched(true);
      setResults([]);
      setPreview(null);
      setError('That image is too large — please choose one under 5 MB.');
      return;
    }

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

      {disabled && (
        <div role="status" className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Visual search is turned off on this free demo.</p>
          <p className="mt-1 text-amber-200">
            It loads an image model that needs about 150&nbsp;MB of memory — more than the free host has to spare. Everything
            else is live, and visual search runs fully when the app is self-hosted (see the README). In the meantime you can
            try the{' '}
            <Link href="/search?q=something%20to%20listen%20to%20music" className="font-semibold underline underline-offset-4">
              text search
            </Link>{' '}
            or{' '}
            <Link href="/extract" className="font-semibold underline underline-offset-4">
              Document AI
            </Link>
            .
          </p>
        </div>
      )}

      {/* Upload */}
      <label
        aria-disabled={disabled}
        className={`mt-5 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center transition ${
          disabled ? 'pointer-events-none cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-indigo-400/60'
        }`}
      >
        <span className="text-3xl">📷</span>
        <span className="text-sm font-medium text-slate-200">
          {disabled ? 'Image upload is unavailable on this deployment' : 'Click to upload an image'}
        </span>
        <span className="text-xs text-slate-500">JPG, PNG or WebP · up to 5 MB</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          disabled={disabled}
          className="hidden"
        />
      </label>

      {/* Query preview */}
      {preview && (
        <div className="mt-6 flex items-center gap-4">
          <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-700">
            <Image src={preview} alt="Your image" fill className="object-cover" unoptimized />
          </div>
          <p className="text-sm text-slate-400">{loading ? 'Searching for similar products…' : 'Your image'}</p>
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
