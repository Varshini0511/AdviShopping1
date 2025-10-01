// src/components/ProductDetails.tsx
'use client';

import { useState, useEffect, useContext } from 'react';
import Image from 'next/image';
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

export default function ProductDetails({ product }: { product: DetailedProduct }) {
 const { addToCart } = useContext(CartContext);
  const [selectedVariant, setSelectedVariant] = useState(product?.product_variants[0]);
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState(product?.product_variants[0]?.color);
  const [selectedSize, setSelectedSize] = useState(product?.product_variants[0]?.size);

  useEffect(() => {
    // This effect will run only after the component has rendered and the product data is available.
    if (product?.product_variants) {
      const newVariant = product.product_variants.find(
        v => v.color === selectedColor && v.size === selectedSize
      );
      if (newVariant) {
        setSelectedVariant(newVariant);
        setQuantity(1);
      }
    }
  }, [selectedColor, selectedSize, product?.product_variants]);

  // --- SECTION 2: SAFETY CHECK / EARLY RETURN ---
  if (!product || !product.product_variants || product.product_variants.length === 0) {
    return (
      <div className="container mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold">Product not found or currently unavailable.</h1>
      </div>
    );
  }

  // --- SECTION 3: DERIVED VALUES & EVENT HANDLERS ---
  // This code only runs if the product prop is valid.
  const { product_variants } = product;
  const uniqueColors = [...new Set(product_variants.map(v => v.color))];
  const uniqueSizes = [...new Set(product_variants.map(v => v.size))];

// This is the NEW, corrected code
const originalPrice = selectedVariant.price || 0;
const discount = parseFloat(String(selectedVariant.discount_percent ?? 0)) || 0;
const hasDiscount = discount > 0;

const finalPrice = hasDiscount
  ? originalPrice - (originalPrice * discount / 100)
  : originalPrice;

  // --- 5. Event Handlers ---
  const handleAddToCart = () => {
    addToCart(selectedVariant.id, selectedVariant.product_id);
    alert(`${quantity} x ${product.name} (${selectedVariant.color}, ${selectedVariant.size}) added to cart!`);
  };
  console.log('Rendering with variant:', selectedVariant);
  
  return (
    <div className="container mx-auto p-2 sm:p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* --- IMAGE SECTION (updates dynamically) --- */}
        <div className="relative w-full h-80">
          <Image 
            src={selectedVariant.image_url || '/placeholder.png'} 
            alt={`${product.name} - ${selectedVariant.color}`}
            layout="fill"
            objectFit="contain"
            className="rounded-lg shadow-lg" 
          />
        </div>

        {/* --- DETAILS SECTION --- */}
        <div>
          <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
          <p className="text-gray-400 mb-6">{product.description}</p>
          
          {/* Color Selector */}
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Color: <span className="font-normal">{selectedColor}</span></h3>
            <div className="flex gap-2">
              {uniqueColors.map(color => (
                <button 
                  key={color} 
                  onClick={() => 
                    {console.log('--- CLICKED COLOR:', color, '---');
                      setSelectedColor(color)}}
                  className={`w-8 h-8 rounded-full border-2 transition-transform transform hover:scale-110 ${selectedColor === color ? 'border-blue-500' : 'border-gray-300'}`}
                  style={{ backgroundColor: color.toLowerCase() }}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Size Selector */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Size: <span className="font-normal">{selectedSize}</span></h3>
            <div className="flex gap-2 flex-wrap">
              {uniqueSizes.map(size => {
                // Check if this size is available for the currently selected color
                const isAvailable = product_variants.some(v => v.color === selectedColor && v.size === size);
                return (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    disabled={!isAvailable}
                    className={`px-4 py-2 border rounded-md transition ${selectedSize === size ? 'bg-gray-900 text-white' : 'bg-white text-gray-800'} ${!isAvailable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'}`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price & Add to Cart Section (updates dynamically) */}
         
            <div className="flex items-center gap-4 mb-1">
              <p className="text-m font-bold text-white-600">${finalPrice.toFixed(2)}</p>
              {discount > 0 && (
                <p className="text-m text-red-500 line-through">${originalPrice.toFixed(2)}</p>
              )}
            </div>
            <p className="text-green-600 font-semibold mb-6">
              {selectedVariant.stock > 0 ? `${selectedVariant.stock} in stock` : 'Out of stock'}
            </p>
            <button
              onClick={handleAddToCart}
              disabled={selectedVariant.stock === 0}
              className="bg-blue-500 text-white px-4 py-1 rounded-lg font-bold hover:bg-blue-600 disabled:bg-gray-400"
            >
              Add to Cart
            </button>
          
        </div>
        {/* --- SPECIFICATIONS SECTION --- */}
{product.product_spec.length > 0 && (
  <div className="mt-12">
    <h2 className="text-xl font-bold mb-4">Specifications</h2>
    <ul className="border-t border-gray-200">
      {product.product_spec.map((spec) => (
        <li key={spec.id} className="flex justify-between items-center py-3 border-b text-sm">
          <span className="font-semibold text-gray-400">{spec.spec_name}</span>
          <span className="text-gray-400 text-right">{spec.spec_value}</span>
        </li>
      ))}
    </ul>
  </div>
)}
      </div>
    </div>
  );
}