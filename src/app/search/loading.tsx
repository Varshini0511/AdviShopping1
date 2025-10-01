// src/app/category/[slug]/loading.tsx

import ProductCardSkeleton from "@/components/ProductCardSkeleton";

export default function Loading() {
  // You can add any UI you want here, but a skeleton is best.
  // This UI will be streamed to the browser immediately while the data is fetched.
  return (
    <div className="container mx-auto p-4">
      {/* Title Skeleton */}
      <div className="h-9 w-1/3 bg-gray-800 rounded animate-pulse mb-6"></div>
      
      {/* Grid of Skeleton Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
      </div>
    </div>
  );
}