// FILE: types/signals.ts
// =============================================================================
// /signals page — TypeScript type definitions
// =============================================================================
// Single source of truth for the shape of signals data across the app.
// Every signals-related file (lib, api, components) imports from here.
//
// Mirrors the Supabase schema in docs/supabase-signals-migration-v2.sql.
// If you change the schema, change this file too — or things will break in
// confusing ways at runtime that TypeScript can't catch.
//
// v2 (28 May 2026): NAV updated from $10k assumption to £5k target. Currency
// is GBP for the user's portfolio but USD for option prices (Yahoo returns USD).
// We treat £5,000 as approximately $6,300 USD (rate ~1.26) — see SIGNAL_CONFIG.
// =============================================================================

import type { OptionsStrategy } from '@/types/strategy'

// -----------------------------------------------------------------------------
// SIGNAL LIFECYCLE STATUS
// -----------------------------------------------------------------------------
// pending    — qualified by Claude, Telegram message sent, awaiting user response
// approved   — user said YES on Telegram, ready to place in IBKR
// rejected   — user said NO on Telegram
// expired    — 15 minutes passed with no response
// executed   — user placed the trade and reported fill (links to trades.id)
// abandoned  — user approved but explicitly skipped placement
export type SignalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'abandoned'

// Market outlook from Claude's strategy schema (matches existing /api/analyze output)
export type MarketOutlook = 'bullish' | 'bearish' | 'neutral' | 'high-volatility'

// -----------------------------------------------------------------------------
// CORE SIGNAL RECORD
// -----------------------------------------------------------------------------
// One row in the `signals` Supabase table.
// All timestamps come back from Supabase as ISO 8601 strings, not Date objects.
// -----------------------------------------------------------------------------
export interface Signal {
  // Identity
  id: string                       // UUID
  user_id: string                  // Clerk user ID
  created_at: string               // ISO timestamp
  updated_at: string               // ISO timestamp

  // Source data — snapshot from /scan at moment of qualification
  ticker: string
  scan_score: number               // 1-100 from Stage 1 scan
  current_price: number
  iv_rank: number                  // 0-100
  iv30: number                     // percentage, e.g. 35.5
  put_call_ratio: number | null
  days_to_earnings: number | null  // -1 if unknown (stored as null in DB if unknown)
  vix_at_scan: number | null

  // Claude qualification output
  qualification_model: string      // e.g. 'claude-opus-4-7'
  confidence: number               // 0-100, Claude's self-rating
  strategy_name: string            // e.g. 'Iron Condor'
  market_outlook: MarketOutlook
  risk_rating: number              // 1-5
  legs_json: SignalLeg[]           // each leg of the spread
  metrics_json: SignalMetrics
  timing_json: SignalTiming
  rationale: string
  warnings: string[]
  ibkr_ticket: string              // pre-formatted copy-paste text

  // Lifecycle
  status: SignalStatus
  qualified_at: string             // ISO timestamp
  responded_at: string | null
  expired_at: string | null
  executed_at: string | null
  executed_trade_id: string | null // FK to trades.id once executed
}

// One leg of an options trade (matches existing OptionsStrategy.legs type)
export interface SignalLeg {
  action: 'buy' | 'sell'
  type: 'call' | 'put'
  strike: number
  expiry: string                   // YYYY-MM-DD
  quantity: number
}

// Metrics computed by Claude during qualification
export interface SignalMetrics {
  maxProfit: string                // e.g. "$210" or "Unlimited"
  maxLoss: string                  // e.g. "$790"
  probabilityOfProfit: string      // e.g. "72%"
  breakeven: string[]              // e.g. ["$496.50"] or ["$171.80", "$203.20"]
  riskRating: number               // 1-5, duplicates top-level risk_rating for legacy match
}

// Timing rules from Claude
export interface SignalTiming {
  idealEntryDTE: number
  closeAtDTE: number
  closeProfitTarget: string        // e.g. "50% of max profit"
  stopLoss: string                 // e.g. "2x premium received"
}

// -----------------------------------------------------------------------------
// TELEGRAM APPROVAL RECORD
// -----------------------------------------------------------------------------
// One row in the `telegram_approvals` Supabase table.
// One signal may have multiple approval rows over its lifecycle (e.g. retries
// after a send failure) — though in practice we expect exactly one per signal.
// -----------------------------------------------------------------------------
export interface TelegramApproval {
  id: string                       // UUID
  signal_id: string                // FK to signals.id
  user_id: string                  // Clerk user ID (denormalised for fast lookups)

  telegram_message_id: number | null  // ID Telegram returns after send
  chat_id: string

  sent_at: string                  // ISO timestamp
  delivered: boolean
  response: 'yes' | 'no' | null
  responded_at: string | null

  expires_at: string               // ISO timestamp — sent_at + 15 min
  expired_handled: boolean         // have we processed the expiry?

  send_error: string | null        // last error from Telegram API if any
}

// -----------------------------------------------------------------------------
// INPUTS / API REQUEST + RESPONSE SHAPES
// -----------------------------------------------------------------------------

// Input to lib/signals/qualify.ts — what we send to Claude for Stage 3
export interface QualificationInput {
  ticker: string
  scanScore: number
  currentPrice: number
  ivRank: number
  iv30: number
  historicalVol30: number
  putCallRatio: number
  daysToEarnings: number           // -1 if unknown
  vix: number
  topContracts: ContractSnapshot[]
}

export interface ContractSnapshot {
  strike: number
  expiry: string                   // YYYY-MM-DD
  type: 'call' | 'put'
  bid: number
  ask: number
  delta: number                    // estimated (we calculate, Yahoo doesn't return)
  gamma: number                    // estimated
  theta: number                    // estimated
  vega: number                     // estimated
  openInterest: number
  volume: number
  impliedVolatility: number
  dte: number
}

// What Claude returns from Stage 3 (matches OptionsStrategy + adds confidence + qualify)
export interface QualificationResult {
  qualify: boolean
  confidence: number               // 0-100
  reason?: string                  // present if qualify=false, explains why
  strategy?: OptionsStrategy       // present if qualify=true
}

// Input to lib/signals/pre-filter.ts — one scan result
// Mirrors lib/scanner.ts ScanResult, redeclared here to avoid circular imports
export interface PreFilterInput {
  ticker: string
  aiScore: number
  ivRank: number
  daysToEarnings: number
  totalOI: number
}

// Output of pre-filter
export interface PreFilterResult {
  pass: boolean
  reason?: string                  // present if pass=false
}

// -----------------------------------------------------------------------------
// FRONTEND-FACING TYPES
// -----------------------------------------------------------------------------
// What the /signals page displays. Shape API responses match these.

// What /api/signals/list returns
export interface SignalsListResponse {
  pending: Signal[]                // status=pending, sorted newest first
  approved: Signal[]               // status=approved, awaiting "I placed" click
  history: Signal[]                // status in (rejected, expired, executed, abandoned), last 24h
  lastScanAt: string | null        // ISO timestamp of most recent successful scan
  nextScanAt: string | null        // ISO timestamp of next scheduled cron run, null if Hobby tier
}

// What the user submits when reporting a fill
export interface ExecuteSignalInput {
  signalId: string
  actualFillPrice: number          // what they actually got filled at
  contracts: number                // how many they ended up placing
  notes?: string
}

// -----------------------------------------------------------------------------
// TYPE GUARDS — runtime helpers
// -----------------------------------------------------------------------------

export function isPending(s: Signal): boolean {
  return s.status === 'pending'
}

export function isApproved(s: Signal): boolean {
  return s.status === 'approved'
}

export function isClosed(s: Signal): boolean {
  return ['rejected', 'expired', 'executed', 'abandoned'].includes(s.status)
}

// -----------------------------------------------------------------------------
// CONSTANTS — single source of truth for thresholds and config values
// -----------------------------------------------------------------------------
// IMPORTANT: NAV is in USD even though the user's account is GBP.
// Reasoning: Yahoo Finance returns all option prices in USD. Comparing apples
// to apples means doing risk math in USD. The user's £5,000 paper-trading
// portfolio is treated as approximately $6,300 USD at a ~1.26 GBP→USD rate.
// When live, if GBP/USD drifts >5% from this, we should revisit the constant.

export const SIGNAL_CONFIG = {
  // Stage 2 pre-filter thresholds (deterministic, no AI involved)
  MIN_SCAN_SCORE: 75,              // /scan must rate the ticker at least this
  MIN_TOTAL_OI: 500,               // total open interest across the chain
  EARNINGS_BLACKOUT_DAYS: 7,       // no buying options within this window
  IV_RANK_NEUTRAL_LOWER: 30,       // IVR in this dead-zone = ambiguous regime
  IV_RANK_NEUTRAL_UPPER: 50,
  DUPLICATE_TICKER_HOURS: 24,      // no re-signalling the same ticker within this

  // Stage 3 qualification thresholds (Claude judges against these)
  MIN_CONFIDENCE: 80,              // Claude's self-rated confidence floor
  MIN_PROBABILITY_OF_PROFIT: 65,   // estimated POP from strategy
  MAX_BID_ASK_SPREAD_PCT: 10,      // liquidity guard
  DEFAULT_PORTFOLIO_NAV_USD: 6_300, // £5,000 ≈ $6,300 at 1.26 GBP→USD
  MAX_LOSS_PCT_OF_NAV: 5,          // single trade can risk at most this %
  // 5% of $6,300 = $315 max loss per trade

  // Telegram approval window
  APPROVAL_WINDOW_MINUTES: 15,

  // Stage 3 model — premium reasoning for the critical step
  QUALIFICATION_MODEL: 'claude-opus-4-7',
  // Stage 1 reuses /scan which uses 'claude-sonnet-4-6'
} as const

// Convenience getter — the calculated max loss in USD
export const MAX_LOSS_USD =
  SIGNAL_CONFIG.DEFAULT_PORTFOLIO_NAV_USD * (SIGNAL_CONFIG.MAX_LOSS_PCT_OF_NAV / 100)
// = 315