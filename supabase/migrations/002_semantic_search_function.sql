-- ============================================================================
-- Migration: 002_semantic_search_function.sql
-- Description: Creates a Postgres function for semantic (vector) search over
--              the saved_reels table using pgvector's cosine similarity.
-- ============================================================================

-- match_reels: Returns reels semantically similar to the provided query_embedding.
-- Call this from the frontend via Supabase's rpc() helper.
--
-- Parameters:
--   query_embedding  – 768-float vector produced by text-embedding-004
--   match_threshold  – minimum cosine similarity score (0.0–1.0), default 0.5
--   match_count      – maximum number of results to return, default 10
--
-- RLS Note: `auth.uid()` filtering is applied inside the function so that
-- users can only retrieve their own reels even via RPC calls.
create or replace function match_reels(
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count     int   default 10
)
returns table (
  id            uuid,
  user_id       uuid,
  original_url  text,
  title         text,
  summary       text,
  category      text,
  tags          text[],
  key_takeaways jsonb,
  created_at    timestamptz,
  similarity    float
)
language sql stable
as $$
  select
    sr.id,
    sr.user_id,
    sr.original_url,
    sr.title,
    sr.summary,
    sr.category,
    sr.tags,
    sr.key_takeaways,
    sr.created_at,
    1 - (sr.embedding <=> query_embedding) as similarity
  from public.saved_reels sr
  where
    sr.user_id = auth.uid()
    and 1 - (sr.embedding <=> query_embedding) > match_threshold
  order by sr.embedding <=> query_embedding
  limit match_count;
$$;
