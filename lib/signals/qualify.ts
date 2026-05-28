// FILE: lib/signals/qualify.ts
// =============================================================================
// Stage 3: Deep qualification — Claude Opus reasoning
// =============================================================================
// Runs AFTER pre-filter survivors are identified. For each survivor, we fetch
// full market data (existing lib/yahoo.ts) and send it to Claude Opus 4.7 with
// a strict system prompt that enforces our trading rules.
//
// Why Opus and not Sonnet:
//   This is the highest-stakes call in the system. Maybe 10-20 Opus calls per
//   day total — the cost premium is justified by the reasoning quality at this
//   gate. Cheap mistakes here = real money lost.
//
// Output:
//   Returns QualificationResult = { qualify, confidence, reason?, strategy? }
//   Only signals with `qualify: true` AND `confidence >= MIN_CONFIDENCE`
//   should be persisted and sent to Telegram (caller enforces this).
// =============================================================================

import Anthropic from '@anthropic-ai/sdk'
import type {
  QualificationInput,
  QualificationResult,
} from '@/types/signals'
import { SIGNAL_CONFIG, MAX_LOSS_USD } from '@/types/signals'

// Server-side singleton — ANTHROPIC_API_KEY is read from env automatically
const anthropic = new Anthropic()

// -----------------------------------------------------------------------------
// SYSTEM PROMPT — the trading rules Claude must enforce
// -----------------------------------------------------------------------------
// This prompt is the LAW. Claude is told to be ruthless about rejection.
// We'd rather miss a good trade than approve a bad one, especially in
// paper-trading where the goal is to prove the system before risking money.

const SYSTEM_PROMPT = `You are a senior options trading desk officer with 20+ years of institutional experience. You sit at the FINAL gate before a retail trader places a real options trade.

Your job is ONE binary judgment: should this trade be placed, or not?

You think like a hedge fund risk officer, not an enthusiastic retail trader. Your default answer is REJECT. You only approve when every single rule is satisfied AND your professional gut says the trade has genuine edge.

## NON-NEGOTIABLE RULES

A trade qualifies ONLY if ALL of these hold:

### Volatility regime alignment
1. If ivRank > 50: ONLY recommend premium-selling strategies (iron condor, iron butterfly, cash-secured put, covered call, bull put spread, bear call spread)
2. If ivRank < 30: ONLY recommend premium-buying strategies (long call, long put, debit spread)
3. If ivRank is 30-50: REJECT — no regime edge

### Earnings safety
4. If daysToEarnings <= 7: REJECT — IV crush risk after announcement
5. If daysToEarnings <= 14: include a warning even if trade qualifies
6. If a chosen leg's expiry falls AFTER the next earnings date: REJECT — can't hold through earnings

### Strike selection (delta-based probability)
7. Short strikes in credit strategies: target 0.15-0.30 delta
8. Long options in debit strategies: target 0.40-0.60 delta
9. Strike values used MUST come from the topContracts data provided — do not invent strikes

### Risk sizing (this is hard-capped)
10. Max loss in absolute USD must be <= ${MAX_LOSS_USD} (5% of $${SIGNAL_CONFIG.DEFAULT_PORTFOLIO_NAV_USD} portfolio NAV)
11. For credit spreads: spread width must be at least 2x the premium received
12. NEVER recommend naked options (uncovered short calls/puts)

### Liquidity
13. Each leg's bid-ask spread must be < ${SIGNAL_CONFIG.MAX_BID_ASK_SPREAD_PCT}% of the mid price
14. Each leg's open interest must be >= 100

### Timing
15. Selling strategies: target 30-45 DTE entry
16. Buying strategies: target 60-90 DTE entry
17. ALWAYS include closeAtDTE = 21 and closeProfitTarget = "50% of max profit"

### Probability of profit
18. Estimated probability of profit must be >= ${SIGNAL_CONFIG.MIN_PROBABILITY_OF_PROFIT}%
    (For credit spreads: roughly 1 - short_strike_delta)
    (For debit spreads: harder to estimate — use your judgment honestly)

### Your confidence
19. Self-rate your confidence 0-100 based on how cleanly all the data lines up
20. If your confidence < ${SIGNAL_CONFIG.MIN_CONFIDENCE}: set qualify=false and explain in reason

## OUTPUT FORMAT — STRICT

Return ONLY a single valid JSON object. No markdown code fences, no preamble, no commentary. The response must parse with JSON.parse().

Shape:

{
  "qualify": boolean,
  "confidence": number (0-100),
  "reason": string (REQUIRED if qualify=false, omitted otherwise),
  "strategy": {
    "strategyName": string,
    "marketOutlook": "bullish" | "bearish" | "neutral" | "high-volatility",
    "legs": [{ "action": "buy"|"sell", "type": "call"|"put", "strike": number, "expiry": "YYYY-MM-DD", "quantity": number }],
    "metrics": {
      "maxProfit": string,
      "maxLoss": string,
      "probabilityOfProfit": string,
      "breakeven": [string],
      "riskRating": number (1-5)
    },
    "timing": {
      "idealEntryDTE": number,
      "closeAtDTE": 21,
      "closeProfitTarget": "50% of max profit",
      "stopLoss": string
    },
    "rationale": string (2-4 sentences citing SPECIFIC numbers from the input),
    "warnings": [string] (at least 1),
    "disclaimer": "This is not financial advice. For educational purposes only."
  } (REQUIRED if qualify=true, omitted otherwise)
}

## TONE RULES
- Never say "you should", "this will profit", "guaranteed"
- Always say "this strategy may", "historically this approach"
- Be honest in the reason field — if the trade is borderline, say so
- If multiple rules nearly fail simultaneously, REJECT even if each individually passes`

// -----------------------------------------------------------------------------
// MAIN ENTRY POINT
// -----------------------------------------------------------------------------
// One call per qualified candidate. The caller (Phase C API route) loops.

export async function qualifyWithClaude(
  input: QualificationInput
): Promise<QualificationResult> {
  // Build the user message — structured data Claude will reason over
  const userMessage = buildUserMessage(input)

  let rawResponse: string
  try {
    const message = await anthropic.messages.create({
      model: SIGNAL_CONFIG.QUALIFICATION_MODEL,
      max_tokens: 2500,                    // Opus needs room for the strategy JSON
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    // Extract the text response
    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return {
        qualify: false,
        confidence: 0,
        reason: 'Claude returned no text content',
      }
    }
    rawResponse = textBlock.text
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[qualify] Claude API call failed:', msg)
    return {
      qualify: false,
      confidence: 0,
      reason: `Claude API error: ${msg}`,
    }
  }

  // Parse Claude's JSON response defensively
  return parseAndValidate(rawResponse, input.ticker)
}

// -----------------------------------------------------------------------------
// USER MESSAGE BUILDER
// -----------------------------------------------------------------------------
// Format the market data into a clean, scannable structure Claude can reason
// over. Order matters — most important facts at the top.

function buildUserMessage(input: QualificationInput): string {
  const lines: string[] = [
    `Evaluate this options trade opportunity:`,
    ``,
    `## Ticker: ${input.ticker}`,
    `Current price: $${input.currentPrice.toFixed(2)}`,
    `IV Rank: ${input.ivRank}/100`,
    `IV30: ${input.iv30}% | Historical Vol30: ${input.historicalVol30}%`,
    `IV Premium (iv30 - hv30): ${(input.iv30 - input.historicalVol30).toFixed(1)}%`,
    `Put/Call ratio: ${input.putCallRatio.toFixed(2)}`,
    `Days to next earnings: ${input.daysToEarnings >= 0 ? input.daysToEarnings : 'unknown'}`,
    `VIX (market-wide fear gauge): ${input.vix}`,
    `Stage 1 AI scan score: ${input.scanScore}/100`,
    ``,
    `## Available Options Contracts (top ${input.topContracts.length} by liquidity)`,
    ``,
    `strike | type | expiry      | dte | bid  | ask  | delta  | theta  | OI    | vol`,
    `-------|------|-------------|-----|------|------|--------|--------|-------|-----`,
  ]

  for (const c of input.topContracts) {
    lines.push(
      [
        c.strike.toString().padEnd(6),
        c.type.padEnd(4),
        c.expiry.padEnd(11),
        c.dte.toString().padEnd(3),
        c.bid.toFixed(2).padEnd(4),
        c.ask.toFixed(2).padEnd(4),
        c.delta.toFixed(3).padStart(6),
        c.theta.toFixed(2).padStart(6),
        c.openInterest.toString().padStart(5),
        c.volume.toString().padStart(4),
      ].join(' | ')
    )
  }

  lines.push(
    ``,
    `## Your task`,
    `Apply ALL the rules in the system prompt. Decide qualify true or false.`,
    `If qualify is false, explain WHY concisely in the reason field.`,
    `If qualify is true, return the full strategy object.`,
    `Remember: max loss must be <= $${MAX_LOSS_USD}.`,
    `Return ONLY the JSON. No other text.`
  )

  return lines.join('\n')
}

// -----------------------------------------------------------------------------
// PARSE + VALIDATE Claude's response
// -----------------------------------------------------------------------------
// Claude usually returns clean JSON, but sometimes wraps it in code fences or
// adds an apology before the JSON. Strip junk, parse, validate the shape.

function parseAndValidate(raw: string, ticker: string): QualificationResult {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error(`[qualify] ${ticker}: JSON parse failed. Raw:`, raw.slice(0, 300))
    return {
      qualify: false,
      confidence: 0,
      reason: 'Claude returned invalid JSON',
    }
  }

  // Type-narrow: must be an object with the expected fields
  if (!parsed || typeof parsed !== 'object') {
    return { qualify: false, confidence: 0, reason: 'Claude response was not an object' }
  }

  const obj = parsed as Record<string, unknown>

  // Required: qualify (boolean) and confidence (number)
  if (typeof obj.qualify !== 'boolean') {
    return { qualify: false, confidence: 0, reason: 'Missing qualify field' }
  }
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 100) {
    return { qualify: false, confidence: 0, reason: 'Invalid confidence value' }
  }

  // If qualify=false, we expect a reason and no strategy
  if (!obj.qualify) {
    return {
      qualify: false,
      confidence: obj.confidence,
      reason: typeof obj.reason === 'string' ? obj.reason : 'No reason given',
    }
  }

  // If qualify=true, we expect a strategy object
  if (!obj.strategy || typeof obj.strategy !== 'object') {
    return {
      qualify: false,
      confidence: obj.confidence,
      reason: 'qualify=true but no strategy object returned',
    }
  }

  // Enforce our own confidence floor — Claude may try to qualify at 75 when we require 80
  if (obj.confidence < SIGNAL_CONFIG.MIN_CONFIDENCE) {
    return {
      qualify: false,
      confidence: obj.confidence,
      reason: `Confidence ${obj.confidence} below floor of ${SIGNAL_CONFIG.MIN_CONFIDENCE}`,
    }
  }

  // Pass — we trust the strategy object's structure to the existing schema validation
  // that happens later when this is persisted. Full deep validation is overkill here.
  return {
    qualify: true,
    confidence: obj.confidence,
    strategy: obj.strategy as QualificationResult['strategy'],
  }
}