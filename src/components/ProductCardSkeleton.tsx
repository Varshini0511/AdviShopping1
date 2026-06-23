// src/components/ProductCardSkeleton.tsx

export default function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-sm">
      {/* Image */}
      <div className="aspect-square w-full animate-pulse bg-slate-800" />

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-800" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-800" />
        <div className="mt-auto h-3 w-1/3 animate-pulse rounded bg-slate-800 pt-3" />
      </div>
    </div>
  );
}
