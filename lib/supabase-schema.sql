-- FILE: supabase-schema.sql
-- Run this in Supabase Dashboard → SQL Editor → New Query → paste → Run

-- Analyses table — stores every strategy generated
CREATE TABLE IF NOT EXISTS public.analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  strategy_json JSONB NOT NULL,
  market_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS analyses_user_id_idx ON public.analyses (user_id);
CREATE INDEX IF NOT EXISTS analyses_created_at_idx ON public.analyses (created_at DESC);

-- Row Level Security
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analyses"
  ON public.analyses FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own analyses"
  ON public.analyses FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);
