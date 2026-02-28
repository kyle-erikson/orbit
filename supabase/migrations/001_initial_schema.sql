-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Creates the initial tables for orbit (reel-summarizer).
--
-- Apply this via the Supabase Dashboard SQL Editor, or:
--   supabase db push  (if using the Supabase CLI)
--
-- IMPORTANT: Run migrations in order. This file must be applied before any
-- subsequent migrations.
-- ============================================================================

-- Enable pgvector extension for semantic search
create extension if not exists vector with schema public;

-- ============================================================================
-- Table: user_api_keys
-- Stores hashed API keys that authenticate iOS Shortcut webhook calls.
-- The raw key is NEVER stored — only the SHA-256 hex digest.
-- ============================================================================
create table if not exists public.user_api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- SHA-256 hex digest of the raw API key (64 chars). Never store the raw key.
  key_hash      text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Index for fast lookup during webhook auth
create index if not exists idx_user_api_keys_key_hash
  on public.user_api_keys (key_hash);

-- ============================================================================
-- Table: saved_reels
-- Stores every Reel processed by the AI pipeline.
-- ============================================================================
create table if not exists public.saved_reels (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  original_url  text not null,
  title         text not null,
  summary       text not null,
  category      text not null,
  tags          text[] not null default '{}',
  key_takeaways jsonb not null default '[]',
  -- 768-dimensional embedding from text-embedding-004
  embedding     vector(768),
  created_at    timestamptz not null default now()
);

-- Index for user-scoped feed queries
create index if not exists idx_saved_reels_user_id
  on public.saved_reels (user_id, created_at desc);

-- ============================================================================
-- Row Level Security (RLS)
-- Every table MUST have RLS enabled. Users can only read/write their own rows.
-- ============================================================================

alter table public.user_api_keys enable row level security;
alter table public.saved_reels enable row level security;

-- user_api_keys policies
create policy "Users can view their own API keys"
  on public.user_api_keys for select
  using (auth.uid() = user_id);

create policy "Users can delete their own API keys"
  on public.user_api_keys for delete
  using (auth.uid() = user_id);

-- The worker uses the service-role key (bypasses RLS) to insert keys and to
-- look up keys during auth. No INSERT policy needed for anon/authenticated.

-- saved_reels policies
create policy "Users can view their own reels"
  on public.saved_reels for select
  using (auth.uid() = user_id);

-- Worker inserts via service-role key (bypasses RLS).
-- Users can delete their own reels from the frontend.
create policy "Users can delete their own reels"
  on public.saved_reels for delete
  using (auth.uid() = user_id);
