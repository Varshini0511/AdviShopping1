// src/app/page.tsx

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ProductCard from '@/components/ProductCard';

export const revalidate = 60; // Re-fetch data every 60 seconds

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });

  // 1. Check for an active user session
  const { data: { session } } = await supabase.auth.getSession();

  // 2. If no session, redirect to the login page
  if (!session) {
    redirect('/login');
  }

  // 3. If a session exists, proceed to fetch and display products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching products:', error);
    return <p>Error loading products.</p>;
  }

  if (!products || products.length === 0) {
    return <p>No products found.</p>;
  }

  return (
    <div className="container mx-auto p-4">
     
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}