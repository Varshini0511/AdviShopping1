// components/ProductCard.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';

// Define the type for a single product
export type Product = {
  id: string | number;
  name: string;
  description: string;
  bestseller: boolean;
  image_url: string | null;
  stock: number;
  rating?: number | null;
  review_count?: number | null;
  discount_percent: number;
  price?: number | null;
  fromPrice?: boolean;
};

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  const outOfStock = product.stock <= 0;
  const discount = Number(product.discount_percent) || 0;

  return (
    <Link href={`/product/${product.id}`} className="group block h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur-sm transition duration-200 hover:-translate-y-1 hover:border-indigo-400/40 hover:bg-slate-900 hover:shadow-2xl hover:shadow-indigo-500/15">
        {/* Image */}
        <div className="relative aspect-square w-full overflow-hidden bg-slate-800">
          <Image
            src={product.image_url || '/placeholder.svg'}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-110"
          />
          {/* subtle bottom scrim for depth */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-900/70 to-transparent" />

          {discount > 0 && (
            <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg shadow-rose-900/40">
              -{discount}%
            </span>
          )}
          {product.bestseller && (
            <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-slate-900 shadow-lg shadow-amber-900/30">
              ★ Bestseller
            </span>
          )}
          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
              <span className="rounded-full bg-slate-900/90 px-3 py-1 text-sm font-semibold text-white ring-1 ring-white/15">
                Out of stock
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col p-4">
          <h2 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-slate-100 transition group-hover:text-indigo-300">
            {product.name}
          </h2>

          <div className="mt-2 flex items-center gap-1 text-sm">
            {product.rating ? (
              <>
                <span className="text-amber-400">★</span>
                <span className="font-medium text-slate-200">{product.rating.toFixed(1)}</span>
                {product.review_count != null && (
                  <span className="text-slate-500">({product.review_count.toLocaleString()})</span>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-500">No reviews yet</span>
            )}
          </div>

          {product.price != null && (
            <p className="mt-2 text-lg font-bold text-white">
              {product.fromPrice && (
                <span className="text-xs font-normal text-slate-400">from </span>
              )}
              ${product.price.toFixed(2)}
            </p>
          )}

          <div className="mt-auto flex items-center justify-between pt-3">
            {outOfStock ? (
              <span className="text-xs font-semibold text-rose-400">Out of stock</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                In stock{product.stock <= 10 ? ` · ${product.stock} left` : ''}
              </span>
            )}
            <span className="text-xs font-medium text-indigo-400 opacity-0 transition group-hover:opacity-100">
              View →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
