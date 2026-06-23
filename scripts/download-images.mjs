// scripts/download-images.mjs
// Downloads a SUBJECT-MATCHING product photo for every product from Wikimedia
// Commons (searched by specific term, then a generic category term), filtered
// to real jpg/png photos (no logos/diagrams/SVGs/banners). Rate-limit aware.
// Updates products.image_url AND product_variants.image_url.
//
//   node scripts/download-images.mjs

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const OUT_DIR = path.join('public', 'products');
const UA = 'AdviShopping/1.0 (demo project; contact: demo@example.com)';

const SEARCH = {
  'Wireless Noise-Cancelling Headphones': 'headphones',
  'Smart Fitness Watch': 'smartwatch',
  'Portable Bluetooth Speaker': 'bluetooth speaker',
  '4K Action Camera': 'action camera',
  'Floral Summer Maxi Dress': 'summer dress',
  'Classic Denim Jacket': 'denim jacket',
  'Cozy Knit Sweater': 'wool sweater',
  'The Pragmatic Programmer': 'hardcover book',
  'Atomic Habits': 'hardcover book',
  'Cooking for Beginners': 'cookbook',
  'Genuine Leather Wallet': 'leather wallet',
  'Polarized Sunglasses': 'sunglasses',
  'Apple iPhone 15 Pro': 'iPhone 15 Pro',
  'Samsung Galaxy S24 Ultra': 'Samsung Galaxy S24 Ultra',
  'Apple MacBook Air M3': 'MacBook Air',
  'Dell XPS 13 Laptop': 'Dell XPS 13',
  'Mechanical Gaming Keyboard': 'mechanical keyboard',
  'Men Slim Fit Chinos': 'chino trousers',
  'Women Running Leggings': 'leggings',
  'Casual Cotton T-Shirt': 't-shirt',
  'Clean Code': 'hardcover book',
  'The Lean Startup': 'hardcover book',
  'Sapiens: A Brief History of Humankind': 'hardcover book',
  'Stainless Steel Water Bottle': 'water bottle',
  'Canvas Backpack': 'backpack',
  'Apple iPhone 15': 'iPhone 15',
  'Apple iPhone 14': 'iPhone 14',
  'Apple iPhone SE': 'iPhone SE',
  'Samsung Galaxy S24': 'Samsung Galaxy S24',
  'Google Pixel 8': 'Google Pixel 8',
  'OnePlus 12': 'OnePlus 12',
  'Samsung Galaxy A55': 'Samsung Galaxy A55',
};

const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD = /logo|icon|map|diagram|chart|screenshot|font|signature|coat[_ ]of[_ ]arms|flag|sticker|patent|drawing|sketch|label|qr[_ ]code|barcode|advert|poster/i;

function genericTerm(name) {
  if (/iphone|galaxy|pixel|oneplus|phone/i.test(name)) return 'smartphone';
  if (/macbook|xps|laptop/i.test(name)) return 'laptop computer';
  if (/programmer|habits|sapiens|clean code|lean startup|cooking|book/i.test(name)) return 'book';
  return null;
}

async function fetchRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429) { await sleep(4000 * (i + 1)); continue; }
    return res;
  }
  return fetch(url, { headers: { 'User-Agent': UA } });
}

async function searchCommons(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&generator=search&gsrnamespace=6&gsrlimit=15' +
    `&gsrsearch=${encodeURIComponent(term)}` +
    '&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=700';
  const res = await fetchRetry(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = Object.values(data?.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  for (const pg of pages) {
    const info = pg.imageinfo?.[0];
    if (!info || !/image\/(jpeg|png)/.test(info.mime || '')) continue;
    if (BAD.test(pg.title)) continue;
    if (info.width && info.height) {
      const r = info.width / info.height;
      if (r > 2 || r < 0.45) continue; // skip extreme banners/strips
    }
    const thumb = info.thumburl || info.url;
    return { thumb, ext: /\.png(\?|$)/i.test(thumb) ? 'png' : 'jpg', title: pg.title };
  }
  return null;
}

await mkdir(OUT_DIR, { recursive: true });
const { data: products, error } = await s.from('products').select('id, name').order('id');
if (error) { console.error(error.message); process.exit(1); }

let ok = 0;
for (const p of products) {
  const terms = [SEARCH[p.name] || p.name, genericTerm(p.name)].filter(Boolean);
  try {
    let pick = null;
    for (const t of terms) {
      pick = await searchCommons(t);
      if (pick) break;
      await sleep(300);
    }
    if (!pick) throw new Error('no Commons match');

    const res = await fetchRetry(pick.thumb);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1500) throw new Error('too small');

    const file = `${slug(p.name)}.${pick.ext}`;
    await writeFile(path.join(OUT_DIR, file), buf);
    const publicPath = `/products/${file}`;
    await s.from('products').update({ image_url: publicPath }).eq('id', p.id);
    await s.from('product_variants').update({ image_url: publicPath }).eq('product_id', p.id);

    ok++;
    console.log(`  ✓ ${p.name.padEnd(38)} ${publicPath.padEnd(48)} (${pick.title})`);
    await sleep(700); // be polite to Wikimedia
  } catch (e) {
    console.error(`  ✗ ${p.name}: ${e.message}`);
    await sleep(700);
  }
}
console.log(`\nDone: ${ok}/${products.length} images.`);
process.exit(0);
