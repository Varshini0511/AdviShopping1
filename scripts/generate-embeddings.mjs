// scripts/generate-embeddings.mjs
//
// Fills the products.embedding column using the gte-small model (384 dims),
// run locally — no external API key required.
//
//   npm run embeddings
//
// Re-runnable: only embeds products whose embedding is still NULL.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

console.log('Loading gte-small model (first run downloads ~30MB)...');
const extractor = await pipeline('feature-extraction', 'Supabase/gte-small');

async function embed(text) {
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

const { data: products, error } = await supabase
  .from('products')
  .select('id, name, description')
  .is('embedding', null);

if (error) {
  console.error('Failed to fetch products:', error.message);
  process.exit(1);
}

if (!products.length) {
  console.log('All products already have embeddings. Nothing to do.');
  process.exit(0);
}

console.log(`Embedding ${products.length} products...`);

for (const p of products) {
  const text = `${p.name}. ${p.description ?? ''}`.trim();
  const embedding = await embed(text);

  const { error: updErr } = await supabase
    .from('products')
    .update({ embedding })
    .eq('id', p.id);

  if (updErr) {
    console.error(`  ✗ ${p.name}: ${updErr.message}`);
  } else {
    console.log(`  ✓ ${p.name}`);
  }
}

console.log('Done.');
process.exit(0);
