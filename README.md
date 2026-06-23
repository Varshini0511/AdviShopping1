# AdviShopping — Hybrid Search Shopping App

A full-stack e-commerce demo built around a **production-shaped hybrid search pipeline**: it finds products by exact words *and* by meaning, fuses the two, reranks them, and has an LLM explain the results — with metadata filters and a reproducible evaluation harness.

> **Live demo:** _add your deployed URL here_
> Browsing & search are public. To use the cart, log in with the demo account (add yours).

---

## What makes it interesting

Most shop demos do a `WHERE name ILIKE '%query%'`. This one runs a **6-stage retrieval pipeline**:

| Stage | Technique |
|-------|-----------|
| 1 · Keyword search | Postgres full-text (`tsvector` + GIN) |
| 2 · Semantic search | `pgvector` + `gte-small` embeddings (384-dim) |
| 3 · Merge | union the two candidate sets |
| 4 · Sort | **Reciprocal Rank Fusion** (tunable keyword/semantic weights) |
| 5 · Rerank | cross-encoder (`ms-marco-MiniLM`) with a confidence guard |
| 6 · Conversation | LLM (Groq / Llama) writes a recommendation + per-product reasons |

Plus:
- **Metadata filtering** — hard filters (category / in-stock / max price) applied *inside both* retrieval subqueries, the correct way to combine search with structured constraints.
- **Evaluation harness** — `npm run evaluate` scores keyword vs semantic vs hybrid vs hybrid+rerank with **precision@k / recall@k / NDCG@k** against a labeled query set.
- **Local, no-API-key ML** — embeddings and reranking run on-device via `@xenova/transformers` (Hugging Face models in JS). Only the optional LLM step needs a key.

Try queries like `device to call someone`, `something to listen to music`, or `book about building good habits` — they return the right products despite sharing no words with them.

---

## Tech stack

- **Next.js 15** (App Router, Server Components) + **TypeScript** + **Tailwind CSS**
- **Supabase** (Postgres, `pgvector`, full-text search, RLS, Auth)
- **@xenova/transformers** — `Supabase/gte-small` (embeddings), `Xenova/ms-marco-MiniLM-L-6-v2` (reranker)
- **Groq** — LLM conversation stage (OpenAI-compatible API)

---

## Architecture

```
Browser ──▶ Next.js Server Component (/search)
                │
                ▼  src/lib/search-pipeline.ts  (orchestrates the 6 stages)
   ┌────────────┼───────────────────────────────────────────┐
keyword_search  semantic_search     rerank (cross-encoder)   converse (Groq)
 (Postgres FTS) (pgvector)          src/lib/reranker.ts      src/lib/llm.ts
   └──────────── Supabase (Postgres + pgvector) ─────────────┘
```

Key files:
- `src/lib/search-pipeline.ts` — the 6-stage orchestrator (merge, RRF, weights, filters)
- `src/lib/embeddings.ts`, `src/lib/reranker.ts`, `src/lib/llm.ts` — the model stages
- `supabase/schema.sql` — tables, indexes (GIN + HNSW), RLS, seed data
- `supabase/pipeline.sql` — `keyword_search` / `semantic_search` functions (with filters)
- `scripts/evaluate.mjs` — the evaluation harness

---

## Run locally

1. **Install:** `npm install`
2. **Supabase:** create a project, then in the SQL Editor run `supabase/schema.sql`, then `supabase/pipeline.sql`.
3. **Env:** create `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_KEY=...
   GROQ_API_KEY=...            # optional — enables the LLM stage
   REVALIDATION_TOKEN=...
   ```
4. **Embed the products:** `npm run embeddings`
5. **(optional) product images:** `node scripts/download-images.mjs`
6. **Dev:** `npm run dev` → http://localhost:3000
7. **Evaluate search quality:** `npm run evaluate`

---

## Notes

- Embeddings + reranking load ~110MB of models into the Node process, so this app is best hosted on a **persistent server** (Railway / Render / Fly) where models load once and stay warm, rather than short-lived serverless functions.
- Query and product embeddings use the **same** model — a requirement for vector search to be meaningful.
