// scripts/evaluate.mjs
// Offline evaluation of the search pipeline. Runs a fixed test set of queries
// (each with known-relevant products) through four retrieval methods and reports
// precision@k, recall@k, and NDCG@k — so we can prove hybrid + rerank actually
// beats vector-alone instead of eyeballing it.
//
//   npm run evaluate
//
// Methods compared:
//   keyword      — full-text only (keyword_search RPC)
//   semantic     — vector only (semantic_search RPC)
//   hybrid       — keyword + semantic fused with RRF
//   hybrid+rerank— hybrid, then cross-encoder rerank (the live pipeline)

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const K = 5;
const RRF_K = 60;
const SHORTLIST = 10;

// --- Test set: query -> the product names that SHOULD be returned ----------
const TESTS = [
  ['noise cancelling headphones', ['Wireless Noise-Cancelling Headphones']],
  ['something to listen to music', ['Wireless Noise-Cancelling Headphones', 'Portable Bluetooth Speaker']],
  ['device to call someone', ['Apple iPhone 15 Pro', 'Apple iPhone 15', 'Apple iPhone 14', 'Apple iPhone SE', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S24', 'Google Pixel 8', 'OnePlus 12', 'Samsung Galaxy A55']],
  ['iphone', ['Apple iPhone 15 Pro', 'Apple iPhone 15', 'Apple iPhone 14', 'Apple iPhone SE']],
  ['samsung phone', ['Samsung Galaxy S24 Ultra', 'Samsung Galaxy S24', 'Samsung Galaxy A55']],
  ['laptop for work', ['Apple MacBook Air M3', 'Dell XPS 13 Laptop']],
  ['book about building good habits', ['Atomic Habits']],
  ['software engineering book', ['The Pragmatic Programmer', 'Clean Code']],
  ['history book about humankind', ['Sapiens: A Brief History of Humankind']],
  ['cookbook with recipes', ['Cooking for Beginners']],
  ['rfid wallet', ['Genuine Leather Wallet']],
  ['sunglasses for driving', ['Polarized Sunglasses']],
  ['take photos outdoors', ['4K Action Camera']],
  ['fitness tracker watch', ['Smart Fitness Watch']],
  ['mechanical keyboard for gaming', ['Mechanical Gaming Keyboard']],
  ['warm clothing for winter', ['Cozy Knit Sweater', 'Classic Denim Jacket']],
  ['summer dress', ['Floral Summer Maxi Dress']],
  ['gym workout leggings', ['Women Running Leggings']],
  ['keep drinks cold', ['Stainless Steel Water Bottle']],
  ['bag to carry a laptop', ['Canvas Backpack']],
];

// --- Metrics ---------------------------------------------------------------
function precisionAtK(retrieved, relevant, k) {
  const hits = retrieved.slice(0, k).filter((n) => relevant.has(n)).length;
  return hits / k;
}
function recallAtK(retrieved, relevant, k) {
  const hits = retrieved.slice(0, k).filter((n) => relevant.has(n)).length;
  return relevant.size ? hits / relevant.size : 0;
}
function ndcgAtK(retrieved, relevant, k) {
  let dcg = 0;
  for (let i = 0; i < k && i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(relevant.size, k); i++) idcg += 1 / Math.log2(i + 2);
  return idcg ? dcg / idcg : 0;
}

// --- Retrieval methods (mirror the live pipeline) --------------------------
async function keywordNames(query) {
  const { data } = await s.rpc('keyword_search', { query_text: query, match_count: 20 }).select('name');
  return (data ?? []).map((p) => p.name);
}
async function semanticRows(query, embed) {
  const qe = await embed(query);
  const { data } = await s.rpc('semantic_search', { query_embedding: qe, match_count: 20 }).select('id, name, description');
  return data ?? [];
}
function rrf(keyword, semantic) {
  const score = new Map();
  keyword.forEach((n, i) => score.set(n, (score.get(n) ?? 0) + 1 / (RRF_K + i + 1)));
  semantic.forEach((r, i) => score.set(r.name, (score.get(r.name) ?? 0) + 1 / (RRF_K + i + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

async function run() {
  const { pipeline, AutoTokenizer, AutoModelForSequenceClassification } = await import('@xenova/transformers');
  console.log('Loading models...');
  const ex = await pipeline('feature-extraction', 'Supabase/gte-small');
  const embed = async (t) => Array.from((await ex(t, { pooling: 'mean', normalize: true })).data);
  const tok = await AutoTokenizer.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2');
  const ce = await AutoModelForSequenceClassification.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2');
  const crossScore = async (q, text) => {
    const inputs = tok(q, { text_pair: text, padding: true, truncation: true });
    const { logits } = await ce(inputs);
    return Number(logits.data[0]);
  };

  const methods = ['keyword', 'semantic', 'hybrid', 'hybrid+rerank'];
  const totals = Object.fromEntries(methods.map((m) => [m, { p: 0, r: 0, n: 0 }]));

  for (const [query, relevantList] of TESTS) {
    const relevant = new Set(relevantList);
    const kw = await keywordNames(query);
    const sem = await semanticRows(query, embed);
    const semNames = sem.map((r) => r.name);
    const fused = rrf(kw, sem);

    // rerank: cross-encode the top-SHORTLIST fused candidates (need their text)
    const textByName = new Map(sem.map((r) => [r.name, `${r.name}. ${r.description ?? ''}`]));
    const shortlist = fused.slice(0, SHORTLIST).filter((n) => textByName.has(n));
    const scored = [];
    for (const n of shortlist) scored.push([n, await crossScore(query, textByName.get(n))]);
    scored.sort((a, b) => b[1] - a[1]);
    const reranked = scored.map(([n]) => n);

    const out = { keyword: kw, semantic: semNames, hybrid: fused, 'hybrid+rerank': reranked };
    for (const m of methods) {
      totals[m].p += precisionAtK(out[m], relevant, K);
      totals[m].r += recallAtK(out[m], relevant, K);
      totals[m].n += ndcgAtK(out[m], relevant, K);
    }
  }

  const N = TESTS.length;
  const pct = (x) => (100 * x / N).toFixed(1).padStart(5);
  console.log(`\nEvaluated ${N} queries · k=${K}\n`);
  console.log('  method'.padEnd(20) + `P@${K}`.padStart(8) + `R@${K}`.padStart(8) + `NDCG@${K}`.padStart(10));
  console.log('  ' + '-'.repeat(44));
  for (const m of methods) {
    console.log('  ' + m.padEnd(18) + pct(totals[m].p) + '%' + pct(totals[m].r) + '%' + pct(totals[m].n).padStart(9) + '%');
  }
  console.log('');
  process.exit(0);
}

run();
