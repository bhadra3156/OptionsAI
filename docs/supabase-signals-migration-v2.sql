-- FILE: docs/supabase-signals-migration-v2.sql
-- =====================================================
-- /signals page — Supabase schema migration (v2 — CLEAN REBUILD)
-- =====================================================
-- WHAT HAPPENED:
--   v1 of this migration partially ran. The `signals` table was created but
--   `telegram_approvals` failed before completing. This v2 file cleans up the
--   half-created state and rebuilds both tables cleanly.
--
-- HOW TO RUN:
--   1. Open Supabase → SQL Editor → New query
--   2. Select all existing text and DELETE it (don't append)
--   3. Paste this entire file
--   4. Click "Run"
--   5. You should see "Success. No rows returned" at the bottom
--
-- WHAT THIS DOES:
--   - DROPs the `signals` table (which was created from v1) and any partial
--     telegram_approvals table that may exist
--   - Recreates both, in the correct order, with simpler syntax
--
-- SAFETY:
--   - Does NOT touch your existing `users`, `analyses`, `usage`, `trades`,
--     or `watchlist` tables.
--   - The DROP statements only target `signals` and `telegram_approvals`.
--   - At this stage `signals` has no data (was just created today, never written to).
-- =====================================================


-- =====================================================
-- STEP 1: Clean up any partial state from v1
-- =====================================================
-- CASCADE removes dependent objects (indexes, triggers, foreign keys)

DROP TABLE IF EXISTS telegram_approvals CASCADE;
DROP TABLE IF EXISTS signals CASCADE;
DROP FUNCTION IF EXISTS update_signals_updated_at() CASCADE;


-- =====================================================
-- STEP 2: Create signals table
-- =====================================================
-- Lifecycle: pending -> approved | rejected | expired -> executed | abandoned

CREATE TABLE signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ticker              TEXT NOT NULL,
  scan_score          INTEGER NOT NULL,
  current_price       NUMERIC(12,4) NOT NULL,
  iv_rank             INTEGER NOT NULL,
  iv30                NUMERIC(6,2) NOT NULL,
  put_call_ratio      NUMERIC(6,2),
  days_to_earnings    INTEGER,
  vix_at_scan         NUMERIC(6,2),

  qualification_model TEXT NOT NULL,
  confidence          INTEGER NOT NULL,
  strategy_name       TEXT NOT NULL,
  market_outlook      TEXT NOT NULL,
  risk_rating         INTEGER NOT NULL,
  legs_json           JSONB NOT NULL,
  metrics_json        JSONB NOT NULL,
  timing_json         JSONB NOT NULL,
  rationale           TEXT NOT NULL,
  warnings            TEXT[] NOT NULL DEFAULT '{}',
  ibkr_ticket         TEXT NOT NULL,

  status              TEXT NOT NULL DEFAULT 'pending',

  qualified_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at        TIMESTAMPTZ,
  expired_at          TIMESTAMPTZ,
  executed_at         TIMESTAMPTZ,

  executed_trade_id   UUID
);

-- Add constraints separately (easier to read errors if one fails)
ALTER TABLE signals ADD CONSTRAINT signals_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed', 'abandoned'));

ALTER TABLE signals ADD CONSTRAINT signals_confidence_check
  CHECK (confidence >= 0 AND confidence <= 100);

ALTER TABLE signals ADD CONSTRAINT signals_scan_score_check
  CHECK (scan_score >= 0 AND scan_score <= 100);

ALTER TABLE signals ADD CONSTRAINT signals_iv_rank_check
  CHECK (iv_rank >= 0 AND iv_rank <= 100);

ALTER TABLE signals ADD CONSTRAINT signals_risk_rating_check
  CHECK (risk_rating >= 1 AND risk_rating <= 5);

-- Foreign key to existing trades.id (UUID).
-- Added as a separate statement so if `trades` has issues, the error is clear.
ALTER TABLE signals ADD CONSTRAINT signals_executed_trade_fk
  FOREIGN KEY (executed_trade_id) REFERENCES trades(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX signals_user_status_idx       ON signals(user_id, status);
CREATE INDEX signals_user_created_idx      ON signals(user_id, created_at DESC);
CREATE INDEX signals_user_ticker_recent_idx ON signals(user_id, ticker, created_at DESC);


-- =====================================================
-- STEP 3: Auto-update `updated_at` trigger on signals
-- =====================================================

CREATE OR REPLACE FUNCTION update_signals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER signals_updated_at_trigger
  BEFORE UPDATE ON signals
  FOR EACH ROW
  EXECUTE FUNCTION update_signals_updated_at();


-- =====================================================
-- STEP 4: Create telegram_approvals table
-- =====================================================

CREATE TABLE telegram_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id           UUID NOT NULL,
  user_id             TEXT NOT NULL,

  telegram_message_id BIGINT,
  chat_id             TEXT NOT NULL,

  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered           BOOLEAN NOT NULL DEFAULT FALSE,
  response            TEXT,
  responded_at        TIMESTAMPTZ,

  expires_at          TIMESTAMPTZ NOT NULL,
  expired_handled     BOOLEAN NOT NULL DEFAULT FALSE,

  send_error          TEXT
);

ALTER TABLE telegram_approvals ADD CONSTRAINT telegram_approvals_response_check
  CHECK (response IS NULL OR response IN ('yes', 'no'));

ALTER TABLE telegram_approvals ADD CONSTRAINT telegram_approvals_signal_fk
  FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX telegram_approvals_signal_idx ON telegram_approvals(signal_id);
CREATE INDEX telegram_approvals_user_idx   ON telegram_approvals(user_id);

-- Partial index: only un-responded, un-handled messages past their expiry
CREATE INDEX telegram_approvals_pending_expiry_idx
  ON telegram_approvals(expires_at)
  WHERE response IS NULL AND expired_handled = FALSE;


-- =====================================================
-- DONE.
-- =====================================================
-- Verify by running:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('signals', 'telegram_approvals')
--   ORDER BY table_name;
-- Should return exactly 2 rows: signals, telegram_approvals