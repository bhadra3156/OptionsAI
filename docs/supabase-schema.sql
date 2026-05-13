-- FILE: supabase-schema.sql
-- Run this in your Supabase project's SQL Editor
-- (Supabase Dashboard → SQL Editor → New Query → paste this → Run)
--
-- This creates all three tables the app needs.
-- Row Level Security (RLS) ensures users can only see their own data.

-- ── Users table ──────────────────────────────────────────────────────────────
-- Mirrors Clerk user IDs so we can link analyses to accounts.
-- Clerk manages the actual authentication — this is just a reference.
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_id TEXT UNIQUE NOT NULL,        -- Clerk's user ID (e.g. "user_2abc...")
  email TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Analyses table ────────────────────────────────────────────────────────────
-- Stores every strategy that has been generated.
-- strategy_json stores the complete Claude output.
-- market_data stores the key market stats at the time of analysis.
CREATE TABLE IF NOT EXISTS public.analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,                -- Clerk user ID (matches users.clerk_id)
  ticker TEXT NOT NULL,
  strategy_json JSONB NOT NULL,
  market_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Usage table ───────────────────────────────────────────────────────────────
-- Tracks how many analyses each user has done per day.
-- Used for rate limiting free tier users to 3 per day.
CREATE TABLE IF NOT EXISTS public.usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 1,
  UNIQUE(user_id, date)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- RLS ensures users can only read/write their own rows.
-- The service role key (used in our API) bypasses RLS — that's intentional.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;

-- Policies for analyses — users see only their own
CREATE POLICY "Users can read own analyses"
  ON public.analyses FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own analyses"
  ON public.analyses FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- ── Indexes for performance ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS analyses_user_id_idx ON public.analyses (user_id);
CREATE INDEX IF NOT EXISTS analyses_created_at_idx ON public.analyses (created_at DESC);
CREATE INDEX IF NOT EXISTS usage_user_date_idx ON public.usage (user_id, date);
