// src/app/api/revalidate/route.ts

import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // 1. Check for the secret token
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.REVALIDATION_TOKEN) {
    return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
  }

  // 2. Parse the request body to get the updated product
  const body = await request.json();

  if (body.type === 'UPDATE' || body.type === 'INSERT') {
    const productId = body.record.id;
    
    if (productId) {
      // 3. Revalidate the specific product's detail page
      revalidatePath(`/product/${productId}`);
      
      // 4. Also revalidate the homepage to show the updated product in the list
      revalidatePath('/');

      // You could also revalidate category pages if you have that info
      // revalidatePath(`/category/your-category-slug`);
      
      return NextResponse.json({ revalidated: true, now: Date.now() });
    }
  }

  return NextResponse.json({ revalidated: false, message: 'No product ID found' });
}