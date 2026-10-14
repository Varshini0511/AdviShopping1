// src/app/category/[slug]/page.tsx

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import ProductCard from '@/components/ProductCard';

export const revalidate = 60;

function formatCategory(slug: string) {
  const decoded = decodeURIComponent(slug);
  return decoded.charAt(0).toUpperCase() + decoded.slice(1);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categoryName: string }>;
}): Promise<Metadata> {
  const { categoryName } = await params;
  return { title: formatCategory(categoryName) };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ categoryName: string }>;
}) {
  const supabase = createServerComponentClient({ cookies });
  const { categoryName } = await params;

  // Format the category name from the URL to match the database (e.g., "electronics" -> "Electronics")
  const categoryNamee = formatCategory(categoryName);

   const { data: products, error } = await supabase
    .from('products')
    .select('*, category!inner(*), product_variants(price)')
    .eq('category.category_name', categoryNamee);

  if (error) {
    console.error('Error fetching products:', error);
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-100">{categoryNamee}</h1>
      {(!products || products.length === 0) && (
        <p className="text-slate-400">No products found in this category.</p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
        {products && products.map((product) => {
          const prices = (product.product_variants ?? [])
            .map((v: { price: number }) => Number(v.price))
            .filter((n: number) => !Number.isNaN(n));
          const price = prices.length ? Math.min(...prices) : null;
          const fromPrice = new Set(prices).size > 1;
          return (
            <ProductCard key={product.id} product={{ ...product, price, fromPrice }} />
          );
        })}
      </div>
    </div>
  );
}