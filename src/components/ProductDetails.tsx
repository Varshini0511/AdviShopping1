// src/components/ProductDetails.tsx
'use client';

import { useState, useEffect, useContext } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CartContext } from '@/context/CartContext';

// --- Define your TypeScript types (ensure they match your DB structure) ---
type Product = {
  id: number;
  name: string;
  description: string;
};
type ProductVariant = {
  id: number;
  color: string;
  size: string;
  price: number;
  stock: number;
  image_url: string;
  discount_percent?: number | null;
  product_id:number;
};
type ProductSpec = {
  id: number;
  spec_name: string;
  spec_value: string;
}
type DetailedProduct = Product & {
  product_variants: ProductVariant[];
  product_spec: ProductSpec[]; // Add other types as needed
};
// --- End of Types ---

type Feedback = { kind: 'success' | 'login' | 'error'; text: string };

export default function ProductDetails({ product }: { product: DetailedProduct }) {
  const { addToCart } = useContext(CartContext);
  const [selectedVariant, setSelectedVariant] = useState(product?.product_variants[0]);
  const [selectedColor, setSelectedColor] = useState(product?.product_variants[0]?.color);
  const [selectedSize, setSelectedSize] = useState(product?.product_variants[0]?.size);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    // This effect will run only after the component has rendered and the product data is available.
    if (product?.product_variants) {
      const newVariant = product.product_variants.find(
        v => v.color === selectedColor && v.size === selectedSize
      );
      if (newVariant) {
        setSelectedVariant(newVariant);
        setFeedback(null);
      }
    }
  }, [selectedColor, selectedSize, product?.product_variants]);

  // --- SAFETY CHECK / EARLY RETURN ---
  if (!product || !product.product_variants || product.product_variants.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Product not found or currently unavailable.</h1>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-indigo-400 hover:text-indigo-300">
          ← Back to the store
        </Link>
      </div>
    );
  }

  // --- DERIVED VALUES & EVENT HANDLERS ---
  // This code only runs if the product prop is valid.
  const { product_variants } = product;
  const uniqueColors = [...new Set(product_variants.map(v => v.color))];
  const uniqueSizes = [...new Set(product_variants.map(v => v.size))];

  const originalPrice = selectedVariant.price || 0;
  const discount = parseFloat(String(selectedVariant.discount_percent ?? 0)) || 0;
  const finalPrice = discount > 0 ? originalPrice - (originalPrice * discount / 100) : originalPrice;

  const handleAddToCart = async () => {
    setAdding(true);
    setFeedback(null);
    const result = await addToCart(selectedVariant.id, selectedVariant.product_id);
    setAdding(false);

    if (result === 'added') {
      setFeedback({ kind: 'success', text: `Added ${product.name} (${selectedVariant.color}, ${selectedVariant.size}) to your cart.` });
    } else if (result === 'login_required') {
      setFeedback({ kind: 'login', text: 'Please log in to add items to your cart.' });
    } else {
      setFeedback({ kind: 'error', text: "Couldn't add that to your cart. Please try again." });
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">

        {/* --- IMAGE SECTION (updates dynamically) --- */}
        <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-800 sm:h-96 md:h-[28rem]">
          <Image
            src={selectedVariant.image_url || '/placeholder.svg'}
            alt={`${product.name} - ${selectedVariant.color}`}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain"
            priority
          />
        </div>

        {/* --- DETAILS SECTION --- */}
        <div>
          <h1 className="mb-2 text-2xl font-bold text-slate-100 sm:text-3xl">{product.name}</h1>
          <p className="mb-6 leading-relaxed text-slate-300">{product.description}</p>

          {/* Color Selector */}
          <div className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">
              Color: <span className="font-normal text-slate-400">{selectedColor}</span>
            </h3>
            <div className="flex flex-wrap gap-3">
              {uniqueColors.map(color => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${
                    selectedColor === color
                      ? 'border-indigo-400 ring-2 ring-indigo-400/40'
                      : 'border-slate-600'
                  }`}
                  style={{ backgroundColor: color.toLowerCase() }}
                  title={color}
                  aria-label={`Color ${color}`}
                  aria-pressed={selectedColor === color}
                />
              ))}
            </div>
          </div>

          {/* Size Selector */}
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">
              Size: <span className="font-normal text-slate-400">{selectedSize}</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {uniqueSizes.map(size => {
                // Check if this size is available for the currently selected color
                const isAvailable = product_variants.some(v => v.color === selectedColor && v.size === size);
                return (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    disabled={!isAvailable}
                    aria-pressed={selectedSize === size}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                      selectedSize === size
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    } ${!isAvailable ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price & Add to Cart Section (updates dynamically) */}
          <div className="mb-1 flex items-baseline gap-3">
            <p className="text-3xl font-bold text-white">${finalPrice.toFixed(2)}</p>
            {discount > 0 && (
              <>
                <p className="text-base text-slate-500 line-through">${originalPrice.toFixed(2)}</p>
                <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                  -{discount}%
                </span>
              </>
            )}
          </div>
          <p className={`mb-6 text-sm font-semibold ${selectedVariant.stock > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {selectedVariant.stock > 0 ? `${selectedVariant.stock} in stock` : 'Out of stock'}
          </p>

          <button
            onClick={handleAddToCart}
            disabled={selectedVariant.stock === 0 || adding}
            className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 sm:w-auto"
          >
            {adding ? 'Adding…' : 'Add to cart'}
          </button>

          {feedback && (
            <p
              role="status"
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                feedback.kind === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              {feedback.text}{' '}
              {feedback.kind === 'success' && (
                <Link href="/cart" className="font-semibold underline underline-offset-4">
                  View cart
                </Link>
              )}
              {feedback.kind === 'login' && (
                <Link href="/login" className="font-semibold underline underline-offset-4">
                  Log in
                </Link>
              )}
            </p>
          )}
        </div>

        {/* --- SPECIFICATIONS SECTION --- */}
        {product.product_spec.length > 0 && (
          <div className="md:col-span-2">
            <h2 className="mb-4 text-xl font-bold text-slate-100">Specifications</h2>
            <ul className="border-t border-slate-800">
              {product.product_spec.map((spec) => (
                <li key={spec.id} className="flex items-start justify-between gap-4 border-b border-slate-800 py-3 text-sm">
                  <span className="font-semibold text-slate-300">{spec.spec_name}</span>
                  <span className="text-right text-slate-400">{spec.spec_value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
