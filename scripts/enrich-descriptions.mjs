// scripts/enrich-descriptions.mjs
// Rewrites product descriptions to state what each product is FOR (its function
// / use cases), not just its specs — so functional, natural-language queries
// ("device to call someone", "something to listen to music") match well in both
// semantic search and reranking. Re-embeds each updated product.
//
//   node scripts/enrich-descriptions.mjs

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';

config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const DESCRIPTIONS = {
  'Apple iPhone 15 Pro':
    'A smartphone for making and receiving phone calls, video calls, and text messages, plus apps, internet, and photos. The Apple iPhone 15 Pro has the A17 Pro chip, a titanium design, a 48MP Pro camera system, and a 6.1-inch Super Retina XDR display.',
  'Samsung Galaxy S24 Ultra':
    'An Android smartphone for phone calls, video calls, texting, messaging, and everyday apps. The Galaxy S24 Ultra features a 6.8-inch Dynamic AMOLED display, a 200MP camera, a built-in S Pen, and all-day battery life.',
  'Apple MacBook Air M3':
    'A laptop for work, writing, email, web browsing, and video calls. Powered by the Apple M3 chip with a 13.6-inch Liquid Retina display and up to 18 hours of battery life.',
  'Dell XPS 13 Laptop':
    'A Windows laptop for work, study, web browsing, and video meetings. A compact ultrabook with a 13.4-inch InfinityEdge display, an Intel Core processor, and an aluminium chassis.',
  'Wireless Noise-Cancelling Headphones':
    'Over-ear headphones for listening to music and podcasts and for taking phone calls hands-free. Bluetooth with active noise cancellation, 30-hour battery life, and plush memory-foam ear cushions.',
  'Portable Bluetooth Speaker':
    'A speaker for playing music out loud at home or outdoors. Compact and waterproof with deep bass and 12-hour playtime.',
  'Smart Fitness Watch':
    'A smartwatch for tracking workouts, heart rate, sleep, and steps, and for seeing call and message notifications on your wrist. Water-resistant with built-in GPS and a bright AMOLED display.',
  '4K Action Camera':
    'A camera for recording video and taking photos of sports and outdoor adventures. Ultra HD action camera with image stabilization, waterproof housing, and a wide-angle lens.',
  'Mechanical Gaming Keyboard':
    'A keyboard for typing and gaming on a computer. RGB backlit mechanical keyboard with hot-swappable tactile switches and a durable aluminium frame.',
};

console.log('Loading gte-small model...');
const extractor = await pipeline('feature-extraction', 'Supabase/gte-small');
const embed = async (t) => Array.from((await extractor(t, { pooling: 'mean', normalize: true })).data);

let updated = 0;
for (const [name, description] of Object.entries(DESCRIPTIONS)) {
  const embedding = await embed(`${name}. ${description}`);
  const { error } = await s
    .from('products')
    .update({ description, embedding })
    .eq('name', name);
  if (error) console.error(`  ✗ ${name}: ${error.message}`);
  else { updated++; console.log(`  ✓ ${name}`); }
}
console.log(`\nUpdated + re-embedded ${updated} products.`);
process.exit(0);
