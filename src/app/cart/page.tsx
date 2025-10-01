// src/app/cart/page.tsx
'use client';

import { CartContext } from '@/context/CartContext';
import { useContext } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function CartPage() {
  const { cart, loading, getCartTotal, removeFromCart, increaseQuantity, decreaseQuantity } = useContext(CartContext);

  if (loading) {
    return <div className="container mx-auto p-4 text-center">Loading your cart...</div>;
  }

  if (!loading && cart.length === 0) {
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-3xl font-bold">Your Cart is Empty</h1>
        <Link href="/" className="text-blue-500 hover:underline mt-4 inline-block">
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
    
      <ul className="mb-6 space-y-6">
        {cart.map((item) => {
          // Check if the necessary nested data exists
          if (!item.product_variants || !item.product_variants.products) {
            return (
              <li key={item.id} className="border-b pb-2 text-red-500">
                An item in your cart is no longer available.
              </li>
            );
          }
          
          const variant = item.product_variants;
          const product = variant.products;

          return (
            <li key={item.id} className="flex items-center gap-4 border-b pb-6">
              {/* Image */}
              <div className="relative w-14 h-14 flex-shrink-0">
                <Image
                  src={variant.image_url || '/placeholder.png'}
                  alt={product.name}
                 layout='fill'
  className="object-contain"
                
                />
              </div>

              {/* Details */}
              <div className="flex-grow">
                <h2 className="text-m font-semibold">{product.name}</h2>
                <p className="text-sm text-gray-600">
                  {variant.color ? `Color: ${variant.color}` : ''}
                  {variant.size ? ` / Size: ${variant.size}` : ''}
                </p>
                <p className="text-m font-bold mt-1">
                  ${(parseFloat(String(variant.price)) * item.quantity).toFixed(2)}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 border rounded-md">
                  <button onClick={() => decreaseQuantity(item.id)} className="px-3 py-1 text-m font-bold hover:bg-gray-200 rounded-l-md">-</button>
                  <span className="font-semibold">{item.quantity}</span>
                  <button onClick={() => increaseQuantity(item.id)} className="px-3 py-1 text-m font-bold hover:bg-gray-200 rounded-r-md">+</button>
                </div>
                <button onClick={() => removeFromCart(item.id)} className="text-white-500 hover:text-red-700 text-M underline" title="Remove item">Delete</button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="text-right">
        <h2 className="text-M font-bold">
          Total: ${getCartTotal().toFixed(2)}
        </h2>
        <button className="bg-green-500 text-white px-2 py-1 rounded-md mt-2 hover:bg-green-600">
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}