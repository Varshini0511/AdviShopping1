// src/app/cart/page.tsx
'use client';

import { CartContext } from '@/context/CartContext';
import { useContext, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function CartPage() {
  const { cart, loading, getCartTotal, removeFromCart, increaseQuantity, decreaseQuantity } =
    useContext(CartContext);
  const [showCheckoutNote, setShowCheckoutNote] = useState(false);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center text-slate-400">Loading your cart…</div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">Your cart is empty</h1>
        <p className="mt-2 text-sm text-slate-400">
          Log in, then browse — or ask the chat assistant to add something for you.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold text-slate-100">Your cart</h1>

      <ul className="space-y-3">
        {cart.map((item) => {
          if (!item.product_variants || !item.product_variants.products) {
            return (
              <li
                key={item.id}
                className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-300"
              >
                An item in your cart is no longer available.
              </li>
            );
          }

          const variant = item.product_variants;
          const product = variant.products;
          const lineTotal = parseFloat(String(variant.price)) * item.quantity;

          return (
            <li
              key={item.id}
              className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-center gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-800">
                  <Image
                    src={variant.image_url || '/placeholder.svg'}
                    alt={product.name}
                    fill
                    sizes="64px"
                    className="object-contain"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-slate-100">{product.name}</h2>
                  {(variant.color || variant.size) && (
                    <p className="text-sm text-slate-400">
                      {variant.color ? `Color: ${variant.color}` : ''}
                      {variant.size ? ` · Size: ${variant.size}` : ''}
                    </p>
                  )}
                  <p className="mt-1 text-base font-bold text-white">${lineTotal.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="flex items-center rounded-lg border border-slate-700">
                  <button
                    onClick={() => decreaseQuantity(item.id)}
                    className="px-3 py-1.5 text-base font-bold text-slate-200 transition hover:bg-slate-800"
                    aria-label={`Decrease quantity of ${product.name}`}
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center text-sm font-semibold text-slate-100">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => increaseQuantity(item.id)}
                    className="px-3 py-1.5 text-base font-bold text-slate-200 transition hover:bg-slate-800"
                    aria-label={`Increase quantity of ${product.name}`}
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="text-sm text-slate-400 underline-offset-4 transition hover:text-rose-400 hover:underline"
                  title="Remove item"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:flex sm:items-center sm:justify-between">
        <p className="text-lg font-bold text-slate-100">Total: ${getCartTotal().toFixed(2)}</p>
        <button
          onClick={() => setShowCheckoutNote(true)}
          className="mt-3 w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 sm:mt-0 sm:w-auto"
        >
          Proceed to checkout
        </button>
      </div>

      {showCheckoutNote && (
        <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          This is a portfolio demo — checkout and payments aren&apos;t implemented, so no order is placed.
        </p>
      )}
    </div>
  );
}
