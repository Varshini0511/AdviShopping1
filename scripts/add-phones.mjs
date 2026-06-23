// scripts/add-phones.mjs
// Adds several iPhone + Android phone models (separate products) with
// color × storage variants and specs — a test set for "search for phone".
// Safe to re-run: skips products whose name already exists.
// After running: `npm run embeddings` to embed the new products.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const seed = (k) => `https://picsum.photos/seed/${k}/600/600`;

// Each phone: colors × storage(price) builds the variant matrix.
const PHONES = [
  // ---- iPhones ----
  { name: 'Apple iPhone 15',
    desc: 'A smartphone for making and receiving phone calls, video calls, and text messages, plus apps, photos, and the internet. The iPhone 15 has the A16 Bionic chip, a 48MP camera, USB-C, and a 6.1-inch Super Retina XDR display.',
    img: 'iphone15', rating: 4.6, reviews: 820, disc: 5,
    colors: ['Black', 'Blue', 'Pink'], storage: [['128GB', 799], ['256GB', 899]],
    specs: [['Display', '6.1" Super Retina XDR'], ['Chip', 'A16 Bionic'], ['Camera', '48MP main']] },
  { name: 'Apple iPhone 14',
    desc: 'A smartphone for phone calls, video calls, texting, and everyday apps. The iPhone 14 features the A15 Bionic chip, a dual-camera system, and a 6.1-inch OLED display.',
    img: 'iphone14', rating: 4.5, reviews: 1500, disc: 12,
    colors: ['Black', 'Blue', 'White'], storage: [['128GB', 699], ['256GB', 799]],
    specs: [['Display', '6.1" OLED'], ['Chip', 'A15 Bionic'], ['Camera', 'Dual 12MP']] },
  { name: 'Apple iPhone SE',
    desc: 'A compact and affordable smartphone for phone calls, texts, and apps, with Touch ID and the A15 Bionic chip in a 4.7-inch design.',
    img: 'iphonese', rating: 4.2, reviews: 410, disc: 10,
    colors: ['Black', 'White'], storage: [['64GB', 429], ['128GB', 479]],
    specs: [['Display', '4.7" Retina HD'], ['Chip', 'A15 Bionic'], ['Security', 'Touch ID']] },

  // ---- Android ----
  { name: 'Samsung Galaxy S24',
    desc: 'An Android smartphone for phone calls, video calls, texting, and apps. The Galaxy S24 has a 6.2-inch Dynamic AMOLED display, a 50MP camera, and built-in AI features.',
    img: 'galaxys24base', rating: 4.6, reviews: 640, disc: 8,
    colors: ['Black', 'Gray', 'Purple'], storage: [['128GB', 799], ['256GB', 859]],
    specs: [['Display', '6.2" Dynamic AMOLED'], ['Camera', '50MP main'], ['Chip', 'Snapdragon 8 Gen 3']] },
  { name: 'Google Pixel 8',
    desc: 'An Android smartphone for calls, video calls, texting, and Google apps, with an excellent camera and seven years of updates. 6.2-inch OLED display and the Google Tensor G3 chip.',
    img: 'pixel8', rating: 4.7, reviews: 980, disc: 10,
    colors: ['Black', 'Green'], storage: [['128GB', 699], ['256GB', 759]],
    specs: [['Display', '6.2" OLED'], ['Chip', 'Tensor G3'], ['Camera', '50MP main']] },
  { name: 'OnePlus 12',
    desc: 'A fast Android smartphone for phone calls, messaging, gaming, and apps. Features a 6.82-inch AMOLED display, the Snapdragon 8 Gen 3 chip, and very fast charging.',
    img: 'oneplus12', rating: 4.5, reviews: 520, disc: 12,
    colors: ['Black', 'Green'], storage: [['256GB', 799], ['512GB', 899]],
    specs: [['Display', '6.82" AMOLED'], ['Chip', 'Snapdragon 8 Gen 3'], ['Charging', '100W']] },
  { name: 'Samsung Galaxy A55',
    desc: 'An affordable Android smartphone for everyday phone calls, texts, photos, and apps. 6.6-inch Super AMOLED display and a 50MP camera.',
    img: 'galaxya55', rating: 4.3, reviews: 300, disc: 15,
    colors: ['Black', 'Blue'], storage: [['128GB', 399], ['256GB', 449]],
    specs: [['Display', '6.6" Super AMOLED'], ['Camera', '50MP main'], ['Battery', '5000mAh']] },
];

const { data: cat } = await s.from('category').select('id').eq('category_name', 'Electronics').single();

let added = 0, skipped = 0;
for (const phone of PHONES) {
  const { data: ex } = await s.from('products').select('id').eq('name', phone.name).maybeSingle();
  if (ex) { skipped++; console.log('skip (exists):', phone.name); continue; }

  // total stock = 6 per variant
  const variantCount = phone.colors.length * phone.storage.length;
  const { data: prod, error: pe } = await s.from('products').insert({
    name: phone.name, description: phone.desc, image_url: seed(phone.img),
    stock: variantCount * 6, bestseller: false, rating: phone.rating,
    review_count: phone.reviews, discount_percent: phone.disc, category_id: cat.id,
  }).select('id').single();
  if (pe) { console.error('ERR', phone.name, '->', pe.message); continue; }

  const variants = [];
  for (const color of phone.colors)
    for (const [size, price] of phone.storage)
      variants.push({ product_id: prod.id, color, size, price, stock: 6, image_url: seed(phone.img), discount_percent: phone.disc });
  await s.from('product_variants').insert(variants);

  const specs = phone.specs.map(([spec_name, spec_value]) => ({ product_id: prod.id, spec_name, spec_value }));
  await s.from('product_spec').insert(specs);

  added++;
  console.log(`added: ${phone.name} (${variants.length} variants, ${specs.length} specs)`);
}
console.log(`\nADDED: ${added} | SKIPPED: ${skipped}`);
process.exit(0);
