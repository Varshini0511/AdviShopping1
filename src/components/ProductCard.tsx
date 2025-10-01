// components/ProductCard.tsx
'use client'; // This component will have user interactions

//import { CartContext } from '../context/CartContext';
//import { useContext } from 'react';
import Image from 'next/image';
//import StarRating from './StarRating';
import Link from 'next/link';
// Define the type for a single product
export type Product = {
  id: string;
  name: string;
  description: string;
   bestseller: boolean;
   image_url:string;
   stock: number;
        rating?: number | null;
  review_count?: number | null;
  discount_percent:number
};

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  // We'll add the cart context later. For now, it's just for display.
   //const { addToCart } = useContext(CartContext);
  //   const { removeFromCart } = useContext(CartContext);
  return (
     <Link href={`/product/${product.id}`} className="block group">
    <div className="border rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
      {/* Image Section */}
      <div className="relative w-full h-48">
      <Image
  src={product.image_url || '/placeholder.png'}
  alt={product.name}
  layout='fill'
  className="object-contain"
/>
      </div>

      {/* Main Content Area - This part grows */}
      <div className="p-4 flex flex-col flex-grow">
        <h2 className="text-m font-semibold mb-2">{product.name}</h2>
      {product.rating && (
  <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
    <span>{product.rating.toFixed(1)}</span>
    <span className="text-yellow-400">⭐</span>
    <span className="text-gray-300">|</span>
    <span>{product.review_count}</span>
  </div>
)}
       
        {product.stock > 0 ? (
          <p className="text-sm font-medium text-green-600">
            In Stock: {product.stock}
          </p>
        ) : (
          <p className="text-sm font-medium text-red-600">
            Out of Stock
          </p>
        )}

        {/* Bestseller badge - appears if true */}
        {product.bestseller && (
          <div className="mt-2">
            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded">
              #1 Best Seller
            </span>
          </div>
        )}
      </div>

      {/* Action Area - This is always at the bottom */}
      
    </div>
    </Link>
  
  );
}