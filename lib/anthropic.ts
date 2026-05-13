// FILE: lib/anthropic.ts
// Two-call AI pipeline:
// Call 1 — web search for market context (news, trend, catalysts)
// Call 2 — strategy generation using options data + market context

import Anthropic from '@anthropic-ai/sdk'
import type { MarketData } from '@/types/market'
import type { OptionsStrategy } from '@/types/strategy'

const anthropic = new Anthropic()

// ── CALL 1: Market Context ─────────────────────────────────────────────────
// Uses Claude's web search tool to find recent news and price action.
// Returns a structured summary the strategy call can use.

interface MarketContext {
  recentTrend: string        // e.g. "Downtrend — down 8% over 3 weeks"
  keyLevels: string          // e.g. "Support $285, resistance $310"
  recentCatalysts: string    // e.g. "iPhone sales miss, China tariff concerns"
  sectorCondition: string    // e.g. "Tech sector weak, Nasdaq down 3% this week"
  analystSentiment: string   // e.g. "12 Buy, 4 Hold, 1 Sell — avg target $340"
  summary: string            // 2-3 sentence overall picture
}

async function getMarketContext(ticker: string, currentPrice: number): Promise<MarketContext> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
      } as never,
    ],
    messages: [
      {
        role: 'user',
        content: `Search for recent market information about ${ticker} stock (currently $${currentPrice}).

Find and summarise:
1. Recent price trend (last 2-4 weeks) — up, down, sideways, % change
2. Key support and resistance price levels
3. Recent news catalysts — earnings, product launches, macro events
4. Current sector/market conditions affecting this stock
5. Analyst consensus — buy/hold/sell ratings and price targets if available

Return ONLY valid JSON, no markdown, parseable by JSON.parse():
{
  "recentTrend": "string — direction and % change over recent weeks",
  "keyLevels": "string — key support and resistance prices",
  "recentCatalysts": "string — recent news events affecting the stock",
  "sectorCondition": "string — sector and broader market context",
  "analystSentiment": "string — analyst ratings and price targets",
  "summary": "string — 2-3 sentence overall picture of current situation"
}`,
      },
    ],
  })

  // Extract the final text response (after web search tool use)
  const textBlock = message.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    // If no text block, return sensible defaults
    return {
      recentTrend: 'Insufficient recent data',
      keyLevels: `Current price $${currentPrice}`,
      recentCatalysts: 'No recent catalysts identified',
      sectorCondition: 'Sector data unavailable',
      analystSentiment: 'Analyst data unavailable',
      summary: `${ticker} is currently trading at $${currentPrice}. No additional market context available.`,
    }
  }

  try {
    const clean = textBlock.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    return JSON.parse(clean) as MarketContext
  } catch {
    // If JSON parse fails, return defaults with whatever text we got
    return {
      recentTrend: 'Data parsing error',
      keyLevels: `Current price $${currentPrice}`,
      recentCatalysts: 'Unable to parse catalyst data',
      sectorCondition: 'Unable to parse sector data',
      analystSentiment: 'Unable to parse analyst data',
      summary: textBlock.text.slice(0, 300),
    }
  }
}

// ── CALL 2: Strategy Generation ────────────────────────────────────────────
// Full strategy prompt — now includes market context from Call 1.

const STRATEGY_SYSTEM_PROMPT = `You are a world-class professional options trader with 20+ years of institutional experience at top-tier trading firms. You analyse live options chain data combined with current market context to recommend the single best options strategy.

Think like a hedge fund options desk: data-driven, probability-focused, risk-first. Every recommendation must be grounded in the specific data provided — both the options metrics AND the market context.

## STRATEGY SELECTION RULES

### Volatility rules
- ivRank > 50 → SELL premium: iron condor, iron butterfly, cash-secured put, covered call, credit spread
- ivRank < 30 → BUY options: long call/put, debit spread, LEAPS
- ivRank 30-50 → use putCallRatio + price trend + market context for directional bias

### Earnings rules
- daysToEarnings <= 7 → NEVER recommend buying options (IV crush risk)
- daysToEarnings <= 14 → add prominent earnings warning
- daysToEarnings = -1 → check market context for earnings clues, warn appropriately

### Timing rules
- Selling strategies → target 30-45 DTE entry
- Buying strategies → target 60-90 DTE
- ALL strategies → close at 50% max profit OR 21 DTE (whichever first)
- NEVER hold short options through final 7 days (gamma risk)

### Strike selection
- Short strikes in credit strategies → 0.15-0.30 delta
- Long options in debit strategies → 0.40-0.60 delta
- LEAPS → 0.70-0.80 delta

### Risk rules
- Max position size: 5% of portfolio
- Stop loss for credit trades: 2x premium received

## RISK RATINGS
1=Covered Call | 2=CSP/IronCondor/IronButterfly | 3=VerticalSpread | 4=LongOption/LEAPS | 5=Naked(avoid)

## HOW TO USE MARKET CONTEXT
The marketContext field gives you real-world information about the stock:
- Use recentTrend to confirm or challenge the directional bias from putCallRatio
- Use keyLevels to place strikes at technically significant prices
- Use recentCatalysts to assess event risk (earnings, product launches, macro)
- Use sectorCondition to assess broader risk
- Reference ALL of this in your rationale — this is what makes the analysis institutional quality

## OUTPUT — CRITICAL
Return ONLY valid JSON. No markdown, no preamble. Must be parseable by JSON.parse() immediately.

{
  "strategyName": string,
  "marketOutlook": "bullish"|"bearish"|"neutral"|"high-volatility",
  "legs": [{"action":"buy"|"sell","type":"call"|"put","strike":number,"expiry":"YYYY-MM-DD","quantity":number}],
  "metrics": {
    "maxProfit": string,
    "maxLoss": string,
    "probabilityOfProfit": string,
    "breakeven": [string],
    "riskRating": number
  },
  "timing": {
    "idealEntryDTE": number,
    "closeAtDTE": number,
    "closeProfitTarget": string,
    "stopLoss": string
  },
  "rationale": "3-5 sentences referencing BOTH options data AND market context — trend, key levels, catalysts, sector conditions",
  "warnings": [string],
  "disclaimer": "This is not financial advice. For educational purposes only."
}

## LANGUAGE RULES
- NEVER say "you should buy", "guaranteed", "will profit"
- ALWAYS say "this strategy may", "historically this approach", "based on current conditions"
- Rationale MUST reference specific prices, levels, and events from the market context`

export async function generateStrategy(marketData: MarketData): Promise<OptionsStrategy> {

  // ── Step 1: Get market context via web search ──────────────────────────
  console.log(`[OptionsAI] Fetching market context for ${marketData.ticker}...`)
  const marketContext = await getMarketContext(marketData.ticker, marketData.currentPrice)
  console.log(`[OptionsAI] Market context retrieved. Generating strategy...`)

  // ── Step 2: Generate strategy with full context ────────────────────────
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: STRATEGY_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analyse this stock and return the single best options strategy as JSON.

## Live Options Data
${JSON.stringify(marketData, null, 2)}

## Current Market Context (from web search)
${JSON.stringify(marketContext, null, 2)}

Use BOTH data sources in your analysis. The rationale must reference specific data points from both.`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API')
  }

  const cleanJson = content.text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()

  let strategy: OptionsStrategy
  try {
    strategy = JSON.parse(cleanJson)
  } catch {
    throw new Error(`Claude returned invalid JSON: ${content.text.slice(0, 300)}`)
  }

  // Always enforce the disclaimer
  strategy.disclaimer = 'This is not financial advice. For educational purposes only.'

  // Attach market context to warnings if useful
  if (marketContext.recentCatalysts && marketContext.recentCatalysts !== 'No recent catalysts identified') {
    const catalystWarning = `Recent catalyst: ${marketContext.recentCatalysts}`
    if (!strategy.warnings.some(w => w.includes('catalyst') || w.includes('earnings'))) {
      strategy.warnings.unshift(catalystWarning)
    }
  }

  return strategy
}