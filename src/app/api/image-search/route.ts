// src/app/api/image-search/route.ts
//
// POST an image file (multipart form field "image") → CLIP-embeds it →
// returns the most visually-similar products via the image_search RPC.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { embedImageBlob } from '@/lib/image-embeddings';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CARD_COLUMNS =
  'id, name, description, image_url, stock, bestseller, rating, review_count, discount_percent';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    }

    const embedding = await embedImageBlob(file);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .rpc('image_search', { query_embedding: embedding, match_count: 8 })
      .select(CARD_COLUMNS);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ products: data ?? [] });
  } catch (e) {
    console.error('image-search failed:', e);
    return NextResponse.json({ error: 'Image search failed.' }, { status: 500 });
  }
}
