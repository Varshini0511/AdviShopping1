# Hybrid Search Setup

Hybrid search combines two methods and fuses the results:

- **Lexical / full-text** — Postgres `tsvector` (the `products.fts` column). Great for exact words and product names.
- **Semantic / vector** — `pgvector` (the `products.embedding` column) using the `gte-small` model (384 dims). Great for meaning, synonyms, natural-language queries, and typos.

The `hybrid_search` SQL function runs both and merges them with **Reciprocal Rank Fusion (RRF)**. The Next.js search page calls it via `supabase.rpc('hybrid_search', ...)`. No UI changed — only the data layer.

Embeddings are generated **locally** with `@xenova/transformers` (gte-small), so **no OpenAI / external API key is needed**.

---

## ⚠️ First: point `.env.local` at a working database

The Supabase project currently in `.env.local` (`lhwuknhgjmthkmxblpph.supabase.co`) **no longer exists** — its domain does not resolve. Create a Supabase project (or use your Postgres-with-pgvector instance) and update:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...        # service_role key — used by the seed/embeddings script
```

---

## Steps

1. **Create the schema + seed data.**
   Open the Supabase **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   This creates `category`, `products`, `product_variants`, `product_spec`, `cart_items`, the indexes, RLS policies, the `hybrid_search` function, and inserts test data.
   (It uses `pgvector`; the script enables the extension for you.)

2. **Generate the embeddings.**
   ```bash
   npm run embeddings
   ```
   First run downloads the model (~30 MB) once, then fills `products.embedding`. Re-runnable — it only embeds rows whose embedding is still `NULL`.

3. **Run the app.**
   ```bash
   npm run dev
   ```
   Search from the navbar. Try:
   - `headphones` → exact keyword hit
   - `something to keep my music loud outdoors` → semantic hit (Bluetooth speaker)
   - `book about building good habits` → semantic hit (Atomic Habits)

---

## How it fits together

| File | Role |
|------|------|
| `supabase/schema.sql` | Tables, indexes, RLS, `hybrid_search()`, seed data |
| `scripts/generate-embeddings.mjs` | One-off: fills `products.embedding` (gte-small) |
| `src/lib/embeddings.ts` | Embeds the **query** at search time (same model) |
| `src/app/search/page.tsx` | Calls `rpc('hybrid_search', …)` instead of `.ilike()` |
| `next.config.ts` | Marks transformers as a server-external package; allows picsum images |

## Tuning

`hybrid_search` accepts optional weights, so you can favor one method:

```ts
.rpc('hybrid_search', {
  query_text: query,
  query_embedding: queryEmbedding,
  match_count: 12,
  full_text_weight: 1,   // raise to favor exact keywords
  semantic_weight: 1,    // raise to favor meaning
})
```

## Adding products later

After inserting new products, just run `npm run embeddings` again to embed the new rows.
