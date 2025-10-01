// src/app/product/[id]/page.tsx

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
//import { notFound } from 'next/navigation';
import ProductDetails from '@/components/ProductDetails'; // The component that displays the details

export async function generateStaticParams() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: products } = await supabaseAdmin.from('products').select('id');

  return products?.map(({ id }) => ({
    id: id.toString(),
  })) || [];
}
export default async function ProductPage({ params }: { params: { id: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const { id } =  params;

  // This query fetches the base product and ALL of its related variants and specifications in one go.
  const { data: product } = await supabase
    .from('products')
    .select(`
      *,
      product_variants(*),
      product_spec(*)
    `)
    .eq('id', parseInt(id))
    .single();

  // If the product doesn't exist or there was an error, show a 404 page.
 
  // Pass the complete, detailed product data to the client component for rendering.
  return <ProductDetails product={product} />;
}