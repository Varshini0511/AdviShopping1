// src/app/product/[id]/page.tsx

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
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
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerComponentClient({ cookies });
  const { data } = await supabase
    .from('products')
    .select('name, description')
    .eq('id', parseInt(id))
    .single();

  if (!data) return { title: 'Product not found' };
  return { title: data.name, description: data.description?.slice(0, 160) };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = createServerComponentClient({ cookies });
  const { id } = await params;

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

  // Unknown id -> real 404 (status code + the styled not-found page).
  if (!product) notFound();

  // Pass the complete, detailed product data to the client component for rendering.
  return <ProductDetails product={product} />;
}