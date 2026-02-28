-- ============================================================================
-- Migration: 003_debug_columns.sql
-- Description: Add raw-capture columns to saved_reels for observability and
--              debugging.
--
--   caption       – raw text caption scraped by Apify
--   apify_raw     – full JSON payload returned by the Apify dataset item
--   gemini_prompt – exact prompt text sent to Gemini for this reel
--   gemini_raw    – raw text response returned by Gemini before parsing
--
-- All columns are nullable so existing rows are unaffected.
-- ============================================================================

alter table public.saved_reels
  add column if not exists caption       text,
  add column if not exists apify_raw     jsonb,
  add column if not exists gemini_prompt text,
  add column if not exists gemini_raw    text;
