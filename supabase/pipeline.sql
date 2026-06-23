-- =====================================================================
--  Stage 1 + Stage 2 functions for the 6-stage search pipeline,
--  now with METADATA FILTERING (category / in-stock / max price).
--  Run this in the Supabase SQL Editor AFTER schema.sql.
--  Safe to re-run.
--
--  Filters are applied INSIDE both subqueries (keyword and semantic) so the
--  hard constraints hold no matter which method surfaces a product — the
--  correct way to combine search with structured filters.
-- =====================================================================

-- Drop older signatures so PostgREST doesn't see ambiguous overloads.
drop function if exists keyword_search(text, int);
drop function if exists semantic_search(vector, int);
drop function if exists keyword_search(text, int, text, boolean, numeric);
drop function if exists semantic_search(vector, int, text, boolean, numeric);

-- Stage 1 — keyword / full-text search, ranked by ts_rank_cd, with filters.
create or replace function keyword_search(
  query_text       text,
  match_count      int     default 20,
  filter_category  text    default null,
  filter_in_stock  boolean default false,
  filter_max_price numeric default null
)
returns setof products
language sql
as $$
  select p.*
  from products p
  where p.fts @@ websearch_to_tsquery('english', query_text)
    and (filter_category is null
         or p.category_id = (select id from category where category_name ilike filter_category))
    and (not filter_in_stock or p.stock > 0)
    and (filter_max_price is null
         or exists (select 1 from product_variants v
                    where v.product_id = p.id and v.price <= filter_max_price))
  order by ts_rank_cd(p.fts, websearch_to_tsquery('english', query_text)) desc
  limit match_count;
$$;

-- Stage 2 — semantic / vector search, ranked by cosine distance, with filters.
create or replace function semantic_search(
  query_embedding  vector(384),
  match_count      int     default 20,
  filter_category  text    default null,
  filter_in_stock  boolean default false,
  filter_max_price numeric default null
)
returns setof products
language sql
as $$
  select p.*
  from products p
  where p.embedding is not null
    and (filter_category is null
         or p.category_id = (select id from category where category_name ilike filter_category))
    and (not filter_in_stock or p.stock > 0)
    and (filter_max_price is null
         or exists (select 1 from product_variants v
                    where v.product_id = p.id and v.price <= filter_max_price))
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
