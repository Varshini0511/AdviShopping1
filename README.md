# AdviShopping — AI Search & Shopping Agent

A full-stack e-commerce demo built around three AI capabilities that go well beyond a typical CRUD shop:

1. **Hybrid search** — a 6-stage retrieval pipeline (keyword + semantic + fusion + reranking + LLM), with hard metadata filters and a reproducible evaluation harness.
2. **Conversational shopping agent** — an LLM that *takes real actions* via tool calling (search, add to cart, wishlist), with a grounding guardrail that blocks hallucinated products. Supports voice in/out.
3. **Visual search** — upload a photo, find visually similar products via CLIP image embeddings.

> **Live demo:** _add your deployed URL here_
> Browsing and search are public. Log in to use the cart.

---

## Why it's interesting

Most shop demos do `WHERE name ILIKE '%query%'`. This one runs a **6-stage retrieval pipeline**:

| Stage | Technique |
|-------|-----------|
| 1 · Keyword search | Postgres full-text (`tsvector` + GIN index) |
| 2 · Semantic search | `pgvector` + `gte-small` embeddings (384-dim) |
| 3 · Merge | union the two candidate sets by product id |
| 4 · Sort | **Reciprocal Rank Fusion**, with tunable keyword/semantic weights |
| 5 · Rerank | cross-encoder (`ms-marco-MiniLM`) + a confidence floor |
| 6 · Conversation | LLM writes a recommendation and a per-product "why" |

Try these — they return the right products despite sharing **no words** with them:
- `device to call someone` → phones
- `something to listen to music` → headphones, speaker
- `book about building good habits` → Atomic Habits

The search page has a **"How these results were ranked"** panel that shows every stage's output, so you can watch the pipeline work.

---

## The shopping agent

Type or speak a request and the agent performs it:

> *"add a watch to my cart"* → searches, finds `Smart Fitness Watch (id 2)`, calls `add_to_cart`, confirms.

**How it works** — the LLM never touches the database. It can only emit a structured request (`{name, arguments}`) for one of six declared tools; the server executes it:

| Tool | Action |
|---|---|
| `search_products` | hybrid search (keyword + semantic) |
| `add_to_cart` | insert/update `cart_items` |
| `add_to_wishlist` / `save_for_later` | upsert `saved_items` |
| `view_cart` / `view_saved` | read the user's lists |

**Safety properties baked in:**
- **Grounding guardrail** — every price in the reply is verified against the real tool result. If the model invents a product, the reply is discarded and replaced with a deterministic message built from actual data. (This caught the model fabricating "Sony Wireless Headphones" during development.)
- **Auth boundary** — `user.id` comes from the session cookie, never from the model, so the agent can't act on another user's cart.
- **No fake purchases** — "buy this" adds to the cart and says so; it never claims a completed transaction.
- **Bounded loop** — `MAX_STEPS` caps the agent; failed tool-call generations are retried.

**Voice** uses the browser-native Web Speech API — no dependency, no key. Speech → text → the same pipeline → text → speech.

---

## Evaluation

`npm run evaluate` scores 20 labeled queries across four retrieval methods:

```
method                 P@5     R@5    NDCG@5
keyword              18.0%   57.5%    58.1%
semantic             33.0%   97.8%    99.3%
hybrid               33.0%   97.8%    99.3%
hybrid+rerank        33.0%   97.8%    99.6%
```

**Reading this honestly:** keyword-only is clearly weak (58% NDCG — it returns nothing for meaning-based queries). But on a 32-product catalog with clean queries, semantic search alone already saturates the benchmark, so hybrid and reranking show little measurable gain. The big wins those techniques are known for require larger, noisier corpora. Having the harness is what makes that statement provable rather than a guess — and it's what justified disabling the reranker in production.

---

## Tech stack

- **Next.js 15** (App Router, Server Components) · **TypeScript** · **Tailwind CSS**
- **Supabase** — Postgres, `pgvector`, full-text search, RLS, Auth
- **@xenova/transformers** (local, no API key):
  - `Supabase/gte-small` — text embeddings (384-dim)
  - `Xenova/ms-marco-MiniLM-L-6-v2` — cross-encoder reranker
  - `Xenova/clip-vit-base-patch32` — image embeddings (512-dim)
- **Groq** — the LLM for the agent and the search summary (OpenAI-compatible API)

---

## Architecture

```
Browser ──▶ Next.js Server Components / Route Handlers
                │
    ┌───────────┼─────────────────────┬──────────────────────┐
    ▼           ▼                     ▼                      ▼
/search     /api/chat            /api/image-search        /cart etc.
    │           │                     │
search-      agent loop            CLIP embed
pipeline.ts  (chat-tools.ts)     (image-embeddings.ts)
    │           │                     │
    └───────────┴─────── Supabase (Postgres + pgvector) ─────┘
                            │
                          Groq API
```

**Key files**

| Path | Role |
|---|---|
| `src/lib/search-pipeline.ts` | 6-stage orchestrator — merge, weighted RRF, filters |
| `src/lib/embeddings.ts` | query embeddings (gte-small) |
| `src/lib/reranker.ts` | cross-encoder reranking |
| `src/lib/llm.ts` | LLM summary for search |
| `src/lib/chat-tools.ts` | tool definitions + `executeTool` (**the only DB writer**) |
| `src/app/api/chat/route.ts` | the agentic loop + grounding guardrail |
| `src/lib/image-embeddings.ts` | CLIP image/text embeddings |
| `src/components/ChatWidget.tsx` | chat UI + voice |
| `supabase/*.sql` | schema, search functions, wishlist, image search |
| `scripts/evaluate.mjs` | evaluation harness |

---

## Run locally

**1. Install**
```bash
npm install
```

**2. Database** — create a Supabase project, then run these in the SQL Editor, in order:
```
supabase/schema.sql        tables, GIN + HNSW indexes, RLS, seed data
supabase/pipeline.sql      keyword_search / semantic_search (with filters)
supabase/wishlist.sql      saved_items table (for the agent)
supabase/image-search.sql  image_embedding column + image_search (optional)
```

**3. Environment** — create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
GROQ_API_KEY=...            # enables the agent + search summary
REVALIDATION_TOKEN=...
# GROQ_MODEL=qwen/qwen3.8-27b   # optional override (see Gotchas)

# Optional: one-click "Try the demo" button on /login (shared public account).
# Then run `node scripts/create-demo-user.mjs` once to create the user.
NEXT_PUBLIC_DEMO_EMAIL=...
NEXT_PUBLIC_DEMO_PASSWORD=...
# Optional: absolute URL used for the link-preview (Open Graph) card.
# Render sets RENDER_EXTERNAL_URL automatically.
NEXT_PUBLIC_SITE_URL=https://your-app.onrender.com
```

**4. Generate embeddings**
```bash
npm run embeddings          # text embeddings for all products
npm run image-embeddings    # CLIP image embeddings (optional, for visual search)
```

**5. Run**
```bash
npm run dev                 # http://localhost:3000
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `npm start` | production build / serve |
| `npm run embeddings` | embed products (only rows missing an embedding) |
| `npm run image-embeddings` | CLIP-embed product images |
| `npm run evaluate` | precision@k / recall@k / NDCG@k across 4 methods |
| `node scripts/add-products.mjs` | seed extra products |
| `node scripts/add-phones.mjs` | seed phone models with variants |
| `node scripts/download-images.mjs` | fetch product images |
| `node scripts/enrich-descriptions.mjs` | rewrite descriptions function-first, then re-embed |

---

## Deployment

The app loads ML models into the Node process, so it needs a **persistent host** (Render, Railway, Fly) rather than short-lived serverless functions — a cold model load takes 15–40s, which exceeds typical serverless timeouts (e.g. Vercel Hobby's 10s).

**Memory-constrained hosts (e.g. a 512MB free tier)** — two flags disable the heavy models:

| Env var | Saves | Effect |
|---|---|---|
| `DISABLE_RERANKER=true` | ~80MB | skips stage 5, keeps the fused RRF order |
| `DISABLE_VISUAL_SEARCH=true` | ~150MB | `/api/image-search` returns 503 |

Models load **lazily**, so skipping the call means they never load at all. Text search, filters, and the chat agent all keep working.

**Deploying to Render:** Build `npm install && npm run build`, Start `npm start`, Root Directory blank. Set **all** env vars *before* the first build (product pages use `generateStaticParams`, so the build itself queries Supabase). Add your deployed URL to **Supabase → Authentication → URL Configuration** so login works.

---

## Gotchas worth knowing

- **Product descriptions must state function, not just specs.** "device to call someone" returned nothing until descriptions said phones are *"for making phone calls"* — both the embeddings and the reranker read that text. `scripts/enrich-descriptions.mjs` exists for this.
- **Query and product embeddings must use the same model**, or the vectors aren't comparable.
- **Groq rotates its model catalog** and retires models without much notice (`llama-3.3-70b-versatile` started returning 404 mid-development). If the agent breaks with `model_not_found`, set `GROQ_MODEL` to a current model — no code change needed.
- **Free-tier token limits are tight for an agent.** Each turn re-sends the system prompt, all tool schemas, and the growing conversation, so one user message can span several thousand tokens across multiple passes.
- **`next build` (not `--turbopack`)** is used deliberately: Turbopack tolerated a Next.js 15 type error (`params`/`searchParams` are Promises and must be awaited) that the standard build correctly rejects.
