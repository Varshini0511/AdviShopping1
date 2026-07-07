// scripts/download-images.mjs
// Hybrid product-image downloader (no API keys):
//   • DummyJSON  — clean e-commerce product shots for categories it covers
//     (phones, laptops, sunglasses, watches, dresses, tops, shirts, bags).
//     Phones/laptops are brand-matched so iPhones show iPhones, etc.
//   • Openverse  — Creative Commons search for everything else.
// Updates products.image_url + product_variants.image_url.
//
//   node scripts/download-images.mjs

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const OUT_DIR = path.join('public', 'products');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// product -> DummyJSON category (+ optional brand keyword to match in the title)
const DJ = {
  'Apple iPhone 15 Pro': ['smartphones', 'iphone'],
  'Apple iPhone 15': ['smartphones', 'iphone'],
  'Apple iPhone 14': ['smartphones', 'iphone'],
  'Apple iPhone SE': ['smartphones', 'iphone'],
  'Samsung Galaxy S24 Ultra': ['smartphones', 'samsung'],
  'Samsung Galaxy S24': ['smartphones', 'samsung'],
  'Samsung Galaxy A55': ['smartphones', 'samsung'],
  'Google Pixel 8': ['smartphones', ''],
  'OnePlus 12': ['smartphones', 'oneplus'],
  'Apple MacBook Air M3': ['laptops', 'macbook'],
  'Dell XPS 13 Laptop': ['laptops', 'dell'],
  'Polarized Sunglasses': ['sunglasses', ''],
  'Smart Fitness Watch': ['mens-watches', ''],
  'Floral Summer Maxi Dress': ['womens-dresses', ''],
  'Cozy Knit Sweater': ['tops', ''],
  'Casual Cotton T-Shirt': ['mens-shirts', ''],
  'Canvas Backpack': ['womens-bags', ''],
};
// product -> Openverse search term
const OV = {
  'Wireless Noise-Cancelling Headphones': 'headphones',
  'Portable Bluetooth Speaker': 'bluetooth speaker',
  '4K Action Camera': 'action camera',
  'Classic Denim Jacket': 'denim jacket',
  'Mechanical Gaming Keyboard': 'mechanical keyboard',
  'Genuine Leather Wallet': 'leather wallet',
  'Men Slim Fit Chinos': 'chino trousers',
  'Women Running Leggings': 'woman wearing leggings',
  'Stainless Steel Water Bottle': 'steel water bottle',
  'The Pragmatic Programmer': 'stack of books',
  'Atomic Habits': 'stack of books',
  'Cooking for Beginners': 'cookbook',
  'Clean Code': 'open book',
  'The Lean Startup': 'hardcover book',
  'Sapiens: A Brief History of Humankind': 'history books',
};
const BAD = /logo|icon|diagram|screenshot|clip ?art|sketch|smiley|doll|funeral|meme/i;

const djCache = new Map(); // category -> [{title, img}]
const djUsed = new Map(); // category -> Set(index)

async function djCategory(cat) {
  if (!djCache.has(cat)) {
    const res = await fetch(`https://dummyjson.com/products/category/${cat}?limit=30&select=title,images`);
    const data = await res.json();
    djCache.set(cat, (data.products || []).map((p) => ({ title: p.title, img: p.images?.[0] })).filter((x) => x.img));
    djUsed.set(cat, new Set());
  }
  return djCache.get(cat);
}

async function pickDummyJson(cat, brand) {
  const list = await djCategory(cat);
  const used = djUsed.get(cat);
  const order = brand
    ? [...list.keys()].sort((a, b) => (list[b].title.toLowerCase().includes(brand) ? 1 : 0) - (list[a].title.toLowerCase().includes(brand) ? 1 : 0))
    : [...list.keys()];
  const idx = order.find((i) => !used.has(i)) ?? order[0];
  used.add(idx);
  return list[idx];
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const ct = res.headers.get('content-type') || '';
  if (!/image\/(jpeg|png|webp)/.test(ct)) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2500) return null;
  return { buf, ext: /png/.test(ct) ? 'png' : /webp/.test(ct) ? 'webp' : 'jpg' };
}

async function pickOpenverse(term) {
  const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(term)}&page_size=15&mature=false`, {
    headers: { 'User-Agent': 'AdviShopping/1.0' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const cands = (data.results || []).filter((r) => !BAD.test(r.title || ''));
  for (const c of cands.slice(0, 8)) {
    for (const link of [c.thumbnail, c.url]) {
      if (!link) continue;
      const d = await download(link);
      if (d) return { ...d, title: c.title };
    }
  }
  return null;
}

await mkdir(OUT_DIR, { recursive: true });
const { data: products, error } = await s.from('products').select('id, name').order('id');
if (error) { console.error(error.message); process.exit(1); }

let ok = 0;
for (const p of products) {
  try {
    let got = null;
    let src = '';
    if (DJ[p.name]) {
      const [cat, brand] = DJ[p.name];
      const pick = await pickDummyJson(cat, brand);
      got = await download(pick.img);
      if (got) got.title = pick.title;
      src = 'dummyjson';
    }
    if (!got && OV[p.name]) {
      got = await pickOpenverse(OV[p.name]);
      src = 'openverse';
    }
    if (!got) got = await pickOpenverse(p.name), (src = 'openverse');
    if (!got) throw new Error('no image found');

    const file = `${slug(p.name)}.${got.ext}`;
    await writeFile(path.join(OUT_DIR, file), got.buf);
    const publicPath = `/products/${file}`;
    await s.from('products').update({ image_url: publicPath }).eq('id', p.id);
    await s.from('product_variants').update({ image_url: publicPath }).eq('product_id', p.id);

    ok++;
    console.log(`  ✓ ${p.name.padEnd(38)} [${src.padEnd(9)}] ${(got.title || '').slice(0, 34)}`);
    await sleep(300);
  } catch (e) {
    console.error(`  ✗ ${p.name}: ${e.message}`);
    await sleep(300);
  }
}
console.log(`\nDone: ${ok}/${products.length} images.`);
process.exit(0);
