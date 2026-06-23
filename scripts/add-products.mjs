// scripts/add-products.mjs
// One-off: inserts a batch of additional test products (with variants + specs).
// Safe to re-run — skips products whose name already exists.
// After running, run `npm run embeddings` to embed the new rows.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const seed = (k) => `https://picsum.photos/seed/${k}/600/600`;

const CATALOG = [
  // ---- Electronics ----
  { cat: 'Electronics', name: 'Samsung Galaxy S24 Ultra',
    desc: 'Android flagship smartphone with a 6.8-inch Dynamic AMOLED display, 200MP camera, built-in S Pen, and all-day battery life.',
    img: 'galaxys24', stock: 30, bestseller: true, rating: 4.7, reviews: 740, disc: 8,
    variants: [['Black','256GB',1199],['Black','512GB',1399],['Gray','256GB',1199],['Gray','512GB',1399]],
    specs: [['Display','6.8" Dynamic AMOLED'],['Camera','200MP main'],['Chip','Snapdragon 8 Gen 3'],['Stylus','Built-in S Pen']] },
  { cat: 'Electronics', name: 'Apple MacBook Air M3',
    desc: 'Thin and light laptop powered by the Apple M3 chip, with a 13.6-inch Liquid Retina display and up to 18 hours of battery life.',
    img: 'macbookair', stock: 22, bestseller: true, rating: 4.9, reviews: 1500, disc: 0,
    variants: [['Silver','256GB',1099],['Silver','512GB',1299],['Gray','512GB',1299]],
    specs: [['Chip','Apple M3'],['Display','13.6" Liquid Retina'],['Battery','Up to 18 hours'],['Weight','1.24 kg']] },
  { cat: 'Electronics', name: 'Dell XPS 13 Laptop',
    desc: 'Compact Windows ultrabook with a 13.4-inch InfinityEdge display, Intel Core processor, and a sleek aluminium chassis.',
    img: 'dellxps13', stock: 18, bestseller: false, rating: 4.5, reviews: 430, disc: 12,
    variants: [['Silver','512GB',999],['Silver','1TB',1199]],
    specs: [['Display','13.4" InfinityEdge'],['Processor','Intel Core Ultra 7'],['RAM','16GB']] },
  { cat: 'Electronics', name: 'Mechanical Gaming Keyboard',
    desc: 'RGB backlit mechanical keyboard with hot-swappable tactile switches, a durable aluminium frame, and full N-key rollover.',
    img: 'mechkeyboard', stock: 55, bestseller: false, rating: 4.6, reviews: 610, disc: 10,
    variants: [['Black','Full Size',89],['White','Full Size',89]],
    specs: [['Switches','Hot-swappable tactile'],['Backlight','Per-key RGB'],['Connection','USB-C']] },

  // ---- Dress ----
  { cat: 'Dress', name: 'Men Slim Fit Chinos',
    desc: 'Comfortable stretch-cotton chinos with a modern slim fit, perfect for both office wear and casual weekends.',
    img: 'chinos', stock: 60, bestseller: false, rating: 4.3, reviews: 180, disc: 15,
    variants: [['Khaki','30',39],['Khaki','32',39],['Navy','32',39],['Navy','34',39]],
    specs: [['Material','98% Cotton 2% Elastane'],['Fit','Slim']] },
  { cat: 'Dress', name: 'Women Running Leggings',
    desc: 'High-waisted squat-proof leggings made from moisture-wicking fabric with a hidden waistband pocket for workouts.',
    img: 'leggings', stock: 48, bestseller: true, rating: 4.6, reviews: 520, disc: 20,
    variants: [['Black','S',34],['Black','M',34],['Purple','M',34],['Purple','L',34]],
    specs: [['Material','Nylon / Spandex'],['Waist','High-rise'],['Feature','Hidden pocket']] },
  { cat: 'Dress', name: 'Casual Cotton T-Shirt',
    desc: 'Soft breathable 100% cotton crew-neck t-shirt with a relaxed everyday fit that holds its shape after washing.',
    img: 'tshirt', stock: 120, bestseller: false, rating: 4.2, reviews: 300, disc: 0,
    variants: [['White','S',15],['White','M',15],['Black','M',15],['Gray','L',15]],
    specs: [['Material','100% Cotton'],['Neck','Crew']] },

  // ---- Books ----
  { cat: 'Books', name: 'Clean Code',
    desc: 'A handbook of agile software craftsmanship that teaches how to write readable, well-structured, and maintainable code.',
    img: 'cleancode', stock: 90, bestseller: true, rating: 4.7, reviews: 1900, disc: 0,
    variants: [['Default','One Size',34]], specs: [['Pages','464'],['Author','Robert C. Martin']] },
  { cat: 'Books', name: 'The Lean Startup',
    desc: 'A guide to building successful startups using validated learning, rapid experimentation, and iterative product releases.',
    img: 'leanstartup', stock: 75, bestseller: false, rating: 4.5, reviews: 1100, disc: 10,
    variants: [['Default','One Size',19]], specs: [['Pages','336'],['Author','Eric Ries']] },
  { cat: 'Books', name: 'Sapiens: A Brief History of Humankind',
    desc: 'A sweeping account of human history exploring how Homo sapiens came to dominate the planet through cognitive and cultural revolutions.',
    img: 'sapiens', stock: 85, bestseller: true, rating: 4.8, reviews: 4200, disc: 8,
    variants: [['Default','One Size',22]], specs: [['Pages','512'],['Author','Yuval Noah Harari']] },

  // ---- Accessories ----
  { cat: 'Accessories', name: 'Stainless Steel Water Bottle',
    desc: 'Double-walled vacuum-insulated bottle that keeps drinks cold for 24 hours or hot for 12, with a leak-proof lid.',
    img: 'waterbottle', stock: 100, bestseller: false, rating: 4.4, reviews: 380, disc: 5,
    variants: [['Silver','750ml',24],['Black','750ml',24]],
    specs: [['Insulation','Double-wall vacuum'],['Capacity','750ml']] },
  { cat: 'Accessories', name: 'Canvas Backpack',
    desc: 'Durable water-resistant canvas backpack with a padded laptop compartment and multiple organizer pockets for daily commutes.',
    img: 'backpack', stock: 65, bestseller: true, rating: 4.5, reviews: 540, disc: 12,
    variants: [['Gray','One Size',49],['Green','One Size',49]],
    specs: [['Capacity','20L'],['Laptop','Fits up to 15"']] },
];

const { data: cats, error: cErr } = await s.from('category').select('id, category_name');
if (cErr) { console.error('Cannot read categories:', cErr.message); process.exit(1); }
const catId = Object.fromEntries(cats.map((c) => [c.category_name, c.id]));

let added = 0, skipped = 0;
for (const item of CATALOG) {
  const { data: ex } = await s.from('products').select('id').eq('name', item.name).maybeSingle();
  if (ex) { skipped++; console.log('skip (exists):', item.name); continue; }

  const { data: prod, error: pe } = await s.from('products').insert({
    name: item.name, description: item.desc, image_url: seed(item.img),
    stock: item.stock, bestseller: item.bestseller, rating: item.rating,
    review_count: item.reviews, discount_percent: item.disc, category_id: catId[item.cat],
  }).select('id').single();
  if (pe) { console.error('ERR', item.name, '->', pe.message); continue; }

  const variants = item.variants.map(([color, size, price]) => ({
    product_id: prod.id, color, size, price, stock: 8, image_url: seed(item.img), discount_percent: item.disc,
  }));
  await s.from('product_variants').insert(variants);

  const specs = item.specs.map(([spec_name, spec_value]) => ({ product_id: prod.id, spec_name, spec_value }));
  await s.from('product_spec').insert(specs);

  added++;
  console.log(`added: ${item.name} (${variants.length} variants, ${specs.length} specs)`);
}
console.log(`\nADDED: ${added} | SKIPPED: ${skipped}`);
process.exit(0);
