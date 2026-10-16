# AdviShopping — AI Search & Shopping Agent

A full-stack e-commerce demo built around three AI capabilities that go well beyond a typical CRUD shop:

1. **Hybrid search** — a 6-stage retrieval pipeline (keyword + semantic → fusion → cross-encoder rerank → LLM), with hard metadata filters and a reproducible evaluation harness.
2. **Conversational shopping agent** — an LLM that *takes real actions* through tool calling (search, add to cart, wishlist, view cart), guarded by a code-level grounding check so it can't invent products or prices. Supports voice in and out.
3. **Visual search** — upload a photo and find visually similar products with CLIP image embeddings.

> **Live demo:** _add your deployed URL here_
> Browsing and search are public. Use **Try the demo** (or sign up) to use the cart and the agent.

Built with **Next.js 15 · TypeScript · Tailwind v4 · Supabase (Postgres + pgvector + Auth) · Transformers.js · Groq**.

---

## Contents

- [What it does](#what-it-does)
- [How the search pipeline works](#how-the-search-pipeline-works)
- [The shopping agent](#the-shopping-agent)
- [Visual search](#visual-search)
- [Evaluation](#evaluation)
- [Accounts & demo login](#accounts--demo-login)
- [Mobile & laptop support](#mobile--laptop-support)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
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

The model **never touches the database**. It can only emit a structured request for one of six declared tools; the server validates and executes it.

| Tool | Action |
|---|---|
| `search_products` | hybrid search (keyword + semantic) |
| `add_to_cart` | insert/update `cart_items` |
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

### Safety and reliability properties

| Property | How it's enforced |
|---|---|
| **Grounding guardrail** | Every `$` amount in a model-written reply is checked against prices tools actually returned this turn (search results, cart unit/line/total prices). A mismatch discards the reply and substitutes a deterministic one built from real data. This caught the model fabricating "Sony Wireless Headphones" during development. |
| **Auth boundary** | `user.id` comes from the session cookie, never from the model — it has no parameter that could address another user's cart. |
| **No fake purchases** | "Buy this" adds to the cart and says so. There is no payment processing and the agent never claims one. |
| **Exact write/read replies** | After `add_to_cart` / wishlist / save, and for `view_cart` / `view_saved`, the reply is rendered straight from the tool result — no second model pass to paraphrase (or mis-state) it. Compound requests ("add it and show my cart") still go through the model. |
| **Forced tool use** | The first step requires a tool call (`tool_choice: required`, with a fallback to `auto` if a provider rejects it), so the model can't answer from its own memory. |
| **Bounded loop and output** | `MAX_STEPS = 5`, `max_tokens = 400`. |
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
- **Email confirmation** — if *Confirm email* is on in Supabase, new users must click the emailed link (handled by `/callback`). The login page detects *"Email not confirmed"* and offers **Resend confirmation email**.

For a frictionless public demo, turn off **Confirm email** (Supabase → Authentication → Sign In / Providers → Email). If you keep it on, add your site URL and `…/callback` to **Authentication → URL Configuration**.

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
   ┌────────────┼──────────────────────┬─────────────────────┐
   ▼            ▼                      ▼                     ▼
 /search     /api/chat          /api/image-search       /cart · /login
   │            │                      │
 search-      agent loop            CLIP embed
 pipeline.ts  (chat-tools.ts)    (image-embeddings.ts)
   │            │                      │
   └────────────┴──── Supabase (Postgres + pgvector + Auth, RLS) ───┘
                         │
                      Groq API  (stage 6 summary + agent)

ML models run in-process via Transformers.js (no external API):
  gte-small · ms-marco-MiniLM-L-6-v2 · clip-vit-base-patch32
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
    product/[id]/             product detail (static params, real 404s)
    category/[categoryName]/  category listing
    visual-search/            image upload UI
    cart/  (auth)/login/      cart, sign in / sign up / demo
    (auth)/callback/          email-confirmation code exchange
    api/chat/                 agent loop + guardrails
    api/image-search/         CLIP similarity endpoint
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

**3. Environment** — create `.env.local` (see [below](#environment-variables)).

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
| `node scripts/create-demo-user.mjs` | create or reset the shared demo user |
| `node scripts/add-products.mjs` | seed extra products |
| `node scripts/add-phones.mjs` | seed phone models with variants |
| `node scripts/download-images.mjs` | fetch product images locally |
| `node scripts/enrich-descriptions.mjs` | rewrite descriptions function-first, then re-embed |

---

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

## Security notes

- **Row-level security** on `cart_items` and `saved_items`: users can only read and write their own rows.
- The **service-role key** is used only server-side and in local scripts.
- The agent's **auth boundary** is the session cookie; the model can't name a user.
- **Secrets stay out of git** — `.env*` is ignored. Rotate any key that has been pasted into a chat or log.
- Demo credentials are public by design; the shared account holds nothing sensitive and is reset each session.
- **Rate limiting** — `/api/chat` (12 requests/min) and `/api/image-search` (10 requests/min) are limited per client IP and return `429` with a `Retry-After` header, so a script can't drain the Groq quota or the host's CPU.
- **Upload validation** — image search accepts only JPG/PNG/WebP up to 5 MB; oversized requests are rejected from `Content-Length` *before* the body is buffered, and re-checked after parsing. The same rules run client-side for a faster message.
- **Security headers** — `Content-Security-Policy` (restricts script/connection/frame/form targets; `frame-ancestors 'none'`, `object-src 'none'`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (microphone for voice only), and HSTS.
- **No internal data leakage** — list and detail pages select explicit columns, so embedding vectors (~6 KB each) never reach the browser. This also cut the home page from ~488 KB to ~115 KB.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Chat says *"assistant is busy (free-tier rate limit)"* | Groq's per-minute token limit | Wait a few seconds; consider a paid tier or a different `GROQ_MODEL` |
| *"You're sending requests too quickly"* | The app's own per-IP limit (chat 12/min, image search 10/min) | Wait for the `Retry-After` interval |
| Image search says *"Unsupported file type"* / *"too large"* | Upload validation | Use a JPG, PNG or WebP under 5 MB |
| `Chat agent request failed`, logs show `model_not_found` | Groq retired the model | Set `GROQ_MODEL` to a current model — no code change |
| Wishlist / save-for-later fail | `saved_items` table missing | Run `supabase/wishlist.sql` |
| **Email not confirmed** on sign-in | Supabase *Confirm email* is on | Click the emailed link / use **Resend**, or turn off *Confirm email* |
| Confirmation link lands on an error | URL not allow-listed | Add the site URL and `/callback` to Supabase URL Configuration |
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

Stated plainly, because they matter:

- **Small catalog (~32 products).** Hybrid and rerank gains are hard to show at this scale; the evaluation says so.
- **No real checkout.** The button explains that payments aren't implemented; "buy" adds to the cart.
- **No `remove_from_cart` tool** in the agent yet (the cart page can remove items).
- **Shared demo account** — two visitors using it at the same moment see the same cart.
- **Free-tier LLM limits** — a handful of agent messages per minute for the whole deployment.
- **Rate limiting is in-memory.** It's per server instance, resets on restart, and keys on proxy-supplied client IPs (which can be spoofed). Fine for a single-instance demo; a multi-instance deployment needs a shared store such as Redis.
- **The CSP still allows `'unsafe-inline'` scripts/styles**, because Next.js emits inline bootstrap scripts. A nonce-based policy would remove that.
- **The search and chat endpoints are public** (no login required); they are protected by per-IP rate limits and upload validation, not by authentication.
- **No automated tests or CI yet.** Logic was verified manually and with the evaluation harness.

---

## Roadmap

- Shared rate-limit store (Redis/Upstash) and a nonce-based CSP without `'unsafe-inline'`
- "Forgot password" flow and CAPTCHA/bot protection on sign-up
- Unit tests for the pure logic (RRF fusion, grounding check, price parsing) and a CI workflow
- `remove_from_cart` and quantity-change tools for the agent
- Larger, noisier catalog to make the retrieval ablation more informative
- Query preprocessing (spelling correction, expansion) and chunking for long descriptions
- Real checkout with a payment provider's test mode

---

## License

No license has been chosen yet — all rights reserved by default. Add a `LICENSE` file if you want others to be able to reuse the code.
