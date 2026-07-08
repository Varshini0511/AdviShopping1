-- =====================================================================
--  Visual (image) search — CLIP image embeddings.
--  Run this in the Supabase SQL Editor AFTER schema.sql.
--
--  Adds a 512-dim image vector per product (from its photo, via CLIP) plus a
--  nearest-neighbour search function. Populate it with:  npm run image-embeddings
-- =====================================================================

create extension if not exists vector;

-- CLIP image embeddings are 512-dim.
alter table products add column if not exists image_embedding vector(512);

create index if not exists products_image_embedding_idx
  on products using hnsw (image_embedding vector_cosine_ops);

-- Nearest-neighbour search over product images.
create or replace function image_search(
  query_embedding vector(512),
  match_count     int default 8
)
returns setof products
language sql
as $$
  select *
  from products
  where image_embedding is not null
  order by image_embedding <=> query_embedding
  limit match_count;
$$;
