// FILE: lib/signals/pre-filter.ts
// =============================================================================
// Stage 2: Pre-filter — hard rule rejections
// =============================================================================
// Runs AFTER the Stage 1 scan (existing /api/scan) and BEFORE Stage 3 (Claude
// Opus qualification). The job here is cheap, deterministic rejection of
// candidates that obviously aren't worth spending an Opus call on.
//
// Rules applied (any failure = reject):
//   1. AI scan score >= MIN_SCAN_SCORE (75)
//   2. No earnings within EARNINGS_BLACKOUT_DAYS (7)
//   3. Total open interest >= MIN_TOTAL_OI (500) — liquidity floor
//   4. IV Rank is NOT in the neutral 30-50 zone (no clear regime edge)
//   5. No existing signal for this ticker in the last DUPLICATE_TICKER_HOURS (24)
//
// Inputs:  list of ScanResult rows (from existing /api/scan)
//          user_id (for the duplicate check)
// Output:  filtered list with per-ticker pass/fail and reason
// =============================================================================

import { supabaseAdmin } from '@/lib/supabase'
import type { PreFilterResult } from '@/types/signals'
import { SIGNAL_CONFIG } from '@/types/signals'

// Loose ScanResult shape — we only need a few fields, declared inline so
// we don't have to import the big lib/scanner types and risk a circular dep
export interface PreFilterCandidate {
  ticker: string
  aiScore: number
  ivRank: number
  daysToEarnings: number       // -1 if unknown
  totalOI: number
}

// What we return for each candidate
export interface PreFilterDecision extends PreFilterResult {
  ticker: string
}

// -----------------------------------------------------------------------------
// MAIN ENTRY POINT
// -----------------------------------------------------------------------------
// Takes a batch of scan results, returns parallel array of pass/fail decisions.
// The duplicate-ticker check requires a single Supabase query upfront, so we
// batch it (cheaper than one query per candidate).

export async function preFilter(
  candidates: PreFilterCandidate[],
  userId: string
): Promise<PreFilterDecision[]> {
  if (candidates.length === 0) return []

  // Fetch tickers we've already signalled in the last 24h
  // ONE query covers all candidates (saves N round-trips)
  const recentTickers = await fetchRecentlySignalledTickers(userId)

  // Apply rules per candidate
  return candidates.map(c => {
    // Rule 1: scan score floor
    if (c.aiScore < SIGNAL_CONFIG.MIN_SCAN_SCORE) {
      return {
        ticker: c.ticker,
        pass: false,
        reason: `AI score ${c.aiScore} below floor of ${SIGNAL_CONFIG.MIN_SCAN_SCORE}`,
      }
    }

    // Rule 2: earnings blackout
    // -1 means unknown — we treat unknown as PASS (don't reject) but flag it
    if (c.daysToEarnings >= 0 && c.daysToEarnings <= SIGNAL_CONFIG.EARNINGS_BLACKOUT_DAYS) {
      return {
        ticker: c.ticker,
        pass: false,
        reason: `Earnings in ${c.daysToEarnings} day(s) — within ${SIGNAL_CONFIG.EARNINGS_BLACKOUT_DAYS}-day blackout`,
      }
    }

    // Rule 3: liquidity floor (open interest)
    if (c.totalOI < SIGNAL_CONFIG.MIN_TOTAL_OI) {
      return {
        ticker: c.ticker,
        pass: false,
        reason: `Total OI ${c.totalOI} below floor of ${SIGNAL_CONFIG.MIN_TOTAL_OI} (illiquid)`,
      }
    }

    // Rule 4: IV Rank neutral zone — no clear regime edge
    // We trade either side of this zone (sell premium > 50, buy < 30)
    // The 30-50 dead-zone offers no statistical edge for either direction
    if (
      c.ivRank > SIGNAL_CONFIG.IV_RANK_NEUTRAL_LOWER &&
      c.ivRank < SIGNAL_CONFIG.IV_RANK_NEUTRAL_UPPER
    ) {
      return {
        ticker: c.ticker,
        pass: false,
        reason: `IV Rank ${c.ivRank} in neutral zone (${SIGNAL_CONFIG.IV_RANK_NEUTRAL_LOWER}-${SIGNAL_CONFIG.IV_RANK_NEUTRAL_UPPER}) — no clear regime edge`,
      }
    }

    // Rule 5: no duplicate ticker within window
    if (recentTickers.has(c.ticker)) {
      return {
        ticker: c.ticker,
        pass: false,
        reason: `Already signalled ${c.ticker} in last ${SIGNAL_CONFIG.DUPLICATE_TICKER_HOURS}h`,
      }
    }

    // All rules passed — candidate survives to Stage 3
    return { ticker: c.ticker, pass: true }
  })
}

// -----------------------------------------------------------------------------
// HELPER: get set of tickers signalled in the duplicate-check window
// -----------------------------------------------------------------------------
// We query for ANY status (pending, approved, executed, rejected, expired) —
// even a rejected signal counts as "we recently looked at this and made a call,
// don't waste cycles on it again so soon."

async function fetchRecentlySignalledTickers(userId: string): Promise<Set<string>> {
  const windowStart = new Date(
    Date.now() - SIGNAL_CONFIG.DUPLICATE_TICKER_HOURS * 60 * 60 * 1000
  ).toISOString()

  const { data, error } = await supabaseAdmin
    .from('signals')
    .select('ticker')
    .eq('user_id', userId)
    .gte('created_at', windowStart)

  if (error) {
    // Soft-fail: if the DB lookup breaks, we DON'T want to spam duplicate
    // signals. Conservative approach is to assume nothing's recent and let
    // Stage 3 catch it later. Log the error so we notice.
    console.error('[pre-filter] failed to fetch recent tickers:', error.message)
    return new Set()
  }

  return new Set((data ?? []).map(r => r.ticker))
}

// -----------------------------------------------------------------------------
// HELPER: get just the passing candidates (convenience wrapper)
// -----------------------------------------------------------------------------

export function getSurvivors(decisions: PreFilterDecision[]): string[] {
  return decisions.filter(d => d.pass).map(d => d.ticker)
}

export function getRejections(decisions: PreFilterDecision[]): PreFilterDecision[] {
  return decisions.filter(d => !d.pass)
}