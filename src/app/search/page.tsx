// src/app/search/page.tsx

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import ProductCard from '@/components/ProductCard';

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const supabase = createServerComponentClient({ cookies });
  const query = searchParams?.q || '';

  if (!query) {
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-3xl font-bold">Please enter a search term.</h1>
      </div>
    );
  }

  // Use `.ilike()` for a case-insensitive search on the product name
  const { data: products, error } = await supabase
    .from('products')
    .select('*, category(*)') // Also fetch category info
    .ilike('name', `%${query}%`); // The '%' are wildcards to match any part of the name

  if (error) {
    console.error('Error fetching search results:', error);
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-sm font-medium mb-6">
        Search results for: {query}
      </h1>
      
      {products && products.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p>No products found matching your search.</p>
      )}
    </div>
  );
}