// src/components/ProductCardSkeleton.tsx

export default function ProductCardSkeleton() {
  return (
    <div className="border rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
      {/* Image Skeleton */}
      <div className="relative w-full h-48 bg-gray-900 animate-pulse"></div>

      {/* Content Skeleton */}
      <div className="p-4 flex flex-col flex-grow">
        <div className="h-6 w-3/4 bg-gray-900 rounded animate-pulse mb-2"></div>
        <div className="h-4 w-1/2 bg-gray-900 rounded animate-pulse mb-4"></div>
        <div className="h-4 w-full bg-gray-900 rounded animate-pulse"></div>
        <div className="h-4 w-5/6 bg-gray-900 rounded animate-pulse mt-1"></div>
      </div>

      {/* Action Area Skeleton */}
      <div className="p-4 pt-0">
        <div className="flex justify-between items-center mt-2">
          <div className="h-8 w-1/3 bg-gray-700 rounded animate-pulse"></div>
          <div className="h-10 w-1/2 bg-gray-700 rounded-md animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}