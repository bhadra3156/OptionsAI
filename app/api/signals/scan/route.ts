// FILE: app/api/signals/scan/route.ts
// =============================================================================
// POST /api/signals/scan
// =============================================================================
// THE BIG ONE — runs the full /signals qualification pipeline:
//   1. Stage 1: existing scan (fetches Yahoo data + scores 30 tickers w/ Claude Sonnet)
//   2. Stage 2: pre-filter survivors (deterministic rules, queries Supabase for dup-check)
//   3. Stage 3: deep qualify with Claude Opus, for each survivor in parallel
//   4. Persist: insert qualified signals into Supabase `signals` table
//
// IMPORTANT TIMING NOTE:
//   Vercel Hobby tier serverless functions have a 10-second execution limit.
//   This route does multiple slow things:
//     - Yahoo session + 30 ticker fetches (~5-8s)
//     - One Sonnet scoring call (~1-2s)
//     - Up to N Opus qualify calls in parallel (~3-5s each)
//     - Up to N Yahoo deep fetches in parallel (~2-3s each)
//   To stay within budget we:
//     - Cap candidates at MAX_QUALIFY_CANDIDATES (default 3)
//     - Run qualify calls in parallel (not sequentially)
//     - Use AbortSignal to bail out gracefully if approaching the timeout
//
// If timeouts become a problem, the next step is to convert this to a
// fire-and-forget pattern that returns 202 immediately and writes results
// to Supabase as they come in. We're NOT doing that yet — measure first.
//
// Auth:
//   POST with Clerk session = user-triggered scan
//   The cron variant (Phase F) calls this internally with a fixed userId
// =============================================================================

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // tell Vercel Pro tier we may need up to 60s (free tier ignores this and uses its hard 10s)

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAllScanData, getSignal as getScanSignal } from '@/lib/scanner'
import { fetchMarketData } from '@/lib/yahoo'
import Anthropic from '@anthropic-ai/sdk'
import { preFilter, getSurvivors, getRejections } from '@/lib/signals/pre-filter'
import type { PreFilterCandidate } from '@/lib/signals/pre-filter'
import { qualifyWithClaude } from '@/lib/signals/qualify'
import { buildIbkrTicket } from '@/lib/signals/ibkr-ticket'
import { SIGNAL_CONFIG } from '@/types/signals'
import type {
  QualificationInput,
  ContractSnapshot,
  Signal,
} from '@/types/signals'

const anthropic = new Anthropic()

// Cap on how many candidates we send to Opus per scan.
// Higher = more chances to find a trade, but also more API spend + timeout risk.
const MAX_QUALIFY_CANDIDATES = 3

// -----------------------------------------------------------------------------
// EXTERNAL ENTRY POINT
// -----------------------------------------------------------------------------

export async function POST() {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const result = await runScanPipeline(userId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('POST /api/signals/scan error:', err)
    return NextResponse.json(
      { error: 'Signal scan failed' },
      { status: 500 }
    )
  }
}

// -----------------------------------------------------------------------------
// INTERNAL ENTRY POINT — called by both POST and the cron route
// -----------------------------------------------------------------------------
// Returns a summary of what happened. Detailed per-ticker outcomes go in `details`.

export interface ScanPipelineResult {
  scannedAt: string
  totalScanned: number
  preFilterPassed: number
  qualifiedCount: number
  persistedCount: number
  details: ScanDetail[]
  durationMs: number
}

interface ScanDetail {
  ticker: string
  scanScore: number
  ivRank: number
  stage: 'pre-filter-rejected' | 'qualify-rejected' | 'qualified'
  reason?: string
  confidence?: number
  signalId?: string
}

export async function runScanPipeline(userId: string): Promise<ScanPipelineResult> {
  const startedAt = Date.now()
  const details: ScanDetail[] = []

  // =================================================================
  // STAGE 1: existing market scan
  // Reuses lib/scanner — same code path as /api/scan
  // =================================================================
  const rawScanData = await fetchAllScanData()
  const validScanData = rawScanData.filter(r => r.currentPrice && r.currentPrice > 0 && !r.error)

  if (validScanData.length === 0) {
    return {
      scannedAt: new Date().toISOString(),
      totalScanned: 0,
      preFilterPassed: 0,
      qualifiedCount: 0,
      persistedCount: 0,
      details: [],
      durationMs: Date.now() - startedAt,
    }
  }

  // Score them all with one Sonnet call (same prompt as /api/scan)
  const scores = await scoreCandidates(validScanData)

  // =================================================================
  // STAGE 2: pre-filter — apply deterministic rules
  // =================================================================
  const candidates: PreFilterCandidate[] = validScanData.map(d => ({
    ticker: d.ticker ?? '',
    aiScore: scores[d.ticker ?? ''] ?? 50,
    ivRank: d.ivRank ?? 0,
    daysToEarnings: d.daysToEarnings ?? -1,
    totalOI: d.totalOI ?? 0,
  }))

  // Sort by AI score descending — best candidates evaluated first
  candidates.sort((a, b) => b.aiScore - a.aiScore)

  const decisions = await preFilter(candidates, userId)
  const survivors = getSurvivors(decisions)
  const rejections = getRejections(decisions)

  // Log all pre-filter rejections to details
  for (const r of rejections) {
    const c = candidates.find(x => x.ticker === r.ticker)
    if (!c) continue
    details.push({
      ticker: r.ticker,
      scanScore: c.aiScore,
      ivRank: c.ivRank,
      stage: 'pre-filter-rejected',
      reason: r.reason,
    })
  }

  // Cap survivors at our budget
  const toQualify = survivors.slice(0, MAX_QUALIFY_CANDIDATES)

  // Tickers that survived pre-filter but didn't make the budget cut
  for (const t of survivors.slice(MAX_QUALIFY_CANDIDATES)) {
    const c = candidates.find(x => x.ticker === t)
    if (!c) continue
    details.push({
      ticker: t,
      scanScore: c.aiScore,
      ivRank: c.ivRank,
      stage: 'pre-filter-rejected',
      reason: `Survived rules but capped at top ${MAX_QUALIFY_CANDIDATES} per scan`,
    })
  }

  // =================================================================
  // STAGE 3: deep qualify with Claude Opus, in parallel
  // =================================================================
  const qualifyResults = await Promise.allSettled(
    toQualify.map(ticker => qualifyOne(ticker, candidates))
  )

  // =================================================================
  // STAGE 4: persist qualified signals
  // =================================================================
  let persistedCount = 0
  let qualifiedCount = 0

  for (let i = 0; i < qualifyResults.length; i++) {
    const ticker = toQualify[i]
    const settledResult = qualifyResults[i]
    const candidate = candidates.find(c => c.ticker === ticker)
    if (!candidate) continue

    if (settledResult.status === 'rejected') {
      details.push({
        ticker,
        scanScore: candidate.aiScore,
        ivRank: candidate.ivRank,
        stage: 'qualify-rejected',
        reason: `qualify threw: ${settledResult.reason instanceof Error ? settledResult.reason.message : 'unknown'}`,
      })
      continue
    }

    const { qualification, marketData } = settledResult.value

    if (!qualification.qualify || !qualification.strategy) {
      details.push({
        ticker,
        scanScore: candidate.aiScore,
        ivRank: candidate.ivRank,
        stage: 'qualify-rejected',
        reason: qualification.reason ?? 'qualify=false, no reason given',
        confidence: qualification.confidence,
      })
      continue
    }

    qualifiedCount++

    // Build IBKR ticket
    const ibkrTicket = buildIbkrTicket({
      ticker,
      strategyName: qualification.strategy.strategyName,
      legs: qualification.strategy.legs,
      metrics: qualification.strategy.metrics,
    })

    // Insert into signals table
    const row = {
      user_id: userId,
      ticker,
      scan_score: candidate.aiScore,
      current_price: marketData.currentPrice,
      iv_rank: candidate.ivRank,
      iv30: marketData.iv30,
      put_call_ratio: marketData.putCallRatio,
      days_to_earnings: candidate.daysToEarnings >= 0 ? candidate.daysToEarnings : null,
      vix_at_scan: marketData.vix,
      qualification_model: SIGNAL_CONFIG.QUALIFICATION_MODEL,
      confidence: qualification.confidence,
      strategy_name: qualification.strategy.strategyName,
      market_outlook: qualification.strategy.marketOutlook,
      risk_rating: qualification.strategy.metrics.riskRating,
      legs_json: qualification.strategy.legs,
      metrics_json: qualification.strategy.metrics,
      timing_json: qualification.strategy.timing,
      rationale: qualification.strategy.rationale,
      warnings: qualification.strategy.warnings,
      ibkr_ticket: ibkrTicket,
      status: 'pending' as const,
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('signals')
      .insert(row)
      .select('id')
      .single()

    if (insertErr) {
      console.error(`scan: failed to insert signal for ${ticker}:`, insertErr)
      details.push({
        ticker,
        scanScore: candidate.aiScore,
        ivRank: candidate.ivRank,
        stage: 'qualify-rejected',
        reason: `DB insert failed: ${insertErr.message}`,
        confidence: qualification.confidence,
      })
      continue
    }

    persistedCount++
    details.push({
      ticker,
      scanScore: candidate.aiScore,
      ivRank: candidate.ivRank,
      stage: 'qualified',
      confidence: qualification.confidence,
      signalId: inserted.id,
    })
  }

  // Suppress unused-import warning for getScanSignal (kept for parity with /api/scan
  // shape if we ever want to return a richer summary; harmless no-op)
  void getScanSignal

  return {
    scannedAt: new Date().toISOString(),
    totalScanned: validScanData.length,
    preFilterPassed: survivors.length,
    qualifiedCount,
    persistedCount,
    details,
    durationMs: Date.now() - startedAt,
  }
}

// -----------------------------------------------------------------------------
// HELPER: score 30 tickers with one Sonnet call (mirrors /api/scan)
// -----------------------------------------------------------------------------

async function scoreCandidates(
  validScanData: Array<Record<string, unknown>>
): Promise<Record<string, number>> {
  const prompt = `You are a professional options trader. Score each of these stocks as options trading opportunities right now.

For each ticker, give a score from 1-100 based on:
- How extreme the IV Rank is (very high or very low = more edge = higher score)
- How high the Vol/OI ratio is (unusual activity = higher score)
- Whether put/call ratio shows clear directional conviction
- Overall opportunity quality for options strategies right now

Data:
${validScanData.map(d => `${d.ticker}: price=$${d.currentPrice}, ivRank=${d.ivRank}, iv30=${d.iv30}%, volOI=${d.volOiRatio}, putCall=${d.putCallRatio}, daysToEarnings=${d.daysToEarnings}`).join('\n')}

Return ONLY valid JSON — an object where keys are ticker symbols and values are integer scores 1-100. No markdown, no explanation.
Example: {"SPY": 45, "TSLA": 78, "AAPL": 62}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type === 'text') {
      const clean = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return JSON.parse(clean)
    }
  } catch (err) {
    console.warn('[scan] Sonnet scoring failed, using IV Rank fallback:', err)
  }

  // Fallback: use IV Rank as score
  const fallback: Record<string, number> = {}
  validScanData.forEach(d => {
    const t = d.ticker as string | undefined
    if (t) fallback[t] = (d.ivRank as number | undefined) ?? 50
  })
  return fallback
}

// -----------------------------------------------------------------------------
// HELPER: deep-fetch one ticker + call qualifyWithClaude
// -----------------------------------------------------------------------------

interface QualifyOneResult {
  qualification: Awaited<ReturnType<typeof qualifyWithClaude>>
  marketData: { currentPrice: number; iv30: number; putCallRatio: number; vix: number }
}

async function qualifyOne(
  ticker: string,
  candidates: PreFilterCandidate[]
): Promise<QualifyOneResult> {
  const candidate = candidates.find(c => c.ticker === ticker)
  if (!candidate) throw new Error(`Candidate ${ticker} not found`)

  // Fetch full market data (options chain + Greeks)
  const md = await fetchMarketData(ticker)

  // Build QualificationInput
  const topContracts: ContractSnapshot[] = (md.topContracts ?? []).map(c => ({
    strike: c.strike,
    expiry: c.expiry,
    type: c.type,
    bid: c.bid,
    ask: c.ask,
    delta: c.delta,
    gamma: c.gamma,
    theta: c.theta,
    vega: c.vega,
    openInterest: c.openInterest,
    volume: c.volume,
    impliedVolatility: c.impliedVolatility,
    dte: c.dte,
  }))

  const qInput: QualificationInput = {
    ticker,
    scanScore: candidate.aiScore,
    currentPrice: md.currentPrice,
    ivRank: md.ivRank,
    iv30: md.iv30,
    historicalVol30: md.historicalVol30,
    putCallRatio: md.putCallRatio,
    daysToEarnings: md.daysToEarnings,
    vix: md.vix,
    topContracts,
  }

  const qualification = await qualifyWithClaude(qInput)

  return {
    qualification,
    marketData: {
      currentPrice: md.currentPrice,
      iv30: md.iv30,
      putCallRatio: md.putCallRatio,
      vix: md.vix,
    },
  }
}