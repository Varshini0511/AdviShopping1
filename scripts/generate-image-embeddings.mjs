// scripts/generate-image-embeddings.mjs
//
// Fills products.image_embedding by running CLIP over each product's photo
// (the file in public/ that image_url points at). Enables visual search.
//
//   npm run image-embeddings
//
// Requires supabase/image-search.sql to have been run first (adds the column).
// Re-runnable: only embeds products whose image_embedding is still NULL.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from '@xenova/transformers';
import path from 'node:path';

config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const MODEL = 'Xenova/clip-vit-base-patch32';
console.log('Loading CLIP model (first run downloads ~150MB)...');
const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL);

function normalize(v) {
  let sum = 0;
  for (const x of v) sum += x * x;
  const mag = Math.sqrt(sum) || 1;
  return v.map((x) => x / mag);
}

async function embed(imagePath) {
  const image = await RawImage.read(imagePath);
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);
  return normalize(Array.from(image_embeds.data));
}

const { data: products, error } = await supabase
  .from('products')
  .select('id, name, image_url')
  .is('image_embedding', null);

if (error) { console.error('Failed to fetch products:', error.message); process.exit(1); }
if (!products.length) { console.log('All products already have image embeddings.'); process.exit(0); }

console.log(`Embedding ${products.length} product images...`);
let ok = 0;
for (const p of products) {
  if (!p.image_url) { console.error(`  ✗ ${p.name}: no image_url`); continue; }
  // image_url is like "/products/foo.webp" → file lives at public/products/foo.webp
  const file = path.join('public', p.image_url);
  try {
    const embedding = await embed(file);
    const { error: updErr } = await supabase
      .from('products')
      .update({ image_embedding: embedding })
      .eq('id', p.id);
    if (updErr) throw new Error(updErr.message);
    ok++;
    console.log(`  ✓ ${p.name}`);
  } catch (e) {
    console.error(`  ✗ ${p.name}: ${e.message}`);
  }
}
console.log(`\nDone: ${ok}/${products.length} image embeddings.`);
process.exit(0);
