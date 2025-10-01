// src/app/category/[slug]/page.tsx

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import ProductCard from '@/components/ProductCard';

export const revalidate = 60;

export default async function CategoryPage({ params }: { params: { categoryName: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const { categoryName } = params;

  // Format the category name from the URL to match the database (e.g., "electronics" -> "Electronics")
  const categoryNamee = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);

   const { data: products, error } = await supabase
    .from('products')
    .select('*, category!inner(*)')
    .eq('category.category_name', categoryNamee);

  if (error) {
    console.error('Error fetching products:', error);
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Category: {categoryNamee}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {products && products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}