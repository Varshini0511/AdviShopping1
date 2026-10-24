# AdviShopping — AI Search & Shopping Agent

A full-stack e-commerce demo built around four AI capabilities that go well beyond a typical CRUD shop:

1. **Hybrid search** — a 6-stage retrieval pipeline (keyword + semantic → fusion → cross-encoder rerank → LLM), with hard metadata filters and a reproducible evaluation harness.
2. **Conversational shopping agent** — an LLM that *takes real actions* through tool calling (search, add to cart, wishlist, view cart), guarded by a code-level grounding check so it can't invent products or prices. Supports voice in and out.
3. **Visual search** — upload a photo and find visually similar products with CLIP image embeddings.
4. **Document AI** — extract structured data from **invoices, receipts and product datasheets** with a vision-capable model, schema validation and arithmetic cross-checks, scored on a labelled evaluation set.

> **Live demo:** https://advishopping1.onrender.com
> Hosted on a free tier, so the first visit after idle can take up to a minute to wake up.
> Browsing and search are public. Sign up (or use the one-click demo login when it is enabled) to use the cart and the agent.

Built with **Next.js 15 · TypeScript · Tailwind v4 · Supabase (Postgres + pgvector + Auth) · Transformers.js · Groq · Zod · unpdf · Vitest**.

---

## Contents

- [What it does](#what-it-does)
- [How the search pipeline works](#how-the-search-pipeline-works)
- [The shopping agent](#the-shopping-agent)
- [Visual search](#visual-search)
- [Document extraction](#document-extraction)
- [Evaluation](#evaluation)
- [Accounts & demo login](#accounts--demo-login)
- [Mobile & laptop support](#mobile--laptop-support)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing & CI](#testing--ci)
- [Deployment](#deployment)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## What it does

| Area | Details |
|---|---|
| **Storefront** | Home, category pages, product detail with color/size variants, specs, discounts, stock |
| **Search** | Natural-language search with a visible "how these results were ranked" panel for every stage |
| **Filters** | Category, max price, in-stock only — applied *inside* both retrieval queries |
| **Agent** | Floating chat: *"add a watch to my cart"*, *"what's in my cart?"*, *"save the headphones for later"* |
| **Voice** | Speak a request, hear the reply (browser-native Web Speech API) |
| **Visual search** | Upload an image → visually similar products |
| **Document AI** | Upload an invoice, receipt or datasheet (PDF or photo) → validated JSON, a confidence score and the checks behind it |
| **Cart & auth** | Supabase email/password auth, per-user cart protected by row-level security |
| **Sharing** | Open Graph / Twitter card, generated share image, favicon, per-page titles |

Try these on the home page — they return the right products although they share **no words** with them:

- `device to call someone` → phones
- `something to listen to music` → headphones, speaker
- `book about building good habits` → *Atomic Habits*

…and `iPhone 15` shows the opposite case, where exact-term keyword matching is what you want.

---

## How the search pipeline works

Implemented in [`src/lib/search-pipeline.ts`](src/lib/search-pipeline.ts) and rendered step by step in the UI.

| Stage | Technique | Detail |
|---|---|---|
| **1 · Keyword** | Postgres full-text | `tsvector` generated column + GIN index, `websearch_to_tsquery`, ranked by `ts_rank_cd`. Top 20. |
| **2 · Semantic** | `pgvector` | `gte-small` embeddings (384-dim), cosine distance, HNSW index. Top 20. |
| **3 · Merge** | Union by product id | Each product carries its keyword rank and semantic rank (`∞` if a method missed it) |
| **4 · Sort** | **Reciprocal Rank Fusion** | `Σ weight / (60 + rank)` with tunable keyword/semantic weights. Ranks, not scores — the two score scales aren't comparable. |
| **5 · Rerank** | Cross-encoder | `ms-marco-MiniLM-L-6-v2` scores each *(query, product)* pair together over the top 10. Skipped if even the best score is below a confidence floor. |
| **6 · Conversation** | LLM (Groq) | Writes a short recommendation and a one-line "why" per product, as strict JSON |

Key parameters: `RRF_K = 60`, `SHORTLIST = 10`, `TOP_RESULTS = 6`, `RERANK_CONFIDENCE_FLOOR = -8`.

**Why two retrieval methods.** They fail in opposite directions: keyword search nails exact names (`iPhone 15`) but returns nothing for `device to call someone`; semantic search understands intent but can't tell *iPhone 15* from *iPhone 14*. Fusing ranks keeps the best of both — a product found by **both** methods outranks one found by only one.

**Why a cross-encoder at the end.** A bi-encoder embeds the query and each product separately, so it can't compare their words directly. A cross-encoder reads the pair together, so self-attention can match `15` in the query to `15` in the product. It's too slow for the whole catalog, so it only reorders the shortlist.

**Metadata filters** (category, max price, in-stock) are passed into **both** SQL functions, so the constraint holds whichever method surfaces a product. Filtering *after* fusion could leave you with far fewer results than requested.

**Graceful degradation.** No `GROQ_API_KEY` → stage 6 falls back to keyword-overlap reasons. `DISABLE_RERANKER=true` → stage 5 is skipped and the fused order is used.

---

## The shopping agent

Implemented in [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) and [`src/lib/chat-tools.ts`](src/lib/chat-tools.ts).

The model **never touches the database**. It can only emit a structured request for one of eight declared tools; the server validates and executes it.

| Tool | Action |
|---|---|
| `search_products` | hybrid search (keyword + semantic) |
| `get_product_details` | specs, rating and price range for one product — lets the agent *compare* candidates |
| `add_to_cart` | insert/update `cart_items` |
| `remove_from_cart` | delete the user's `cart_items` rows for a product |
| `add_to_wishlist` / `save_for_later` | upsert `saved_items` |
| `view_cart` / `view_saved` | read the signed-in user's lists |

### The loop

```
user message
   │
   ▼
Groq (tool_choice: required on step 0)  ──► search_products("watch")
   │                                              │ real DB result
   ▼                                              ▼
Groq reads result  ──────────────────────► add_to_cart(product_id)
   │                                              │
   ▼                                              ▼
direct reply built from the tool result:  "Added Smart Fitness Watch ($149.00) to your cart."
```

### A multi-step example (ReAct)

> *"Get me the best iPhone with good camera quality and add it to my cart"*

```
1. search_products("iphone with good camera quality")  → 5 iPhones found
2. get_product_details(13, 26, 27)                       → camera specs + ratings for the top 3
3. (decide)  iPhone 15 Pro: 48MP Pro camera, 4.8★ — the best of the three
4. add_to_cart(13)                                        → success (or "please log in")
5. reply: explains the choice using only facts from the tool results
```

Four model passes (~6k tokens), so on the free tier expect roughly one such request per minute.

### Safety and reliability properties

| Property | How it's enforced |
|---|---|
| **Grounding guardrail** | Every `$` amount in a model-written reply is checked against prices tools actually returned this turn (search results, cart unit/line/total prices). A mismatch discards the reply and substitutes a deterministic one built from real data. This caught the model fabricating "Sony Wireless Headphones" during development. |
| **Auth boundary** | `user.id` comes from the session cookie, never from the model — it has no parameter that could address another user's cart. |
| **No fake purchases** | "Buy this" adds to the cart and says so. There is no payment processing and the agent never claims one. |
| **Exact write/read replies** | After `add_to_cart` / wishlist / save, and for `view_cart` / `view_saved`, the reply is rendered straight from the tool result — no second model pass to paraphrase (or mis-state) it. Compound requests ("add it and show my cart") still go through the model. |
| **Forced tool use** | The first step requires a tool call (`tool_choice: required`, with a fallback to `auto` if a provider rejects it), so the model can't answer from its own memory. |
| **Bounded loop and output** | `MAX_STEPS = 6`, `max_tokens = 400`. |
| **Visible ReAct trace** | Every reply carries the loop's **Thought → Action → Observation** steps, shown under the message as *How I got this*. Thoughts are dropped if they state a price no tool returned. |
| **Input hygiene** | Only the last 6 `user`/`assistant` turns (600 chars each) are accepted; client-supplied `system`/`tool` messages are dropped. |
| **Per-visitor limit** | `/api/chat` allows 12 requests/min per IP and returns `429` + `Retry-After` beyond that, before any model call is made. |
| **Rate-limit handling** | A Groq 429 with a short `retry-after` is waited out and retried; otherwise the user gets a clear "busy, try again" message. Transient `tool_use_failed` generations are retried up to 3 times. |
| **Observability** | One log line per step with the tool called and token usage: `step 1: tool_calls=add_to_cart tokens(in/out)=1231/28`. |

### Token budget

The free tier is metered **per minute** (8,000 tokens/min for the default model). Every pass re-sends the system prompt, all tool schemas and the history, so the route is built to be frugal: a compact prompt and schemas, a capped history, and skipping the redundant final pass on writes and views. A typical "add X to cart" costs roughly 1.9–2.5k tokens.

### Voice

[`src/components/ChatWidget.tsx`](src/components/ChatWidget.tsx) uses the browser's **Web Speech API** — `SpeechRecognition` for speech-to-text and `SpeechSynthesis` for replies. No dependency and no API key. Replies are spoken **only when the message was spoken**, so typing never makes the page start talking. Supported in Chrome, Edge and Safari; the mic button is hidden where unsupported.

---

## Visual search

[`src/app/visual-search/page.tsx`](src/app/visual-search/page.tsx) → [`/api/image-search`](src/app/api/image-search/route.ts) → [`src/lib/image-embeddings.ts`](src/lib/image-embeddings.ts)

**CLIP** (`clip-vit-base-patch32`) was trained on image–caption pairs to put images and text in **one shared 512-dimension space**. The uploaded photo is embedded and compared against precomputed product-image vectors with the same cosine operator used for text. Products have a separate `image_embedding vector(512)` column and HNSW index — it's a different space from the 384-dim text embeddings and the two must never be compared.

---

## Document extraction

**Document AI** turns an **invoice, a receipt or a product datasheet** (a PDF with a text layer, or a photo/screenshot) into validated JSON — and tells you how much to trust it. Try it at [`/extract`](https://advishopping1.onrender.com/extract) with one-click samples, including an invoice that contains a deliberate error.

> This feature exists to cover the "multimodal agent" requirement via **document extraction (3 document types)**. A voice agent under 800 ms end-to-end is *not* claimed: the voice mode here uses the browser's speech APIs plus a multi-step agent, which is not that fast.

### How it works

```
upload ─► detect real file type from its bytes ─► PDF? read the text layer      ─┐
          (PDF / PNG / JPG / WebP / text)         image? send it to the model   ├─► ONE model call:
                                                  (it is multimodal: no OCR)   ─┘   classify + extract JSON
                                                                                          │
   ┌──────────────────────────────────────────────────────────────────────────────────────┘
   ▼
 validate against a per-type schema (zod) ──fails──► ONE repair retry: feed the exact errors back
   │ passes (and numbers/dates/currency get normalised)
   ▼
 arithmetic cross-checks ──► confidence score + "needs human review" flag
```

| Step | What it does | Why |
|---|---|---|
| **Schema validation** (`doc-schemas.ts`) | Every field must match a typed schema. It also normalises `"$1,234.50"`, European `"1.234,50"`, `"March 5, 2025"` and `€` → `EUR`. | A model's JSON is only a proposal; near-misses shouldn't become failures. |
| **Repair retry** | If validation fails, the exact errors go back to the model **once**. | Cheap self-correction, but bounded: no loops. |
| **Cross-checks** (`doc-checks.ts`) | Line items must sum to the subtotal; subtotal + tax must equal the total; quantity × unit price must equal the line amount. | Documents carry their own redundancy, so many misreadings are detectable **without ground truth**. |
| **Confidence + review flag** | Derived from the checks and whether a repair was needed. | Honest about what it measures: *internal consistency*, not correctness against the paper. |
| **Safety** | File type decided from the actual bytes (not the claimed MIME type), 5 MB cap, per-IP rate limit, nothing stored, and the document is treated as untrusted data (the model has no tools here and is told to ignore instructions inside it). | The endpoint is public and every call costs model quota. |

### Evaluation (measured)

`npm run eval:extract` scores the endpoint against ground truth on a **generated, labelled set of 13 documents** (`eval/docs/`): 4 invoices, 6 receipts (3 clean + 3 deliberately degraded phone photos: shrunk, blurred, rotated, heavily compressed) and 3 datasheets. The set is varied on purpose: US and European number formats, `$ € £`, different date styles, a receipt with no tax line, a datasheet with no price, and one **trap** invoice whose printed total is wrong.

| Document type | Docs | Type accuracy | Field accuracy | Line-item / spec F1 | Fully correct |
|---|---|---|---|---|---|
| Invoice | 4 | 100% | 100% | 1.00 | 4/4 |
| Receipt | 6 | 100% | 100% | 1.00 | 6/6 |
| Datasheet | 3 | 100% | 100% | 1.00 | 3/3 |

- **13/13** documents extracted exactly as labelled; no repair retries were needed.
- **Review flag:** the trap invoice (subtotal 403.25 + tax 32.26 ≠ printed total 453.51) was extracted *faithfully* (the model did not silently "fix" the paper) and **flagged** with the reason; **0 of 12** correct documents were flagged (no false alarms).
- **Cost/latency:** about 0.8 s per document server-side (including PDF parsing) and ~1,240 tokens, measured on a local production build against the Groq free tier.
- Reproduce: `npm run extract:samples` (generates the documents) → start the app → `npm run eval:extract`. Raw results: [`eval/results.json`](eval/results.json).

**What the evaluation taught me** (the run was not perfect the first time):

1. **A provider outage looked like an accuracy failure.** One document "failed" with a generic error because Groq returned HTTP 503 (*model over capacity*) and the code treated that as fatal. Fix: exponential-backoff retries on 5xx, a clear *"temporarily unavailable"* message if it persists, and unit tests for both.
2. **My own prompt caused a real error.** I told the model "numbers without thousands separators", and it applied that to a free-text spec, turning `4,800 mAh` into `4800 mAh`. Fix: the prompt now distinguishes *numeric fields* from *text copied exactly as written*. (I fixed the prompt, not the scorer.)
3. **Zero errors means the review flag was untested**, so I added the trap invoice to exercise it for real.

**Honest limits:** the set is small and **synthetic**, and I adjusted the prompt after seeing the first run on this same set, so treat 13/13 as "the method works and its failure modes are understood", not as accuracy on arbitrary real-world paperwork. Scanned PDFs (no text layer) are rejected with a message to upload a photo instead; multi-page documents are capped at 10 pages; the checks catch numbers that disagree with each other, not a value that is wrong but self-consistent.

## Evaluation

`npm run evaluate` scores **20 labeled queries** across four methods, with precision@k, recall@k and NDCG@k:

```
method                 P@5     R@5    NDCG@5
keyword              18.0%   57.5%    58.1%
semantic             33.0%   97.8%    99.3%
hybrid               33.0%   97.8%    99.3%
hybrid+rerank        33.0%   97.8%    99.6%
```

**Reading this honestly.** Keyword-only is clearly weak (58% NDCG — it returns nothing for meaning-based queries). But on a ~32-product catalog with clean queries, semantic search alone already saturates the benchmark, so hybrid and reranking show little measurable gain. The large wins those techniques are known for need larger, noisier corpora. Having the harness is what makes that statement provable rather than a guess — and it justified `DISABLE_RERANKER=true` on the small production host (+0.3% NDCG isn't worth ~80 MB).

---

## Accounts & demo login

Authentication is **Supabase Auth** (email + password).

- **Sign up / Sign in** — one card on `/login`, toggled by a link (also reachable from the navbar *Sign up* link, `/login?mode=signup`).
- **Try the demo** — a one-click shared account so visitors can use the cart and agent without registering. It only appears when `NEXT_PUBLIC_DEMO_EMAIL` and `NEXT_PUBLIC_DEMO_PASSWORD` are set. Each demo session starts from an empty cart/wishlist.
- **Forgot password** — *Forgot password?* on the sign-in card (or `/login?mode=reset`) emails a one-time link to `/reset-password`, where the user chooses a new password. The response is identical whether or not the address has an account, so the form can't be used to discover who is registered. The link works once, lasts about an hour, and must be opened in the **same browser** that requested it; otherwise the page says so and offers a new link.
- **Email confirmation** — if *Confirm email* is on in Supabase, new users must click the emailed link (handled by `/callback`). The login page detects *"Email not confirmed"* and offers **Resend confirmation email**.

For a frictionless public demo, turn off **Confirm email** (Supabase → Authentication → Sign In / Providers → Email). If you keep it on, add your site URL and `…/callback` to **Authentication → URL Configuration**. Password-reset links also need **`…/reset-password`** in that list.

Create the demo user once:

```bash
node scripts/create-demo-user.mjs
```

> The demo credentials are `NEXT_PUBLIC_*` on purpose — they're shown to visitors. Use a throwaway password, never a real one.

---

## Mobile & laptop support

Responsive layouts for phones through wide laptops (tested at a 375 px phone width and at laptop width).

- **Navigation** collapses to a hamburger menu below 1024 px (Visual Search included); search moves to its own full-width row on phones.
- **Chat widget** sizes itself to the viewport (`min(32rem, 100dvh − 7rem)`) and stays pinned bottom-right.
- **Inputs are 16 px on phones** so iOS Safari doesn't zoom the page on focus.
- Product grids go 2 → 3 → 4 columns; the product page stacks image over details on small screens.
- A scrolling (not `fixed`) background gradient on small screens, which iOS handles poorly.

Checked in a 375 × 812 viewport: no horizontal overflow on Home, Search, Product, Category, Cart, Login or Visual Search.

---

## Architecture

```
Browser ──▶ Next.js 15 (Server Components + Route Handlers)
                │
   ┌────────────┼──────────────────┬─────────────────────┬────────────────────┬────────────┐
   ▼            ▼                  ▼                     ▼                    ▼            ▼
 /search     /api/chat       /api/image-search      /api/extract          /cart · /login  /extract
   │            │                  │                     │                              (UI)
 search-      agent loop        CLIP embed        doc-extract.ts
 pipeline.ts  (chat-tools.ts)  (image-embeddings.ts)  validate → repair → cross-check
   │            │                  │                     │
   └────────────┴──── Supabase (Postgres + pgvector + Auth, RLS) ──┘   (/api/extract never touches the DB)
                         │
                      Groq API  (stage-6 summary · agent · document extraction)

Text/image models run in-process via Transformers.js (no external API):
  gte-small · ms-marco-MiniLM-L-6-v2 · clip-vit-base-patch32
Document AI: PDF text layers are read with unpdf; photos go straight to the multimodal Groq model (no OCR).
```

- **Server Components** fetch and rank on the server; only interactive pieces (navbar, cart, chat, product variant picker) are client components.
- **Models load lazily** and are cached for the life of the process; `instrumentation.ts` preloads the text embedding model at server start so the first visitor doesn't pay the full load.
- **Cart state** lives in a React context backed by Supabase; `addToCart` returns a status (`added` / `login_required` / `error`) so the UI never claims a success that didn't happen.

---

## Data model

| Table | Purpose |
|---|---|
| `category` | Electronics, Dress, Books, Accessories |
| `products` | name, description, stock, rating, discount, `fts tsvector` (generated), `embedding vector(384)`, `image_embedding vector(512)` |
| `product_variants` | color / size / price / stock / image per product |
| `product_spec` | key–value specifications |
| `cart_items` | per-user cart lines (RLS: own rows only) |
| `saved_items` | per-user wishlist and save-for-later (`kind` column; RLS: own rows only) |

SQL functions: `keyword_search(...)`, `semantic_search(...)`, `image_search(...)`.

---

## Project structure

```
src/
  app/
    page.tsx                  home: hero, example queries, catalog
    search/                   search results + pipeline panel (+ loading.tsx)
    product/[id]/             product detail (static params, styled not-found page)
    category/[categoryName]/  category listing
    visual-search/            image upload UI
    extract/                  Document AI: upload, samples, results
    cart/  (auth)/login/      cart, sign in / sign up / demo
    (auth)/callback/          email-confirmation code exchange
    api/chat/                 agent loop + guardrails
    api/image-search/         CLIP similarity endpoint
    api/health/               uptime/health check (503 when the DB is down) + feature flags
    reset-password/  privacy/  password reset landing page · plain-language privacy page
    api/extract/              document extraction endpoint (PDF / image / text)
    api/revalidate/           webhook-triggered cache revalidation
    opengraph-image.tsx icon.tsx not-found.tsx error.tsx
  components/                 Navbar, ChatWidget, ProductCard, ProductDetails, skeletons
  context/CartContext.tsx     cart state + actions
  lib/
    search-pipeline.ts        the 6 stages
    embeddings.ts             text embeddings (gte-small)
    reranker.ts               cross-encoder
    llm.ts                    stage-6 summary (Groq)
    chat-tools.ts             tool schemas + executeTool (only DB writer)
    image-embeddings.ts       CLIP
    doc-extract.ts            document extraction: classify + extract + validate + repair
    doc-schemas.ts            per-type schemas that also normalise numbers/dates/currency
    doc-checks.ts             arithmetic cross-checks + confidence score (pure, unit-tested)
    pdf-text.ts               PDF text-layer reader
  instrumentation.ts          model preload at startup
supabase/                     schema.sql · pipeline.sql · wishlist.sql · image-search.sql
scripts/                      embeddings, evaluation, seeding, demo user
```

---

## Run locally

**1. Install**
```bash
npm install
```

**2. Database** — create a Supabase project, then run these in the SQL Editor **in order**:

| File | Creates |
|---|---|
| `supabase/schema.sql` | tables, GIN + HNSW indexes, RLS policies, seed data |
| `supabase/pipeline.sql` | `keyword_search` / `semantic_search` with filters |
| `supabase/wishlist.sql` | `saved_items` (needed by the agent's wishlist tools) |
| `supabase/image-search.sql` | `image_embedding` column + `image_search` (optional) |

**3. Environment** — copy [`.env.example`](.env.example) to `.env.local` and fill it in (see [below](#environment-variables)).

**4. Embeddings**
```bash
npm run embeddings          # text embeddings for all products
npm run image-embeddings    # CLIP image embeddings (optional)
```
The first run downloads the models (~30 MB for text, ~150 MB for CLIP) once.

**5. Run**
```bash
npm run dev                 # http://localhost:3000
```

**6. (Optional) Demo account**
```bash
node scripts/create-demo-user.mjs
```

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public key used by the browser and server (RLS applies) |
| `SUPABASE_SERVICE_KEY` | ✅ | Service-role key — **server/scripts only**, never exposed to the browser |
| `GROQ_API_KEY` | for LLM features | Enables the agent and the stage-6 summary |
| `GROQ_MODEL` | optional | Override the default `qwen/qwen3.8-27b` |
| `REVALIDATION_TOKEN` | optional | Secret for the `/api/revalidate` webhook |
| `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` | optional | Shows the **Try the demo** button |
| `NEXT_PUBLIC_SITE_URL` | optional | Absolute URL for share-card links (Render sets `RENDER_EXTERNAL_URL` automatically) |
| `DISABLE_RERANKER` | optional | `true` skips stage 5 (saves ~80 MB RAM) |
| `DISABLE_VISUAL_SEARCH` | optional | `true` makes `/api/image-search` return 503 (saves ~150 MB) |
| `DISABLE_CSP` | optional, **build time** | `true` omits the `Content-Security-Policy` header — a diagnostic escape hatch only; leave unset in production |

`NEXT_PUBLIC_*` values are baked in **at build time** — change one and you must rebuild/redeploy.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server (Turbopack) |
| `npm run build` / `npm start` | production build / serve |
| `npm run lint` | ESLint |
| `npm run embeddings` | embed products that lack a text embedding |
| `npm run image-embeddings` | CLIP-embed product images |
| `npm run evaluate` | precision / recall / NDCG across the 4 methods |
| `npm test` | unit tests (Vitest) for extraction logic and the rate limiter |
| `npm run extract:samples` | regenerate the labelled document set in `eval/docs/` and the UI samples |
| `npm run eval:extract` | score document extraction against ground truth (needs the app running) |
| `node scripts/create-demo-user.mjs` | create or reset the shared demo user |
| `node scripts/add-products.mjs` | seed extra products |
| `node scripts/add-phones.mjs` | seed phone models with variants |
| `node scripts/download-images.mjs` | fetch product images locally |
| `node scripts/enrich-descriptions.mjs` | rewrite descriptions function-first, then re-embed |

---

## Testing & CI

**Unit tests** — `npm test` runs 72 [Vitest](https://vitest.dev) tests across seven files, in about half a second and with no network or API key:

| File | Covers |
|---|---|
| `doc-schemas.test.ts` | normalisation of `"$1,234.50"`, European `"1.234,50"`, `"March 5, 2025"`, currency symbols; schema accept/reject cases |
| `doc-checks.test.ts` | the arithmetic cross-checks (items vs subtotal, subtotal + tax vs total, qty × unit) and the confidence/review scoring |
| `doc-extract.test.ts` | the extraction engine with the **model mocked**: clean answer, the one-shot repair retry, giving up after one repair, non-JSON replies, non-documents, `<think>`/code-fence stripping, and **503 backoff** (recovers, or fails with a clear error) |
| `file-sniff.test.ts` | content-based file-type detection: PDF/PNG/JPEG/WebP signatures, and that an SVG or HEIF disguised as an image is **not** accepted |
| `chat-tools.test.ts` | the agent's **database writes** with a fake client: add/update/remove cart rows, wishlist upsert (`ignoreDuplicates`), login guards, "never claim success on a failed write", and that the **user comes from the session, never from model-supplied arguments** |
| `api/health/route.test.ts` | `/api/health` returns 200/503 correctly (including when the database host doesn't resolve), reports feature flags, leaks no secrets, and is rate limited |
| `rate-limit.test.ts` | per-key budgets, window reset, client-IP detection, the 429 response |

Not covered by unit tests: the search pipeline's fusion maths and the agent's grounding check (both live inside files that can't export helpers yet) and any browser-level flow. Retrieval quality is measured separately by `npm run evaluate`, and document extraction by `npm run eval:extract`.

**CI** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs typecheck (`tsc`), lint and the unit tests on every push and pull request. It deliberately does not run `next build`: the build pre-renders product pages from Supabase and needs real credentials, which the deploy platform has and CI doesn't.

**Keep-alive & smoke test** — [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) visits the live site once a day. Two reasons:

1. **Supabase's free tier pauses a project after about a week without activity.** A paused project's hostname stops resolving, and the site then shows an empty catalog. This has already happened to this project. Rendering the home page queries Supabase, so a daily visit counts as activity.
2. **It is a smoke test.** The page returns HTTP 200 even when the database is down (it shows an error message instead of products), so the job checks that real product links are present and **fails if they aren't**, which makes GitHub email the repository owner.

Scheduled workflows stop after 60 days without repository activity; re-enable it from the Actions tab if that happens.

## Deployment

The app loads ML models into the Node process, so it needs a **persistent host** (Render, Railway, Fly) rather than short-lived serverless functions — a cold model load takes 15–40 s, which exceeds typical serverless limits (e.g. Vercel Hobby's 10 s).

**Render**

| Setting | Value |
|---|---|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Root directory | *(blank)* |
| Environment | set **all** variables *before* the first build — product pages use `generateStaticParams`, so the build itself queries Supabase |

Then add the deployed URL (and `…/callback`) to **Supabase → Authentication → URL Configuration**.

**Memory-constrained hosts (≈512 MB free tier).** Set `DISABLE_RERANKER=true` and, if needed, `DISABLE_VISUAL_SEARCH=true`. Models load lazily, so a skipped feature's model is never loaded at all. Text search, filters and the agent keep working.

**Cold starts.** Free tiers sleep when idle, so the first visit can take up to a minute. The search loading screen says so, and the embedding model is preloaded at startup to shorten it.

---

**Keep it warm and get alerted (free).** A free Render instance sleeps after ~15 minutes idle, so the first visit afterwards can take about a minute. Point a free uptime monitor (e.g. [UptimeRobot](https://uptimerobot.com), 5-minute interval) at **`/api/health`**. It both keeps the instance awake and alerts you when something breaks, because that endpoint returns **HTTP 503 when the database is unreachable** (an ordinary page returns 200 even with an empty catalog). The JSON also states which features are switched on in this deployment:

```json
{ "status": "ok", "db": "ok",
  "features": { "llm": true, "reranker": false, "visualSearch": false, "documentAI": true },
  "latencyMs": 364, "uptimeSeconds": 12 }
```

It returns booleans only (no keys, URLs or versions) and is rate limited per IP.

**Free-tier gotcha: Supabase pauses idle projects.** After about a week without activity the project is paused and its hostname stops resolving (`nslookup <project>.supabase.co` returns *non-existent domain*); the site then shows *"We couldn't load the catalog"*. Fix: Supabase dashboard → the project → **Restore**. Prevent it with the daily keep-alive workflow (see Testing & CI). Document extraction does not use the database, so it keeps working during an outage.

---

## Security notes

- **Row-level security** on `cart_items` and `saved_items`: users can only read and write their own rows.
- The **service-role key** is used only server-side and in local scripts.
- The agent's **auth boundary** is the session cookie; the model can't name a user.
- **Secrets stay out of git** — `.env*` is ignored. Rotate any key that has been pasted into a chat or log.
- Demo credentials are public by design; the shared account holds nothing sensitive and is reset each session.
- **Rate limiting** — `/api/chat` (12 requests/min) and `/api/image-search` (10 requests/min) are limited per client IP and return `429` with a `Retry-After` header, so a script can't drain the Groq quota or the host's CPU.
- **Document uploads** — `/api/extract` rate-limits per IP (6/min), caps files at 5 MB, and checks the file's **actual leading bytes** (a renamed `.exe` is rejected, whatever MIME type it claims). Files are processed in memory and never stored. Document text is treated as untrusted: the prompt says to ignore instructions inside it, the model has no tools there, and its output must pass a strict schema before anything is shown.
- **Upload validation** — image search accepts only JPG/PNG/WebP up to 5 MB. The type is decided from the file's **actual bytes** (shared `file-sniff.ts`), not the client-declared MIME type: the image decoder (`sharp`/libvips) goes by content, so an SVG or HEIF labelled `image/png` would otherwise reach it. Oversized requests are rejected from `Content-Length` *before* the body is buffered and re-checked after parsing; the same rules run client-side for a faster message.
- **Privacy** — [`/privacy`](/privacy) states plainly what the demo stores and which third parties (Render, Supabase, Groq) see data; it is written from what the code actually does and should be kept in sync with it.
- **Dependency security** — `npm audit --omit=dev` reports **0 critical**. `next` is kept on a patched 15.5.x. `@xenova/transformers` v2 (the model runtime) pins old copies of `sharp` and `protobufjs`; `package.json` `overrides` force the patched `sharp` 0.35.5 and `protobufjs` 7.6.x — **do not remove them** without re-running `npm audit` and the visual-search test. One advisory remains (a `postcss` copy pinned *inside* Next.js, used only for build-time CSS; no user input reaches it); it clears when Next updates its pin.
- **Security headers** — `Content-Security-Policy` (restricts script/connection/frame/form targets; `frame-ancestors 'none'`, `object-src 'none'`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (microphone for voice only), and HSTS.
- **No internal data leakage** — list and detail pages select explicit columns, so embedding vectors (~6 KB each) never reach the browser. This also cut the home page from ~488 KB to ~115 KB.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Chat says *"assistant is busy (free-tier rate limit)"* | Groq's per-minute token limit | Wait a few seconds; consider a paid tier or a different `GROQ_MODEL` |
| *"You're sending requests too quickly"* | The app's own per-IP limit (chat 12/min, image search 10/min) | Wait for the `Retry-After` interval |
| Image search says *"Unsupported file type"* / *"too large"* | Upload validation | Use a JPG, PNG or WebP under 5 MB |
| Home page says *"We couldn't load the catalog"*, no products | Supabase project paused (its hostname no longer resolves) | Dashboard → **Restore project**; the keep-alive workflow prevents a repeat |
| Document AI says *"AI model is temporarily unavailable"* | The model provider returned a 5xx (overloaded). The app already retried with backoff. | Wait a minute and retry |
| Document AI says the PDF *"has no readable text"* | A scanned PDF (no text layer) | Upload a photo or screenshot of it as PNG/JPG instead |
| `Chat agent request failed`, logs show `model_not_found` | Groq retired the model | Set `GROQ_MODEL` to a current model — no code change |
| Wishlist / save-for-later fail | `saved_items` table missing | Run `supabase/wishlist.sql` |
| **Email not confirmed** on sign-in | Supabase *Confirm email* is on | Click the emailed link / use **Resend**, or turn off *Confirm email* |
| Confirmation link lands on an error | URL not allow-listed | Add the site URL and `/callback` to Supabase URL Configuration |
| Password-reset email link says it is *invalid* | Expired, already used, opened in a different browser, or `/reset-password` not allow-listed | Request a new link and open it in the same browser; add `…/reset-password` to Supabase Redirect URLs |
| **Try the demo** button missing | Demo env vars not set at build time | Set both `NEXT_PUBLIC_DEMO_*` and rebuild |
| "Invalid login credentials" on demo | Demo user not created | `node scripts/create-demo-user.mjs` |
| First search takes a long time | Embedding model loading | Normal after idle; later searches are fast |
| Natural-language query returns nothing | Descriptions state specs, not function | Describe what the product *does* (see Gotchas) |
| Product images don't load | Files missing from `public/products` | `node scripts/download-images.mjs` |

### Gotchas worth knowing

- **Descriptions must state function, not just specs.** *"device to call someone"* returned nothing until descriptions said phones are *"for making phone calls"* — both the embeddings and the reranker read that text.
- **Query and product embeddings must come from the same model**, or the vectors aren't comparable.
- **`next build`, not `--turbopack`, for production**: Turbopack tolerated a Next.js 15 error (`params` / `searchParams` are Promises and must be awaited) that the standard build correctly rejects.
- **Semantic search never returns "no results"** — it always returns the nearest N. Judge relevance with the reranker's score, not by emptiness.

---

## Known limitations

- **The model runtime is a legacy major version.** `@xenova/transformers` v2 is unmaintained; its successor is `@huggingface/transformers` v3. Security issues in its dependencies are handled with `overrides` (see Security notes), but a migration is the proper long-term fix.
Stated plainly, because they matter:

- **Small catalog (~32 products).** Hybrid and rerank gains are hard to show at this scale; the evaluation says so.
- **No real checkout.** The button explains that payments aren't implemented; "buy" adds to the cart.
- **Shared demo account** — two visitors using it at the same moment see the same cart.
- **Free-tier LLM limits** — a handful of agent messages per minute for the whole deployment.
- **Rate limiting is in-memory.** It's per server instance, resets on restart, and keys on proxy-supplied client IPs (which can be spoofed). Fine for a single-instance demo; a multi-instance deployment needs a shared store such as Redis.
- **The CSP still allows `'unsafe-inline'` scripts/styles**, because Next.js emits inline bootstrap scripts. A nonce-based policy would remove that.
- **The search and chat endpoints are public** (no login required); they are protected by per-IP rate limits and upload validation, not by authentication.
- **Tests cover the pure logic only** (extraction schemas/checks, rate limiter). There are no end-to-end browser tests, and CI runs typecheck, lint and unit tests but not `next build` (which needs Supabase credentials).
- **Document AI reads text PDFs and images, not scanned PDFs**, and the evaluation set is small and synthetic (9 documents); it shows the method works, not how it behaves on arbitrary real-world paperwork.

---

## Roadmap

- Shared rate-limit store (Redis/Upstash) and a nonce-based CSP without `'unsafe-inline'`
- CAPTCHA/bot protection on sign-up and self-service account deletion
- End-to-end tests (Playwright) for the main flows, and unit tests for the search pipeline's fusion logic and the agent's grounding check (move them out of the route file first)
- Quantity-change tool for the agent, and orders/order history (without payments)
- Larger, noisier catalog to make the retrieval ablation more informative
- Query preprocessing (spelling correction, expansion) and chunking for long descriptions
- Real checkout with a payment provider's test mode

---

## License

No license has been chosen yet — all rights reserved by default. Add a `LICENSE` file if you want others to be able to reuse the code.
