# AGENTS.md — AdviShopping handoff & project context

Read this first. It is written so a coding agent (or a person) can pick the project up cold and continue
without re-asking the owner for context. Last updated: **2026-10-16**.

For the public-facing description see [README.md](README.md). This file is the *working* knowledge:
how it fits together, what must not be broken, what is unfinished, and how the owner likes to work.

---

## 1. What this project is

**AdviShopping** — an AI-heavy e-commerce demo, built as a **portfolio piece to be shared on LinkedIn**.
Its purpose is to demonstrate applied AI engineering, not to be a production store. Three capabilities:

1. **Hybrid search** — 6-stage retrieval pipeline (keyword + semantic → RRF fusion → cross-encoder rerank → LLM summary) with metadata filters and an evaluation harness.
2. **Shopping agent** — chat widget where an LLM performs real actions via tool calling (search, add to cart, wishlist, save for later, view cart/saved), guarded by a code-level grounding check. Voice in/out.
3. **Visual search** — CLIP image embeddings, upload a photo → similar products.

Quality bar: it should look professional on a phone and a laptop, work for a stranger clicking a link, and be
honest about its limits (the README has a "Known limitations" section — keep it truthful).

---

## 2. Current status (snapshot)

- Branch `main`, remote `https://github.com/Varshini0511/AdviShopping1.git`.
- Everything is committed and **pushed**; `main` matches `origin/main` (verify with `git status -sb`).
- **Live:** https://advishopping1.onrender.com (Render free tier, deployed from `main`). Verified live: security
  headers present, home page ~115 KB with 0 embedding strings, search works (~6 s first request), chat agent
  answers browse queries and returns the login message for logged-out writes, OG image served.
- **Not live yet:** the **Try the demo** button — `NEXT_PUBLIC_DEMO_EMAIL/PASSWORD` are not set on Render
  (they are build-time, so set them and clear-cache redeploy). The demo user also still has to be created.
- **Done & working:** hybrid search, filters, agent (+voice), visual search, evaluation, sign-up / sign-in /
  demo login, mobile + laptop layouts, OG share card + favicon, error/404 pages, rate limiting, upload
  validation, security headers.
- **A local server may be running on port 3100** (started with `npm run start -- -p 3100`). Check before
  starting another; see §4 for how to stop it.

### Outstanding (owner/ops items)

| Item | Detail |
|---|---|
| Create the demo user | `node scripts/create-demo-user.mjs` (needs `NEXT_PUBLIC_DEMO_EMAIL/PASSWORD` in `.env.local`). Not yet run. Demo email is `demo@advishopping.app`; password is in `.env.local` only. |
| Rebuild after env change | `NEXT_PUBLIC_*` values are baked at build time. |
| Render env vars | Add `NEXT_PUBLIC_DEMO_EMAIL`, `NEXT_PUBLIC_DEMO_PASSWORD` (and `DISABLE_RERANKER=true` on the 512 MB tier), then **Manual Deploy → Clear build cache & deploy**. |
| Supabase URL config | Add site URL and `<site>/callback` under Authentication → URL Configuration. |
| Email confirmation | Currently **ON** in Supabase (`email_autoconfirm:false`). For a frictionless demo, turn off "Confirm email". |
| Rotate the Groq key | It was pasted into chat in plaintext. Rotate at console.groq.com, update `.env.local` and Render. |
| README live-demo URL + GIF | Placeholder line near the top; no screenshots/GIF yet. |
| LinkedIn | Run the URL through LinkedIn Post Inspector after deploy (it caches previews). |

---

## 3. Tech stack (verified versions)

- **Next.js ^15.5** (App Router) · **React 19.1** · **TypeScript ^5** · **Tailwind CSS v4** (`@import "tailwindcss"`, no `tailwind.config`)
- **Supabase**: Postgres + `pgvector` + Auth (email/password) + RLS. Client libs: `@supabase/supabase-js ^2.57`, `@supabase/auth-helpers-nextjs ^0.10` (cookie sessions, PKCE).
- **Transformers.js** (`@xenova/transformers ^2.17`, runs in the Node process, no API):
  - `Supabase/gte-small` — text embeddings, 384-dim
  - `Xenova/ms-marco-MiniLM-L-6-v2` — cross-encoder reranker
  - `Xenova/clip-vit-base-patch32` — image embeddings, 512-dim
- **Groq** (OpenAI-compatible API) for the LLM. Default model `qwen/qwen3.8-27b` (override `GROQ_MODEL`).
- Node 22, npm 10. Path alias `@/*` → `src/*`. Icons: `react-icons`.
- Windows 11 dev machine. Shell tools may be Git Bash or PowerShell — commands below are bash unless noted.

---

## 4. Commands

| Command | Notes |
|---|---|
| `npm run dev` | Dev server, Turbopack, port 3000 |
| `npm run build` | Production build. **Use `next build` (no `--turbopack`)** — Turbopack tolerated errors the real build rejects. Build queries Supabase (`generateStaticParams`), so `.env.local` must be valid. |
| `npm run start -- -p 3100` | Serve the production build on 3100 |
| `npx tsc --noEmit` | Typecheck (should be clean) |
| `npm run lint` | ESLint (one known pre-existing warning in `CartContext.tsx`) |
| `npm run embeddings` | Embed products missing a text embedding |
| `npm run image-embeddings` | CLIP-embed product images |
| `npm run evaluate` | P@k / R@k / NDCG@k over 4 methods |
| `node scripts/create-demo-user.mjs` | Create/reset the shared demo user |

Stop a server on a port (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3100 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Rebuilding while a server is running from the same `.next` can fail on Windows — stop it first.

---

## 5. Architecture map

```
src/
  app/
    layout.tsx                 metadata, security-relevant shell, footer, ChatWidget
    page.tsx                   home: hero, example-query chips, capability cards, catalog
    search/page.tsx            runs the pipeline server-side; renders results + stage panel
    product/[id]/page.tsx      detail page (generateStaticParams, notFound, generateMetadata)
    category/[categoryName]/   category listing
    visual-search/page.tsx     upload UI (client)
    cart/page.tsx              cart (client, from CartContext)
    (auth)/login/page.tsx      sign in / sign up / demo / resend confirmation
    (auth)/callback/route.ts   email-confirmation landing (code exchange + error routing)
    api/chat/route.ts          THE AGENT LOOP + guardrails (see §7)
    api/image-search/route.ts  CLIP similarity endpoint (validation + rate limit)
    api/revalidate/route.ts    webhook-protected cache revalidation (REVALIDATION_TOKEN)
    opengraph-image.tsx icon.tsx not-found.tsx error.tsx
  components/                  Navbar (mobile menu), ChatWidget (+voice), ProductCard, ProductDetails
  context/CartContext.tsx      client cart state; addToCart returns 'added'|'login_required'|'error'
  lib/
    search-pipeline.ts         the 6 stages + weights/constants
    embeddings.ts              gte-small query embeddings (lazy singleton)
    reranker.ts                cross-encoder (lazy singleton)
    llm.ts                     stage-6 JSON summary via Groq
    chat-tools.ts              TOOLS schemas + executeTool (ONLY place the agent writes the DB)
    image-embeddings.ts        CLIP
    rate-limit.ts              in-memory per-IP limiter
  instrumentation.ts           preloads the text embedding model at server start
supabase/                      schema.sql → pipeline.sql → wishlist.sql → image-search.sql
scripts/                       embeddings, evaluate, seed/enrich catalog, create-demo-user
public/products/               local product images (.webp); public/placeholder.svg fallback
```

---

## 6. Search pipeline (`src/lib/search-pipeline.ts`)

| Stage | Detail |
|---|---|
| 1 keyword | RPC `keyword_search`: `websearch_to_tsquery` (terms are **ANDed**), `ts_rank_cd`, top 20 |
| 2 semantic | RPC `semantic_search`: cosine `<=>` on `embedding vector(384)`, top 20, **no threshold** (always returns N) |
| 3 merge | Map by product id; `kwRank`/`semRank`, `Infinity` = missed |
| 4 sort | Weighted RRF: `weight / (RRF_K + rank)`, `RRF_K=60`, both weights 1.0 |
| 5 rerank | Cross-encoder over top `SHORTLIST=10`; if best score `< RERANK_CONFIDENCE_FLOOR (-8)` keep fused order |
| 6 LLM | `converse()` → strict JSON `{summary, ranking[{id,why}]}`; falls back to keyword-overlap reasons |

- Filters (`category`, `in_stock`, `max_price`) are passed into **both** RPCs (applied before fusion).
- `DISABLE_RERANKER=true` skips stage 5 and never loads that model (saves ~80 MB).
- Descriptions must say what a product **does** ("for making phone calls"), not just specs — retrieval depends on it.
- Query and product embeddings must come from the **same** model; image vectors (512-d) are a separate space.

---

## 7. The agent (`src/app/api/chat/route.ts` + `src/lib/chat-tools.ts`)

Invariants — **do not break these**:

1. **The model never touches the DB.** It emits tool calls; `executeTool` runs them. `userId` comes from the session cookie, never from model output.
2. **Only the last 6 `user`/`assistant` messages** (600 chars each) are accepted; client-supplied `system`/`tool` roles are dropped.
3. **Step 0 uses `tool_choice: 'required'`** (falls back to `'auto'` if the provider 400s). Without it the model answers from memory and invents products.
4. **`max_tokens = 400`, `MAX_STEPS = 5`.**
5. **Grounding guardrail** `isGrounded()`: every `$` amount in a model-written reply must match a price returned by a tool this turn (search results **and** cart unit/line/total prices). Handles `$1,199`. Failure → deterministic fallback; "not in the catalog" wording only if a search actually ran.
6. **Short-circuits (no extra model pass):**
   - Write tools (`add_to_cart`, `add_to_wishlist`, `save_for_later`) → reply built by `describeWrites()` from the tool result, unless `COMPOUND_INTENT` matches the user text.
   - Read tools (`view_cart`, `view_saved`) → `describeReads()`, unless `WRITE_VERB` matches.
   - Mixed/compound requests still go through the model.
7. **Per-IP rate limit** 12 req/min (before any model call). Groq 429s: wait out `retry-after` if ≤ 10 s, else a friendly message.
8. No payments exist: "buy" = add to cart + tell the user to review at checkout. Never claim a purchase.
9. Every step logs: `[chat] step N: tool_calls=… tokens(in/out)=a/b`. Keep it — it is the debugging tool.

Token economics: Groq free tier ≈ **8,000 tokens/min** for the default model. One "add X to cart" ≈ 1.9–2.5k tokens
(system prompt + 6 tool schemas re-sent each pass). Keep the prompt and schemas short. Models available on the
key at last check: `qwen/qwen3.8-27b` (works with tools), `openai/gpt-oss-120b`/`20b` (did **not** emit tool calls
in an earlier test, retest with `tool_choice: required` if switching). Groq retires models without notice
(`llama-3.3-70b-versatile` 404'd) — configure via `GROQ_MODEL`.

Client side (`ChatWidget.tsx`): `send(override?, viaVoice=false)`; replies are spoken only when the message was
spoken. Transcript lives in a ref because `SpeechRecognition.onend` fires outside React's render cycle.

---

## 8. Data model, auth, security

**Tables:** `category`, `products` (`fts tsvector` generated, `embedding vector(384)`, `image_embedding vector(512)`),
`product_variants`, `product_spec`, `cart_items`, `saved_items` (`kind` = `wishlist`|`saved_for_later`).
**SQL order:** `schema.sql` → `pipeline.sql` → `wishlist.sql` → `image-search.sql`. Catalog ≈ 32 products, 4 categories.

**Users** live in Supabase's built-in `auth.users` (Authentication → Users, or Table Editor with schema `auth`).
There is **no** `public.users`/`profiles` table. `cart_items.user_id` and `saved_items.user_id` reference
`auth.users(id) on delete cascade`. Passwords are bcrypt hashes in `auth.users`; the app never sees them.

**RLS:** on for all 6 tables. Catalog = public read. `cart_items` has select/insert/update/delete own-row policies;
`saved_items` has select/insert/delete (**no UPDATE policy** — see TODO).

**Auth flow:** `signUp` with `emailRedirectTo = <origin>/callback`. With email confirmation ON, users must click
the link; links are single-use, ~1 h, and a resend invalidates older links (this caused a real "Email not
confirmed" confusion). `/callback` routes: `?error…` → `/login?authError=…`; code exchange failure →
`/login?confirmed=1` (email confirmed but this browser lacks the PKCE verifier); success → `/`.
Login page offers **Resend confirmation email**. Demo button appears only when both `NEXT_PUBLIC_DEMO_*` are set
at build time; demo sign-in clears that user's cart/wishlist.

**Security measures in place:** RLS; service key server/scripts only; per-IP rate limits (chat 12/min,
image-search 10/min, in-memory); image upload limited to jpg/png/webp ≤ 5 MB with a `Content-Length` pre-check;
security headers + CSP in `next.config.ts` (`'unsafe-inline'` still allowed for scripts/styles; `DISABLE_CSP=true`
at **build** time omits CSP for diagnosis); no `dangerouslySetInnerHTML`; parameterized queries only.

---

## 9. Landmines & conventions

- **Never `select('*')` on `products` for pages that render client components.** The row contains two embedding
  vectors (~6 KB each); `*` shipped ~400 KB of vectors per page and triggered React streaming-segment errors
  (`$RS … parentNode`). Use explicit columns (see `src/app/page.tsx`).
- **Next 15:** `params` / `searchParams` are **Promises** — `await` them.
- **`useSearchParams()` needs a `<Suspense>` boundary** or the production build fails (login page does this).
- **Do not export extra names from `route.ts` files** (Next rejects non-route exports); helpers stay module-private.
- **`NEXT_PUBLIC_*` are build-time.** Changing demo/site vars requires a rebuild/redeploy.
- **Hooks before early returns** (`ProductDetails`): keep all hooks above the "product not found" return.
- **Images:** `images.unoptimized: true` on purpose (avoids `sharp`/libvips GLib warnings and RAM on a 512 MB host). Use `next/image` with `fill` + a sized relative parent.
- **Memory-constrained hosts:** models load lazily; `DISABLE_RERANKER` / `DISABLE_VISUAL_SEARCH` prevent loading.
- **Windows:** CRLF warnings on `git add` are noise. Don't rely on `sleep` loops in PowerShell tool calls.
- **When changing the CSP**, load the pages in a browser and check for violations; `connect-src` must include the Supabase host (`https://` + `wss://`).
- **Don't leak secrets:** never print `.env.local` values; `.env*` is git-ignored (verified none in history).

Code style: match surrounding code; comments explain *why* (non-obvious constraints, tradeoffs), not what.
Tailwind v4 utility classes; dark theme (slate/indigo). Keep copy honest — no inflated claims.

---

## 10. Known issues / TODO (prioritized)

1. Set the demo env vars on Render and create the demo user (see Outstanding table above).
2. **Cart badge doesn't refresh after the agent adds items** — the agent writes server-side; `CartContext` isn't notified. Fix: expose a `refresh()` in `CartContext` and call it after write/read tool replies in `ChatWidget`.
3. **`saved_items` lacks an UPDATE RLS policy** while `executeTool` uses `upsert(onConflict …)`; re-saving an existing item may be rejected (unverified). Add an `update` policy to `wishlist.sql` or switch to insert-ignore.
4. **No `remove_from_cart` / change-quantity tool** for the agent.
5. **No tests / CI.** Candidates: unit tests for RRF fusion, `isGrounded` (incl. `$1,199`), `describeWrites`/`describeReads`, `rate-limit`; GitHub Actions running `tsc`, `lint`, `build`. A `scripts/smoke-test.mjs` for the curl-able checks was offered but not built.
6. **No "Forgot password"**, no CAPTCHA on open sign-up.
7. **No orders/checkout** (cart can't become an order); button explains payments aren't implemented.
8. **Rate limiter is per-instance memory** — use Redis/Upstash for multi-instance. IP comes from proxy headers (spoofable).
9. **CSP `'unsafe-inline'`** — move to nonces via middleware.
10. Housekeeping: unused dep `@supabase/auth-ui-shared`; the "Dynamic server usage" log during `next build` for `/` is benign noise; the headphones product photo shows earbuds; no `LICENSE` (owner must choose the holder).
11. Catalog is tiny (~32) so hybrid/rerank gains are hard to show — documented honestly in the README's evaluation section.

---

## 11. Verifying changes (quick checklist)

1. `npx tsc --noEmit` and `npm run build` pass.
2. `/search?q=device to call someone` → phones; pipeline panel shows stage 1 = 0 hits, stage 2 = phones.
3. Chat (logged in): "add speaker to cart" → `Added Portable Bluetooth Speaker ($59.99) to your cart.`; "what's in my cart" → list + total; log shows tokens per step.
4. Rate limit: 15 rapid `POST /api/chat` with `{}` → `400 ×12` then `429`.
5. Missing product (`/product/99999`): styled not-found page + `noindex`, but HTTP **200** (a soft 404 — streaming from `loading.tsx` sends the status before `notFound()` runs). Unknown routes return a real 404.
5b. Upload: text file to `/api/image-search` → 415; >5 MB → 413.
6. Headers: `curl -sI /` shows CSP, `X-Frame-Options`, etc. Home HTML < ~150 KB and contains **0** occurrences of `embedding`.
7. RLS: anon REST call to `/rest/v1/cart_items` returns `[]`.
8. Mobile: 375 px viewport, no horizontal overflow, hamburger works, chat fits.

---

## 12. Working with the owner

- They are **learning the AI concepts** behind this project and often ask "explain how it works / the code flow".
  Explain in plain language first, then show the code; use concrete examples from this repo (e.g. `iPhone 15`
  vs `device to call someone`). Avoid heavy formulas unless asked; go deeper step by step when asked.
- They value **real verification**: run the thing, show output, don't just assert. Say plainly what was *not*
  tested (e.g. the logged-in flow needs a real session).
- **Ask before committing, pushing or deploying.** Commit only when asked; split commits by concern with
  descriptive messages.
- **Do not create accounts, enter passwords, or handle credentials for them** — give exact steps instead.
  Never echo secrets.
- They are frustrated by long detours with no result (the debugger saga) — keep a visible, working state and
  report concisely what changed and what remains.
- Be honest about limitations; the README's tone is "state the gap plainly".
- Windows 11 machine; the desktop app's browser pane is available for visual checks (resize to 375 px for mobile).
