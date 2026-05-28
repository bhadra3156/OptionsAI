-- FILE: docs/supabase-signals-migration.sql
-- =====================================================
-- /signals page — Supabase schema migration
-- =====================================================
-- HOW TO RUN:
--   1. Open https://app.supabase.com → your OptionsAI project
--   2. Left sidebar → SQL Editor
--   3. Click "New query"
--   4. Paste this entire file
--   5. Click "Run"
--   6. You should see "Success. No rows returned" for each statement
--
-- WHAT THIS DOES:
--   Creates two new tables: `signals` and `telegram_approvals`.
--   Does NOT modify your existing `analyses`, `trades`, or `watchlist` tables.
--
-- ROLLBACK (if you need to undo this):
--   DROP TABLE IF EXISTS telegram_approvals;
--   DROP TABLE IF EXISTS signals;
-- =====================================================

-- =====================================================
-- TABLE 1: signals
-- =====================================================
-- The trading record. One row per AI-qualified trade opportunity.
-- Status progression: pending -> approved | rejected | expired -> executed | abandoned
-- =====================================================

CREATE TABLE IF NOT EXISTS signals (
  -- Identity
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,                -- Clerk user ID
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Source data (snapshot of /scan row at qualification time)
  ticker         TEXT NOT NULL,
  scan_score     INTEGER NOT NULL,             -- AI score from Stage 1 scan (1-100)
  current_price  NUMERIC(12,4) NOT NULL,
  iv_rank        INTEGER NOT NULL,             -- 0-100
  iv30           NUMERIC(6,2) NOT NULL,        -- e.g. 35.50 = 35.5%
  put_call_ratio NUMERIC(6,2),
  days_to_earnings INTEGER,                    -- -1 if unknown
  vix_at_scan    NUMERIC(6,2),                 -- VIX level when this was scanned

  -- Claude's qualification output
  qualification_model TEXT NOT NULL,           -- e.g. 'claude-opus-4-7'
  confidence     INTEGER NOT NULL,             -- 0-100, Claude's self-rated confidence
  strategy_name  TEXT NOT NULL,                -- e.g. 'Iron Condor', 'Bull Put Spread'
  market_outlook TEXT NOT NULL,                -- 'bullish' | 'bearish' | 'neutral' | 'high-volatility'
  risk_rating    INTEGER NOT NULL,             -- 1-5 from existing schema
  legs_json      JSONB NOT NULL,               -- array of { action, type, strike, expiry, quantity }
  metrics_json   JSONB NOT NULL,               -- { maxProfit, maxLoss, probabilityOfProfit, breakeven, riskRating }
  timing_json    JSONB NOT NULL,               -- { idealEntryDTE, closeAtDTE, closeProfitTarget, stopLoss }
  rationale      TEXT NOT NULL,
  warnings       TEXT[] NOT NULL,              -- array of warning strings
  ibkr_ticket    TEXT NOT NULL,                -- pre-formatted copy-paste order text

  -- Lifecycle status
  status         TEXT NOT NULL DEFAULT 'pending',
  -- pending:    just qualified, awaiting Telegram response
  -- approved:   user said YES on Telegram, ready to place
  -- rejected:   user said NO on Telegram
  -- expired:    no response within 15 min
  -- executed:   user reported they placed the trade
  -- abandoned:  approved but user explicitly skipped placement

  -- Timestamps for lifecycle transitions (nullable until reached)
  qualified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at   TIMESTAMPTZ,                  -- when user said YES/NO
  expired_at     TIMESTAMPTZ,                  -- when 15-min window closed unanswered
  executed_at    TIMESTAMPTZ,                  -- when user reported fill

  -- Link to executed trade in existing trades table (set after execution)
  executed_trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT signals_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed', 'abandoned')),
  CONSTRAINT signals_confidence_check CHECK (confidence >= 0 AND confidence <= 100),
  CONSTRAINT signals_scan_score_check CHECK (scan_score >= 0 AND scan_score <= 100),
  CONSTRAINT signals_iv_rank_check CHECK (iv_rank >= 0 AND iv_rank <= 100),
  CONSTRAINT signals_risk_rating_check CHECK (risk_rating >= 1 AND risk_rating <= 5)
);

-- Indexes for the queries we'll actually run
CREATE INDEX IF NOT EXISTS signals_user_status_idx ON signals(user_id, status);
CREATE INDEX IF NOT EXISTS signals_user_created_idx ON signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS signals_user_ticker_recent_idx ON signals(user_id, ticker, created_at DESC);
-- Last index supports the "no duplicate signal in same ticker within 24h" check

-- Auto-update `updated_at` on every change
CREATE OR REPLACE FUNCTION update_signals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS signals_updated_at_trigger ON signals;
CREATE TRIGGER signals_updated_at_trigger
  BEFORE UPDATE ON signals
  FOR EACH ROW
  EXECUTE FUNCTION update_signals_updated_at();


-- =====================================================
-- TABLE 2: telegram_approvals
-- =====================================================
-- Audit trail of every Telegram message sent for a signal.
-- Separated from `signals` so messaging failures don't pollute trade state.
-- =====================================================

CREATE TABLE IF NOT EXISTS telegram_approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id      UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,                -- Clerk user ID, denormalised for fast lookups

  -- Message lifecycle
  telegram_message_id BIGINT,                  -- ID returned by Telegram API after send
  chat_id        TEXT NOT NULL,                -- which Telegram chat received it

  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered      BOOLEAN NOT NULL DEFAULT FALSE,   -- did Telegram confirm delivery?
  response       TEXT,                         -- 'yes' | 'no' | null if no response
  responded_at   TIMESTAMPTZ,

  -- Window
  expires_at     TIMESTAMPTZ NOT NULL,         -- sent_at + 15 minutes
  expired_handled BOOLEAN NOT NULL DEFAULT FALSE, -- have we processed the expiry?

  -- Failure tracking (if Telegram API errors)
  send_error     TEXT,                         -- last error message from Telegram, if any

  CONSTRAINT telegram_approvals_response_check CHECK (response IS NULL OR response IN ('yes', 'no'))
);

CREATE INDEX IF NOT EXISTS telegram_approvals_signal_idx ON telegram_approvals(signal_id);
CREATE INDEX IF NOT EXISTS telegram_approvals_user_idx ON telegram_approvals(user_id);
-- Index for the cron-style "find unanswered messages past their expiry" query
CREATE INDEX IF NOT EXISTS telegram_approvals_pending_expiry_idx
  ON telegram_approvals(expires_at)
  WHERE response IS NULL AND expired_handled = FALSE;


-- =====================================================
-- ROW LEVEL SECURITY (optional but recommended)
-- =====================================================
-- Uncomment these if you want Supabase RLS protecting these tables.
-- Note: app code uses supabaseAdmin (service role key) which bypasses RLS anyway,
-- so RLS only matters if you ever expose these tables to the anon client.
-- Recommended: keep RLS enabled with deny-all policies as defence-in-depth.

-- ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE telegram_approvals ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- VERIFY
-- =====================================================
-- After running, check tables exist:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name IN ('signals', 'telegram_approvals');
-- Expected output: 2 rows.