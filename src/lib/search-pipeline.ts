// src/lib/search-pipeline.ts
//
// The full 6-stage search pipeline, orchestrated server-side:
//
//   1. Keyword search   (Postgres full-text  — keyword_search RPC)
//   2. Semantic search  (pgvector            — semantic_search RPC)
//   3. Merge            (union the two result sets by product id)
//   4. Sort             (Reciprocal Rank Fusion of the two rankings)
//   5. Rerank           (cross-encoder over the shortlisted candidates)
//   6. LLM conversation (Claude writes a recommendation + per-product reasons)

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateEmbedding } from './embeddings';
import { rerank } from './reranker';
import { converse } from './llm';

const CARD_COLUMNS =
  'id, name, description, image_url, stock, bestseller, rating, review_count, discount_percent';

export type PipelineProduct = {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  stock: number;
  bestseller: boolean;
  rating: number | null;
  review_count: number | null;
  discount_percent: number;
};

export type ResultProduct = PipelineProduct & {
  why: string;
  rerankScore: number;
  price: number | null;
  fromPrice: boolean;
};

export type Stage = {
  name: string;
  note: string;
  items: { id: number; name: string; meta?: string }[];
};

export type SearchFilters = {
  category?: string | null;
  inStock?: boolean;
  maxPrice?: number | null;
};

export type PipelineResult = {
  query: string;
  stages: Stage[];
  results: ResultProduct[];
  summary: string;
  llmEnabled: boolean;
};

const RRF_K = 60; // standard Reciprocal Rank Fusion constant
const SHORTLIST = 10; // how many merged candidates to rerank
const TOP_RESULTS = 6; // how many final results to keep / send to the LLM
// Relative weight of each retrieval method in the RRF fusion (stage 4). Equal
// by default; raise KEYWORD_WEIGHT to favor exact-term matches (often good for
// product catalogs), raise SEMANTIC_WEIGHT to favor meaning/natural language.
const KEYWORD_WEIGHT = 1.0;
const SEMANTIC_WEIGHT = 1.0;
// If the best cross-encoder score is below this, the model isn't confident any
// candidate is relevant (common for queries whose words don't appear in the
// catalog). Trusting that ranking just adds noise, so we keep the fused order.
const RERANK_CONFIDENCE_FLOOR = -8;

// Fallback "why" when the LLM stage is disabled — plain keyword overlap,
// matching the kind of explanation in the requested example output.
function overlapWhy(query: string, p: PipelineProduct): string {
  const qWords = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  );
  const text = `${p.name} ${p.description}`.toLowerCase();
  const hits = [...qWords].filter((w) => text.includes(w));
  return hits.length ? `Matched on: ${hits.join(', ')}` : 'Semantic (meaning) match';
}

export async function runSearchPipeline(
  query: string,
  filters: SearchFilters = {}
): Promise<PipelineResult> {
  const supabase = createServerComponentClient({ cookies });

  // Shared metadata-filter args, applied inside BOTH subqueries.
  const filterArgs = {
    filter_category: filters.category ?? null,
    filter_in_stock: filters.inStock ?? false,
    filter_max_price: filters.maxPrice ?? null,
  };

  // ---- Stage 1: keyword / full-text search ----------------------------
  const { data: keywordHits } = await supabase
    .rpc('keyword_search', { query_text: query, match_count: 20, ...filterArgs })
    .select(CARD_COLUMNS)
    .returns<PipelineProduct[]>();
  const keyword = keywordHits ?? [];

  // ---- Stage 2: semantic / vector search ------------------------------
  const queryEmbedding = await generateEmbedding(query);
  const { data: semanticHits } = await supabase
    .rpc('semantic_search', { query_embedding: queryEmbedding, match_count: 20, ...filterArgs })
    .select(CARD_COLUMNS)
    .returns<PipelineProduct[]>();
  const semantic = semanticHits ?? [];

  // ---- Stage 3: merge -------------------------------------------------
  type Entry = { p: PipelineProduct; kwRank: number; semRank: number };
  const byId = new Map<number, Entry>();
  keyword.forEach((p, i) => byId.set(p.id, { p, kwRank: i + 1, semRank: Infinity }));
  semantic.forEach((p, i) => {
    const existing = byId.get(p.id);
    if (existing) existing.semRank = i + 1;
    else byId.set(p.id, { p, kwRank: Infinity, semRank: i + 1 });
  });
  const merged = [...byId.values()];

  // ---- Stage 4: sort (Reciprocal Rank Fusion) -------------------------
  const scored = merged.map((e) => ({
    ...e,
    rrf:
      (e.kwRank < Infinity ? KEYWORD_WEIGHT / (RRF_K + e.kwRank) : 0) +
      (e.semRank < Infinity ? SEMANTIC_WEIGHT / (RRF_K + e.semRank) : 0),
  }));
  scored.sort((a, b) => b.rrf - a.rrf);
  const sorted = scored.map((e) => e.p);

  // ---- Stage 5: rerank (cross-encoder), with a confidence guard -------
  const shortlist = sorted
    .slice(0, SHORTLIST)
    .map((p) => ({ ...p, text: `${p.name}. ${p.description ?? ''}` }));
  const reranked = await rerank(query, shortlist);
  const rerankConfident =
    reranked.length > 0 && reranked[0].score >= RERANK_CONFIDENCE_FLOOR;
  // When confident, use the cross-encoder order; otherwise keep the fused (RRF)
  // order but still attach the scores so the breakdown shows what happened.
  const ordered = rerankConfident
    ? reranked
    : shortlist.map((p) => ({
        ...p,
        score: reranked.find((r) => r.id === p.id)?.score ?? 0,
      }));
  const topProducts = ordered.slice(0, TOP_RESULTS);

  // ---- Stage 6: LLM conversation --------------------------------------
  const llm = await converse(
    query,
    topProducts.map((p) => ({ id: p.id, name: p.name, description: p.description }))
  );
  const whyById = new Map(llm.ranking.map((r) => [r.id, r.why]));

  // Pull variant prices for the final products so cards can show "from $X".
  const ids = topProducts.map((p) => p.id);
  const { data: variantRows } = await supabase
    .from('product_variants')
    .select('product_id, price')
    .in('product_id', ids);
  const pricesById = new Map<number, number[]>();
  (variantRows ?? []).forEach((v: { product_id: number; price: number }) => {
    const arr = pricesById.get(v.product_id) ?? [];
    arr.push(Number(v.price));
    pricesById.set(v.product_id, arr);
  });

  const results: ResultProduct[] = topProducts.map((p) => {
    const prices = (pricesById.get(p.id) ?? []).filter((n) => !Number.isNaN(n));
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      image_url: p.image_url,
      stock: p.stock,
      bestseller: p.bestseller,
      rating: p.rating,
      review_count: p.review_count,
      discount_percent: p.discount_percent,
      rerankScore: p.score,
      why: whyById.get(p.id) ?? overlapWhy(query, p),
      price: prices.length ? Math.min(...prices) : null,
      fromPrice: new Set(prices).size > 1,
    };
  });

  const stages: Stage[] = [
    {
      name: '1 · Keyword search (full-text)',
      note: `${keyword.length} hits`,
      items: keyword.map((p) => ({ id: p.id, name: p.name })),
    },
    {
      name: '2 · Semantic search (vector)',
      note: `${semantic.length} hits`,
      items: semantic.map((p) => ({ id: p.id, name: p.name })),
    },
    {
      name: '3 · Merge',
      note: `${merged.length} unique products`,
      items: merged.map((e) => ({
        id: e.p.id,
        name: e.p.name,
        meta:
          (e.kwRank < Infinity ? `kw#${e.kwRank}` : 'kw—') +
          ' ' +
          (e.semRank < Infinity ? `sem#${e.semRank}` : 'sem—'),
      })),
    },
    {
      name: '4 · Sort (Reciprocal Rank Fusion)',
      note: `fused ranking · weights kw=${KEYWORD_WEIGHT} sem=${SEMANTIC_WEIGHT}`,
      items: scored.map((e) => ({ id: e.p.id, name: e.p.name, meta: `rrf ${e.rrf.toFixed(4)}` })),
    },
    {
      name: '5 · Rerank (cross-encoder)',
      note: rerankConfident
        ? `top ${reranked.length} re-scored`
        : `low confidence (best ${reranked[0]?.score.toFixed(2) ?? 'n/a'}) — kept fused order`,
      items: ordered.map((p) => ({ id: p.id, name: p.name, meta: `score ${p.score.toFixed(2)}` })),
    },
    {
      name: '6 · LLM conversation (Groq)',
      note: llm.enabled
        ? 'groq wrote the summary + reasons'
        : 'disabled — set GROQ_API_KEY to enable (using keyword-overlap reasons)',
      items: [],
    },
  ];

  return {
    query,
    stages,
    results,
    summary: llm.summary,
    llmEnabled: llm.enabled,
  };
}
