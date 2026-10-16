// src/app/api/image-search/route.ts
//
// POST an image file (multipart form field "image") → CLIP-embeds it →
// returns the most visually-similar products via the image_search RPC.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { embedImageBlob } from '@/lib/image-embeddings';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB — plenty for a product photo
const MULTIPART_OVERHEAD_BYTES = 64 * 1024; // form boundaries / field headers
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_REQUESTS_PER_MINUTE = 10;

const CARD_COLUMNS =
  'id, name, description, image_url, stock, bestseller, rating, review_count, discount_percent';

export async function POST(request: Request) {
  // Set DISABLE_VISUAL_SEARCH=true on memory-constrained hosts. CLIP is ~150MB
  // — the single largest model in the app. It loads lazily, so returning early
  // here means it is never loaded into the process at all.
  if (process.env.DISABLE_VISUAL_SEARCH === 'true') {
    return NextResponse.json(
      { error: 'Visual search is disabled in this deployment (memory limits). Try the text search instead.' },
      { status: 503 }
    );
  }

  // Per-IP limit: each request runs a CLIP forward pass, the heaviest thing
  // this app does.
  const limited = rateLimit(`image:${clientIp(request)}`, IMAGE_REQUESTS_PER_MINUTE, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  // Reject oversized uploads from the declared length BEFORE parsing the body —
  // request.formData() would otherwise buffer the whole thing in memory first.
  // (Content-Length can be absent or wrong, so the real size is re-checked below.)
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json(
      { error: `Image is too large. The maximum size is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Image is too large. The maximum size is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` },
        { status: 413 }
      );
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a JPG, PNG or WebP image.' },
        { status: 415 }
      );
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
