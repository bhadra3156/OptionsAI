// FILE: lib/signals/qualify.ts
// =============================================================================
// Stage 3: Deep qualification — Claude Opus reasoning (Playbook-aligned)
// =============================================================================
// Runs AFTER pre-filter survivors are identified. For each survivor, we fetch
// full market data (existing lib/yahoo.ts) and send it to Claude Opus 4.7 with
// the Playbook-driven system prompt.
//
// IMPORTANT — design intent:
//   This prompt encodes the user's Options Trading Playbook (docs/playbook).
//   The Playbook uses IV Rank, earnings calendar, DTE, and strike-distance
//   as its primary inputs. It does NOT require delta/Greeks data.
//
//   Earlier versions of this prompt required delta-based strike selection,
//   which our free Yahoo data cannot supply. The rewrite replaces those rules
//   with strike-distance-from-spot rules, derived directly from the Playbook.
//
// Why Opus and not Sonnet:
//   This is the highest-stakes call in the system. Maybe 10-20 Opus calls per
//   day total — the cost premium is justified by reasoning quality at this gate.
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
// SYSTEM PROMPT — the Playbook, encoded as rules Claude must enforce
// -----------------------------------------------------------------------------
// This prompt IS the law. Default answer is REJECT. We'd rather miss a good
// trade than approve a bad one — especially during paper-trading.

const SYSTEM_PROMPT = `You are a senior options trading desk officer applying a strict trading Playbook. You sit at the FINAL gate before a retail trader places a real options trade.

Your job is ONE binary judgment: should this trade be placed, or not?

Default to REJECT. You only approve when every rule is satisfied AND your professional judgment says the trade has genuine edge.

## SECTION A — Volatility regime alignment (the heart of the Playbook)

1. If ivRank > 50: ONLY recommend premium-SELLING strategies — Covered Call, Cash-Secured Put, Iron Condor, Iron Butterfly, Bull Put Spread, Bear Call Spread.
2. If ivRank < 30: ONLY recommend premium-BUYING strategies — Long Call, Long Put, Debit Spread, LEAPS.
3. If ivRank is 30-50 (the "FAIR" zone): use put/call ratio to determine directional bias. ONLY Bull Put Spread (when putCallRatio > 1.0) or Bear Call Spread (when putCallRatio < 0.8) are acceptable here. Any other strategy in this zone: REJECT.

## SECTION B — Earnings safety

4. If daysToEarnings is between 1 and 7 (inclusive): REJECT. Imminent earnings = IV crush risk.
5. If daysToEarnings is between 8 and 14 (inclusive): trade can qualify but MUST include an earnings warning in the warnings array.
6. If daysToEarnings is 0 or -1: treat as "no near-term earnings risk identified" and proceed normally. (Yahoo's earnings field is unreliable; we filter the real near-term cases via rule 4 when daysToEarnings is a positive small number.)
7. If daysToEarnings is between 1 and 60 (a known future earnings), AND the longest leg expiry of your proposed trade falls AFTER the earnings date: REJECT. The position must not hold through earnings.

## SECTION C — Strike selection (distance-from-spot, NOT delta)

You do NOT have reliable delta data. Use price-distance-from-spot, scaled by IV30. Strikes MUST be values that appear in the provided topContracts data — do not invent.

Per strategy:

- Cash-Secured Put: short put 3-8% BELOW current price. Use upper end (6-8%) when IV30 > 40%, lower end (3-5%) when IV30 < 30%.
- Covered Call: short call 3-7% ABOVE current price.
- Iron Condor: short put 5-10% BELOW spot, short call 5-10% ABOVE spot. Wings: long legs another 2-5% beyond each short.
- Iron Butterfly: short legs AT THE MONEY (within 1% of spot). Wings: 3-7% out from spot.
- Bull Put Spread: short put 3-8% BELOW spot. Long put 2-5% BELOW the short.
- Bear Call Spread: short call 3-8% ABOVE spot. Long call 2-5% ABOVE the short.
- Long Call: strike at-the-money or slightly OTM (0-3% above spot).
- Long Put: strike at-the-money or slightly OTM (0-3% below spot).
- LEAPS: deep ITM — call strike 10-20% BELOW current price.

Additional strike rules:
8. Strike values must come from the topContracts data provided.
9. For high-volatility names (IV30 > 60%), push short strikes to the UPPER end of their range to compensate for larger expected moves.
10. For low-volatility names (IV30 < 25%), short strikes can sit at the LOWER end of their range.

## SECTION D — Risk sizing (hard-capped)

11. Max loss in USD must be <= $${MAX_LOSS_USD}. This is 5% of the $${SIGNAL_CONFIG.DEFAULT_PORTFOLIO_NAV_USD} portfolio NAV (the user's £5,000 GBP at ~1.26 GBP/USD).
12. For credit spreads (Bull Put, Bear Call, Iron Condor, Iron Butterfly): the spread width must be at least 2x the premium received.
13. NEVER recommend naked options. Every short option must have a defined-risk hedge.

## SECTION E — Liquidity gates

14. Each leg's bid-ask spread must be under ${SIGNAL_CONFIG.MAX_BID_ASK_SPREAD_PCT}% of the mid price. Calculate: (ask - bid) / ((ask + bid) / 2) * 100.
15. Each leg's open interest must be >= 100.
16. Each leg's bid must be greater than 0. No untradeable contracts.

## SECTION F — Timing

17. Selling strategies (Sections A1): target 30-45 DTE on entry.
18. Buying strategies (long calls, long puts, debit spreads): target 60-90 DTE.
19. LEAPS: 365-730 DTE.
20. ALWAYS set timing.closeAtDTE = 21 and timing.closeProfitTarget = "50% of max profit". These are non-negotiable Playbook rules.
21. timing.stopLoss = "2x premium received" for credit strategies; "50% of debit paid" for debit strategies.

## SECTION G — Probability of profit (heuristic, not delta-derived)

22. Estimate POP from strike-distance and IV30:
    - Credit spreads / Condors: wider OTM = higher POP. Rough guide — short strike 5% OTM on low-IV (IV30 < 25%) ≈ 70-75% POP; same 5% OTM on high-IV (IV30 > 60%) ≈ 60-65% POP.
    - Iron Butterfly: naturally ~50% POP because of narrow profit zone.
    - Debit spreads / long options: assess directional thesis + how far the breakeven sits from current price. Be honest if it's coin-flip territory.
23. Estimated probability of profit must be >= ${SIGNAL_CONFIG.MIN_PROBABILITY_OF_PROFIT}%. If a credible 65%+ POP can't be constructed: REJECT.

## SECTION H — Self-rated confidence

24. Self-rate your confidence 0-100 based on how cleanly all the data supports the trade.
25. If confidence < ${SIGNAL_CONFIG.MIN_CONFIDENCE}: set qualify=false with a reason. The high floor exists because Phase 1 is paper-trading validation — false approvals here mean wasted analysis cycles, not real money.

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
    "rationale": string (2-4 sentences citing SPECIFIC numbers from the input: IV Rank, IV30, strikes chosen, etc.),
    "warnings": [string] (at least 1; include earnings warning if rule 5 applies),
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
// One call per qualified candidate. The caller (Phase C pipeline) loops.

export async function qualifyWithClaude(
  input: QualificationInput
): Promise<QualificationResult> {
  const userMessage = buildUserMessage(input)

  let rawResponse: string
  try {
    const message = await anthropic.messages.create({
      model: SIGNAL_CONFIG.QUALIFICATION_MODEL,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

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

  return parseAndValidate(rawResponse, input.ticker)
}

// -----------------------------------------------------------------------------
// USER MESSAGE BUILDER
// -----------------------------------------------------------------------------
// Note: we DELIBERATELY omit delta/gamma/theta/vega from the contracts table.
// Yahoo returns these as zero, and including them would mislead the model.
// Strike + bid/ask + IV + OI + DTE is what the Playbook actually uses.

function buildUserMessage(input: QualificationInput): string {
  const lines: string[] = [
    `Evaluate this options trade opportunity against the Playbook:`,
    ``,
    `## Ticker: ${input.ticker}`,
    `Current price: $${input.currentPrice.toFixed(2)}`,
    `IV Rank: ${input.ivRank}/100  (Section A regime determinant)`,
    `IV30: ${input.iv30}%  |  Historical Vol30: ${input.historicalVol30}%`,
    `IV Premium (iv30 - hv30): ${(input.iv30 - input.historicalVol30).toFixed(1)}%`,
    `Put/Call ratio: ${input.putCallRatio.toFixed(2)}`,
    `Days to next earnings: ${input.daysToEarnings >= 0 ? input.daysToEarnings : 'unknown'}`,
    `VIX (market-wide fear gauge): ${input.vix}`,
    `Stage 1 AI scan score: ${input.scanScore}/100`,
    ``,
    `## Available Options Contracts (top ${input.topContracts.length} by liquidity)`,
    `Note: delta/gamma/theta/vega are NOT shown because the data source (Yahoo) does not provide them reliably. Use strike-distance-from-spot + IV30 instead, per Section C of the rules.`,
    ``,
    `strike | type | expiry      | dte | bid   | ask   | OI    | vol   | IV%`,
    `-------|------|-------------|-----|-------|-------|-------|-------|------`,
  ]

  for (const c of input.topContracts) {
    lines.push(
      [
        c.strike.toFixed(2).padStart(6),
        c.type.padEnd(4),
        c.expiry.padEnd(11),
        c.dte.toString().padStart(3),
        c.bid.toFixed(2).padStart(5),
        c.ask.toFixed(2).padStart(5),
        c.openInterest.toString().padStart(5),
        c.volume.toString().padStart(5),
        c.impliedVolatility.toFixed(1).padStart(5),
      ].join(' | ')
    )
  }

  lines.push(
    ``,
    `## Your task`,
    `Apply ALL Playbook rules (Sections A-H). Decide qualify true or false.`,
    `If qualify is false, explain WHY concisely in the reason field, citing the rule number(s).`,
    `If qualify is true, return the full strategy object with the chosen strikes from the table above.`,
    `Hard limits: max loss <= $${MAX_LOSS_USD}, confidence >= ${SIGNAL_CONFIG.MIN_CONFIDENCE}, POP >= ${SIGNAL_CONFIG.MIN_PROBABILITY_OF_PROFIT}%.`,
    `Return ONLY the JSON. No other text.`
  )

  return lines.join('\n')
}

// -----------------------------------------------------------------------------
// PARSE + VALIDATE Claude's response
// -----------------------------------------------------------------------------

function parseAndValidate(raw: string, ticker: string): QualificationResult {
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

  if (!parsed || typeof parsed !== 'object') {
    return { qualify: false, confidence: 0, reason: 'Claude response was not an object' }
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj.qualify !== 'boolean') {
    return { qualify: false, confidence: 0, reason: 'Missing qualify field' }
  }
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 100) {
    return { qualify: false, confidence: 0, reason: 'Invalid confidence value' }
  }

  if (!obj.qualify) {
    return {
      qualify: false,
      confidence: obj.confidence,
      reason: typeof obj.reason === 'string' ? obj.reason : 'No reason given',
    }
  }

  if (!obj.strategy || typeof obj.strategy !== 'object') {
    return {
      qualify: false,
      confidence: obj.confidence,
      reason: 'qualify=true but no strategy object returned',
    }
  }

  if (obj.confidence < SIGNAL_CONFIG.MIN_CONFIDENCE) {
    return {
      qualify: false,
      confidence: obj.confidence,
      reason: `Confidence ${obj.confidence} below floor of ${SIGNAL_CONFIG.MIN_CONFIDENCE}`,
    }
  }

  return {
    qualify: true,
    confidence: obj.confidence,
    strategy: obj.strategy as QualificationResult['strategy'],
  }
}
