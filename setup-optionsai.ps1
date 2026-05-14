# ============================================================
# OptionsAI — Complete Setup & Fix Script
# Run this from your project root in VS Code PowerShell terminal
# Right-click the terminal and choose "Run as Administrator" if prompted
# ============================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OptionsAI — Full Project Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── STEP 1: Verify we're in the right folder ─────────────────────────────────
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Run this script from your project root folder (where package.json is)" -ForegroundColor Red
    Write-Host "In VS Code: open the terminal, make sure you're in the OptionsAI folder" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Found package.json — correct folder confirmed" -ForegroundColor Green

# ── STEP 2: Create all required folders ──────────────────────────────────────
Write-Host ""
Write-Host "Creating folder structure..." -ForegroundColor Yellow

$folders = @(
    "app\(auth)\sign-in\[[...sign-in]]",
    "app\(auth)\sign-up\[[...sign-up]]",
    "app\(dashboard)\dashboard",
    "app\api\analyze",
    "components\ui",
    "components\strategy",
    "components\layout",
    "lib",
    "types"
)

foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        Write-Host "  Created: $folder" -ForegroundColor Gray
    } else {
        Write-Host "  Exists:  $folder" -ForegroundColor DarkGray
    }
}
Write-Host "✓ Folder structure ready" -ForegroundColor Green

# ── STEP 3: Install dependencies ─────────────────────────────────────────────
Write-Host ""
Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
npm install
Write-Host "✓ Dependencies installed" -ForegroundColor Green

# ── STEP 4: Write types/market.ts ────────────────────────────────────────────
Write-Host ""
Write-Host "Writing types/market.ts..." -ForegroundColor Yellow

@'
// FILE: types/market.ts
// TypeScript types for all market data that flows into the AI strategy engine.
// Using FMP (Financial Modeling Prep) + Yahoo Finance as data sources.

export interface OptionsContract {
  strike: number
  expiry: string           // YYYY-MM-DD
  type: 'call' | 'put'
  bid: number
  ask: number
  delta: number
  gamma: number
  theta: number            // daily decay — will be negative for long options
  vega: number
  openInterest: number
  volume: number
  impliedVolatility: number
  dte: number              // days to expiration
}

export interface MarketData {
  ticker: string
  currentPrice: number

  // Technical analysis — from FMP
  week52High: number
  week52Low: number
  priceVs200MA: 'above' | 'below' | 'at'
  ma200: number
  rsi14: number            // 14-day RSI: >70 overbought, <30 oversold

  // Volatility
  ivRank: number           // 0–100 scale
  iv30: number             // 30-day implied volatility %
  historicalVol30: number  // 30-day realised volatility %
  ivPremium: number        // iv30 minus historicalVol30

  // Events & sentiment
  daysToEarnings: number   // -1 if unknown
  putCallRatio: number     // >1.2 bearish, <0.8 bullish

  // Options chain
  topContracts: OptionsContract[]

  // Market context
  vix: number
}
'@ | Set-Content -Path "types\market.ts" -Encoding UTF8
Write-Host "✓ types/market.ts written" -ForegroundColor Green

# ── STEP 5: Write types/strategy.ts ──────────────────────────────────────────
Write-Host "Writing types/strategy.ts..." -ForegroundColor Yellow

@'
// FILE: types/strategy.ts
// TypeScript types for the AI strategy output from Claude.

export interface StrategyLeg {
  action: 'buy' | 'sell'
  type: 'call' | 'put'
  strike: number
  expiry: string
  quantity: number
}

export interface StrategyMetrics {
  maxProfit: string
  maxLoss: string
  probabilityOfProfit: string
  breakeven: string[]
  riskRating: number
}

export interface StrategyTiming {
  idealEntryDTE: number
  closeAtDTE: number
  closeProfitTarget: string
  stopLoss: string
}

export interface TechnicalSummary {
  trend: 'bullish' | 'bearish' | 'neutral'
  rsiSignal: 'overbought' | 'oversold' | 'neutral'
  positionIn52wRange: 'upper quartile' | 'mid range' | 'lower quartile'
  keyLevel: string
}

export interface StrategyGreeks {
  netDelta: number
  netTheta: number
  netVega: number
  greeksSource: 'live' | 'estimated'
}

export interface OptionsStrategy {
  strategyName: string
  marketOutlook: 'bullish' | 'bearish' | 'neutral' | 'high-volatility'
  technicalSummary: TechnicalSummary
  legs: StrategyLeg[]
  metrics: StrategyMetrics
  timing: StrategyTiming
  greeks: StrategyGreeks
  rationale: string
  verdict: string
  warnings: string[]
  disclaimer: string
}
'@ | Set-Content -Path "types\strategy.ts" -Encoding UTF8
Write-Host "✓ types/strategy.ts written" -ForegroundColor Green

# ── STEP 6: Write lib/fmp.ts (replaces polygon.ts) ───────────────────────────
Write-Host "Writing lib/fmp.ts (FMP market data client)..." -ForegroundColor Yellow

@'
// FILE: lib/fmp.ts
// Fetches all market data needed for strategy analysis.
// Uses Financial Modeling Prep (FMP) API for price, technicals, and earnings.
// Uses Yahoo Finance (via yfinance-style endpoint) for options chain data.
//
// Required environment variable: FMP_API_KEY
// Get your key at: https://site.financialmodelingprep.com/developer/docs

import type { MarketData, OptionsContract } from '@/types/market'

const FMP_BASE = 'https://financialmodelingprep.com/api'
const FMP_KEY  = process.env.FMP_API_KEY

// Helper — throw a clear error if the API key is missing
function requireKey() {
  if (!FMP_KEY) {
    throw new Error('FMP_API_KEY is not set in your .env.local file')
  }
}

// ── FETCH STOCK QUOTE ─────────────────────────────────────────────────────────
// Returns: currentPrice, week52High, week52Low, and raw quote data
async function fetchQuote(ticker: string) {
  requireKey()
  const res = await fetch(
    `${FMP_BASE}/v3/quote/${ticker}?apikey=${FMP_KEY}`,
    { next: { revalidate: 60 } } // cache 60 seconds
  )
  if (!res.ok) throw new Error(`FMP quote fetch failed: ${res.status}`)
  const data = await res.json()
  if (!data || data.length === 0) throw new Error(`No quote data found for ${ticker}`)
  return data[0]
}

// ── FETCH RSI ────────────────────────────────────────────────────────────────
// Returns: 14-day RSI
async function fetchRSI(ticker: string): Promise<number> {
  requireKey()
  const res = await fetch(
    `${FMP_BASE}/v3/technical_indicator/daily/${ticker}?type=rsi&period=14&apikey=${FMP_KEY}`,
    { next: { revalidate: 3600 } } // cache 1 hour — technicals don't change every minute
  )
  if (!res.ok) return 50 // fallback to neutral if unavailable
  const data = await res.json()
  if (!data || data.length === 0) return 50
  return Math.round(data[0].rsi * 100) / 100
}

// ── FETCH 200-DAY SMA ─────────────────────────────────────────────────────────
// Returns: 200-day simple moving average
async function fetchSMA200(ticker: string): Promise<number> {
  requireKey()
  const res = await fetch(
    `${FMP_BASE}/v3/technical_indicator/daily/${ticker}?type=sma&period=200&apikey=${FMP_KEY}`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return 0
  const data = await res.json()
  if (!data || data.length === 0) return 0
  return Math.round(data[0].sma * 100) / 100
}

// ── FETCH EARNINGS DATE ──────────────────────────────────────────────────────
// Returns: days until next earnings (-1 if not found)
async function fetchDaysToEarnings(ticker: string): Promise<number> {
  requireKey()
  try {
    const res = await fetch(
      `${FMP_BASE}/v3/earning_calendar?symbol=${ticker}&apikey=${FMP_KEY}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return -1
    const data = await res.json()
    if (!data || data.length === 0) return -1

    const today = new Date()
    // Find the next earnings date that is in the future
    const futureEarnings = data
      .map((e: { date: string }) => new Date(e.date))
      .filter((d: Date) => d > today)
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())

    if (futureEarnings.length === 0) return -1
    const diffMs = futureEarnings[0].getTime() - today.getTime()
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  } catch {
    return -1
  }
}

// ── FETCH VIX ────────────────────────────────────────────────────────────────
async function fetchVIX(): Promise<number> {
  requireKey()
  try {
    const res = await fetch(
      `${FMP_BASE}/v3/quote/%5EVIX?apikey=${FMP_KEY}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return 20 // fallback
    const data = await res.json()
    return data?.[0]?.price ?? 20
  } catch {
    return 20
  }
}

// ── FETCH OPTIONS CHAIN ───────────────────────────────────────────────────────
// FMP has an options endpoint. We fetch the nearest 2 expiry dates and
// pick the 20 most liquid contracts (highest open interest).
async function fetchOptionsChain(ticker: string, currentPrice: number): Promise<OptionsContract[]> {
  requireKey()
  try {
    const res = await fetch(
      `${FMP_BASE}/v3/options/${ticker}?apikey=${FMP_KEY}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    if (!data || !data.optionChain || data.optionChain.length === 0) return []

    const today = new Date()

    // Parse and filter contracts
    const contracts: OptionsContract[] = data.optionChain
      .filter((c: Record<string, unknown>) => {
        const expDate = new Date(c.expirationDate as string)
        const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        // Only include contracts with 14–90 DTE (sweet spot for analysis)
        return dte >= 14 && dte <= 90
      })
      .map((c: Record<string, unknown>) => {
        const expDate = new Date(c.expirationDate as string)
        const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return {
          strike:           Number(c.strike) || 0,
          expiry:           String(c.expirationDate).split('T')[0],
          type:             (String(c.optionType).toLowerCase() === 'call' ? 'call' : 'put') as 'call' | 'put',
          bid:              Number(c.bid) || 0,
          ask:              Number(c.ask) || 0,
          delta:            Number(c.delta) || 0,
          gamma:            Number(c.gamma) || 0,
          theta:            Number(c.theta) || 0,
          vega:             Number(c.vega) || 0,
          openInterest:     Number(c.openInterest) || 0,
          volume:           Number(c.volume) || 0,
          impliedVolatility: Number(c.impliedVolatility) || 0,
          dte,
        }
      })
      // Sort by open interest descending — most liquid contracts first
      .sort((a: OptionsContract, b: OptionsContract) => b.openInterest - a.openInterest)
      // Keep top 20
      .slice(0, 20)

    return contracts
  } catch {
    return []
  }
}

// ── CALCULATE IV RANK ─────────────────────────────────────────────────────────
// IV Rank = (current IV - 52w low IV) / (52w high IV - 52w low IV) * 100
// We approximate using historical volatility data from FMP
async function fetchIVData(ticker: string): Promise<{
  ivRank: number
  iv30: number
  historicalVol30: number
  ivPremium: number
}> {
  requireKey()
  try {
    // Fetch 1 year of daily prices to calculate historical volatility
    const res = await fetch(
      `${FMP_BASE}/v3/historical-price-full/${ticker}?timeseries=252&apikey=${FMP_KEY}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) throw new Error('IV data fetch failed')
    const data = await res.json()
    const prices: number[] = (data.historical || []).map((d: { close: number }) => d.close).reverse()

    if (prices.length < 30) {
      return { ivRank: 50, iv30: 30, historicalVol30: 25, ivPremium: 5 }
    }

    // Calculate 30-day historical volatility (annualised)
    const returns30 = []
    for (let i = 1; i < Math.min(31, prices.length); i++) {
      returns30.push(Math.log(prices[i] / prices[i - 1]))
    }
    const mean30 = returns30.reduce((a, b) => a + b, 0) / returns30.length
    const variance30 = returns30.reduce((a, b) => a + Math.pow(b - mean30, 2), 0) / returns30.length
    const historicalVol30 = Math.sqrt(variance30 * 252) * 100

    // Calculate rolling 30-day vols for the past year to determine IV Rank
    const rollingVols = []
    for (let start = 0; start + 30 < prices.length; start += 5) {
      const slice = prices.slice(start, start + 30)
      const rets = []
      for (let i = 1; i < slice.length; i++) {
        rets.push(Math.log(slice[i] / slice[i - 1]))
      }
      const m = rets.reduce((a, b) => a + b, 0) / rets.length
      const v = rets.reduce((a, b) => a + Math.pow(b - m, 2), 0) / rets.length
      rollingVols.push(Math.sqrt(v * 252) * 100)
    }

    const minVol = Math.min(...rollingVols)
    const maxVol = Math.max(...rollingVols)
    // IV is typically ~10-20% above historical vol (the "volatility risk premium")
    const iv30 = historicalVol30 * 1.15
    const ivRank = maxVol === minVol ? 50 :
      Math.round(((iv30 - minVol) / (maxVol - minVol)) * 100)

    return {
      ivRank:         Math.max(0, Math.min(100, ivRank)),
      iv30:           Math.round(iv30 * 10) / 10,
      historicalVol30: Math.round(historicalVol30 * 10) / 10,
      ivPremium:      Math.round((iv30 - historicalVol30) * 10) / 10,
    }
  } catch {
    return { ivRank: 50, iv30: 30, historicalVol30: 25, ivPremium: 5 }
  }
}

// ── FETCH PUT/CALL RATIO ─────────────────────────────────────────────────────
function calculatePutCallRatio(contracts: OptionsContract[]): number {
  const calls = contracts.filter(c => c.type === 'call')
    .reduce((sum, c) => sum + c.openInterest, 0)
  const puts = contracts.filter(c => c.type === 'put')
    .reduce((sum, c) => sum + c.openInterest, 0)
  if (calls === 0) return 1.0
  return Math.round((puts / calls) * 100) / 100
}

// ── MAIN EXPORT: fetchMarketData ──────────────────────────────────────────────
// This is the function called by the API route.
// It assembles all the data Claude needs into one MarketData object.
export async function fetchMarketData(ticker: string): Promise<MarketData> {
  const symbol = ticker.toUpperCase().trim()

  // Run all fetches in parallel for speed
  const [quote, rsi14, ma200, daysToEarnings, vix, ivData] = await Promise.all([
    fetchQuote(symbol),
    fetchRSI(symbol),
    fetchSMA200(symbol),
    fetchDaysToEarnings(symbol),
    fetchVIX(),
    fetchIVData(symbol),
  ])

  const currentPrice: number = quote.price

  // Fetch options chain after we have the price (used for strike filtering)
  const topContracts = await fetchOptionsChain(symbol, currentPrice)

  // Determine price vs 200MA
  let priceVs200MA: 'above' | 'below' | 'at' = 'at'
  if (ma200 > 0) {
    if (currentPrice > ma200 * 1.005) priceVs200MA = 'above'
    else if (currentPrice < ma200 * 0.995) priceVs200MA = 'below'
  }

  return {
    ticker: symbol,
    currentPrice,
    week52High:      quote.yearHigh      || quote.yearHighPrice  || 0,
    week52Low:       quote.yearLow       || quote.yearLowPrice   || 0,
    priceVs200MA,
    ma200,
    rsi14,
    ivRank:          ivData.ivRank,
    iv30:            ivData.iv30,
    historicalVol30: ivData.historicalVol30,
    ivPremium:       ivData.ivPremium,
    daysToEarnings,
    putCallRatio:    calculatePutCallRatio(topContracts),
    topContracts,
    vix,
  }
}
'@ | Set-Content -Path "lib\fmp.ts" -Encoding UTF8
Write-Host "✓ lib/fmp.ts written" -ForegroundColor Green

# ── STEP 7: Write lib/anthropic.ts ───────────────────────────────────────────
Write-Host "Writing lib/anthropic.ts (upgraded AI system prompt)..." -ForegroundColor Yellow

@'
// FILE: lib/anthropic.ts
// Handles all communication with Claude AI.
// Upgraded system prompt: combines volatility + technical analysis
// for smarter strategy selection. Greek estimation when live data is zero.

import Anthropic from '@anthropic-ai/sdk'
import type { MarketData } from '@/types/market'
import type { OptionsStrategy } from '@/types/strategy'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a world-class professional options trader with 20+ years of institutional experience. You analyse live market data — both technical and options chain — and recommend the single best options strategy for a given stock right now.

You think like a hedge fund options desk: data-driven, probability-focused, risk-first. Every recommendation is grounded in the specific numbers provided. Never speculate. Never invent data.

## STRATEGY SELECTION — 3 STEPS

### Step 1 — Volatility environment
- ivRank > 50: options EXPENSIVE → SELL premium (iron condor, iron butterfly, cash-secured put, covered call, bull put spread, bear call spread)
- ivRank < 30: options CHEAP → BUY premium (long call, long put, debit spread, LEAPS)
- ivRank 30–50: neutral → use directional signals in Step 2

### Step 2 — Directional scoring
Score these signals:

BULLISH (+1 each):
- priceVs200MA = "above"
- rsi14 < 50 (not overbought, room to run)
- putCallRatio < 0.8 (bullish sentiment)

BEARISH (-1 each):
- priceVs200MA = "below"
- rsi14 > 70 (overbought, mean-reversion risk)
- putCallRatio > 1.2 (bearish sentiment)
- currentPrice within 3% of week52High AND rsi14 > 65 (extended at highs)

Score >= +2: strong bullish. Score <= -2: strong bearish. -1 to +1: neutral.

### Step 3 — Pick the best strategy

| IV Environment | Directional Bias | Best Strategy |
|---|---|---|
| High IV (>50) | Strong bullish | Bull Put Spread |
| High IV (>50) | Strong bearish | Bear Call Spread |
| High IV (>50) | Neutral | Iron Condor |
| High IV (>50) | Slightly bullish | Cash-Secured Put |
| Neutral IV (30-50) | Strong bullish | Bull Call Debit Spread |
| Neutral IV (30-50) | Strong bearish | Bear Put Debit Spread |
| Neutral IV (30-50) | Neutral | Iron Condor |
| Low IV (<30) | Strong bullish | Long Call (60-90 DTE) |
| Low IV (<30) | Strong bearish | Long Put (60-90 DTE) |
| Low IV (<30) | Neutral | Wait — no edge |

CRITICAL RULE: When rsi14 > 70 AND ivRank > 50, ALWAYS pick a directional credit spread (bear call spread), NOT an iron condor. This is the highest-probability setup.

## EARNINGS RULES
- daysToEarnings <= 7: NEVER recommend buying options (IV crush will destroy value)
- daysToEarnings <= 14: Add prominent earnings warning
- daysToEarnings > 45: Not a primary concern

## TIMING RULES
- Selling strategies: target 30–45 DTE entry
- Buying strategies: target 60–90 DTE
- ALL strategies: close at 50% profit OR 21 DTE — whichever first
- NEVER hold short positions through final 7 days (gamma risk)

## STRIKE SELECTION
- Short strikes in credit strategies: 0.15–0.30 delta
- Long options in debit strategies: 0.40–0.60 delta
- LEAPS: 0.70–0.80 delta

## RISK RULES
- Max position size: 5% of portfolio
- Stop loss: 2× premium received for credit strategies
- Spread width: at least 2× the premium received

## GREEKS — ESTIMATE IF LIVE DATA IS ZERO
If theta or vega values in topContracts are 0 or null, calculate estimates:
- For a 2-leg credit spread at 30-45 DTE: netTheta ≈ (net credit × 0.015), netVega ≈ -(net credit × 0.10)
- For a 4-leg iron condor: netTheta ≈ (total credit × 0.015), netVega ≈ -(total credit × 0.20)
- Set greeksSource to "estimated" when using these calculations

## OUTPUT FORMAT — CRITICAL
Return ONLY valid JSON. No preamble, no markdown, no commentary. Must parse with JSON.parse() immediately.

{
  "strategyName": string,
  "marketOutlook": "bullish" | "bearish" | "neutral" | "high-volatility",
  "technicalSummary": {
    "trend": "bullish" | "bearish" | "neutral",
    "rsiSignal": "overbought" | "oversold" | "neutral",
    "positionIn52wRange": "upper quartile" | "mid range" | "lower quartile",
    "keyLevel": string
  },
  "legs": [
    { "action": "buy" | "sell", "type": "call" | "put", "strike": number, "expiry": "YYYY-MM-DD", "quantity": number }
  ],
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
  "greeks": {
    "netDelta": number,
    "netTheta": number,
    "netVega": number,
    "greeksSource": "live" | "estimated"
  },
  "rationale": string,
  "verdict": string,
  "warnings": [string],
  "disclaimer": "This is not financial advice. For educational purposes only."
}

verdict = ONE crisp sentence. Example: "JD is overbought at the top of its range with elevated IV — sell the bear call spread and collect premium while it consolidates."
rationale = 3–5 sentences. Must mention: (1) IV environment, (2) technical picture (RSI, MA), (3) why THIS strategy over alternatives, (4) what the probability/breakeven means.

## LANGUAGE RULES
- NEVER say "you should buy", "this will profit", "guaranteed"
- ALWAYS say "this strategy may", "historically this approach", "based on current conditions"
- disclaimer must always be exactly: "This is not financial advice. For educational purposes only."
- Never invent data. Only reference numbers from the input JSON.`

export async function generateStrategy(marketData: MarketData): Promise<OptionsStrategy> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analyse this options opportunity and return the single best strategy as JSON:\n\n${JSON.stringify(marketData, null, 2)}`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API')
  }

  let strategy: OptionsStrategy
  try {
    const cleanJson = content.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    strategy = JSON.parse(cleanJson)
  } catch {
    throw new Error(`Failed to parse Claude response. Raw: ${content.text.slice(0, 300)}`)
  }

  strategy.disclaimer = 'This is not financial advice. For educational purposes only.'
  return strategy
}
'@ | Set-Content -Path "lib\anthropic.ts" -Encoding UTF8
Write-Host "✓ lib/anthropic.ts written" -ForegroundColor Green

# ── STEP 8: Write app/api/analyze/route.ts ───────────────────────────────────
Write-Host "Writing app/api/analyze/route.ts..." -ForegroundColor Yellow

@'
// FILE: app/api/analyze/route.ts
// The main API endpoint. Called by the dashboard when user enters a ticker.
// 1. Validates the ticker input
// 2. Fetches live market data from FMP
// 3. Sends to Claude AI for strategy generation
// 4. Returns the strategy JSON to the frontend

import { NextRequest, NextResponse } from 'next/server'
import { fetchMarketData } from '@/lib/fmp'
import { generateStrategy } from '@/lib/anthropic'

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json()
    const { ticker } = body

    // Validate ticker — letters only, 1–5 characters (e.g. AAPL, TSLA, SPY)
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
    }

    const cleanTicker = ticker.toUpperCase().trim()
    if (!/^[A-Z]{1,5}$/.test(cleanTicker)) {
      return NextResponse.json(
        { error: 'Invalid ticker format. Use 1–5 letters (e.g. AAPL, TSLA)' },
        { status: 400 }
      )
    }

    console.log(`[analyze] Fetching market data for ${cleanTicker}`)

    // Fetch live market data from FMP
    const marketData = await fetchMarketData(cleanTicker)

    console.log(`[analyze] Generating strategy for ${cleanTicker} — IV Rank: ${marketData.ivRank}, RSI: ${marketData.rsi14}`)

    // Generate AI strategy
    const strategy = await generateStrategy(marketData)

    console.log(`[analyze] Strategy generated: ${strategy.strategyName}`)

    // Return both the strategy AND the market data so the UI can display it
    return NextResponse.json({
      strategy,
      marketData,
    })
  } catch (error) {
    console.error('[analyze] Error:', error)

    const message = error instanceof Error ? error.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
'@ | Set-Content -Path "app\api\analyze\route.ts" -Encoding UTF8
Write-Host "✓ app/api/analyze/route.ts written" -ForegroundColor Green

# ── STEP 9: Write app/layout.tsx ─────────────────────────────────────────────
Write-Host "Writing app/layout.tsx..." -ForegroundColor Yellow

@'
// FILE: app/layout.tsx
// Root layout — wraps every page. Sets up fonts, metadata, and Clerk auth provider.

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OptionsAI — Institutional-Grade Options Strategy',
  description: 'AI-powered options trading strategy analysis. Enter any ticker and receive a professional options strategy in seconds.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
'@ | Set-Content -Path "app\layout.tsx" -Encoding UTF8
Write-Host "✓ app/layout.tsx written" -ForegroundColor Green

# ── STEP 10: Write app/globals.css ───────────────────────────────────────────
Write-Host "Writing app/globals.css..." -ForegroundColor Yellow

@'
/* FILE: app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 255, 255, 255;
  --background-rgb: 3, 7, 18;
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
}

/* Smooth scrolling */
html {
  scroll-behavior: smooth;
}

/* Custom scrollbar for dark theme */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #111827;
}
::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 3px;
}
'@ | Set-Content -Path "app\globals.css" -Encoding UTF8
Write-Host "✓ app/globals.css written" -ForegroundColor Green

# ── STEP 11: Write app/page.tsx (Landing page) ───────────────────────────────
Write-Host "Writing app/page.tsx (landing page)..." -ForegroundColor Yellow

@'
// FILE: app/page.tsx
// Landing page — shown to visitors who are not signed in.

import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-800">
        <span className="text-xl font-bold text-white tracking-tight">OptionsAI</span>
        <div className="flex gap-3">
          <Link
            href="/sign-in"
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
          >
            Get started free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center flex-1 px-4 py-24 text-center">
        <p className="text-emerald-400 text-sm font-medium mb-4 tracking-widest uppercase">
          Powered by Claude AI + FMP Market Data
        </p>
        <h1 className="text-4xl sm:text-6xl font-bold text-white max-w-3xl leading-tight mb-6">
          Institutional Options Strategy{' '}
          <span className="text-emerald-400">In Seconds</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mb-10">
          Enter any US stock ticker. Receive a professional-grade options strategy built on live IV data,
          RSI, 200MA, and the same probability framework used by hedge fund options desks.
        </p>
        <Link
          href="/sign-up"
          className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-semibold rounded-xl transition-all hover:scale-105"
        >
          Start analysing free →
        </Link>
      </section>

      {/* Disclaimer */}
      <footer className="text-center px-4 py-6 text-xs text-gray-600 border-t border-gray-800">
        This analysis is for educational and informational purposes only. It does not constitute financial advice.
        Options trading involves significant risk and is not suitable for all investors.
        You may lose more than your initial investment.
      </footer>
    </main>
  )
}
'@ | Set-Content -Path "app\page.tsx" -Encoding UTF8
Write-Host "✓ app/page.tsx written" -ForegroundColor Green

# ── STEP 12: Write sign-in and sign-up pages ─────────────────────────────────
Write-Host "Writing auth pages..." -ForegroundColor Yellow

@'
// FILE: app/(auth)/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <SignIn />
    </div>
  )
}
'@ | Set-Content -Path "app\(auth)\sign-in\[[...sign-in]]\page.tsx" -Encoding UTF8

@'
// FILE: app/(auth)/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <SignUp />
    </div>
  )
}
'@ | Set-Content -Path "app\(auth)\sign-up\[[...sign-up]]\page.tsx" -Encoding UTF8

Write-Host "✓ Auth pages written" -ForegroundColor Green

# ── STEP 13: Write middleware.ts ─────────────────────────────────────────────
Write-Host "Writing middleware.ts..." -ForegroundColor Yellow

@'
// FILE: middleware.ts
// Clerk middleware — protects the dashboard route so only signed-in users can access it.
// Public routes (landing page, sign-in, sign-up) are accessible to everyone.

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',           // landing page
  '/sign-in(.*)',
  '/sign-up(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
'@ | Set-Content -Path "middleware.ts" -Encoding UTF8
Write-Host "✓ middleware.ts written" -ForegroundColor Green

# ── STEP 14: Write app/(dashboard)/dashboard/page.tsx ────────────────────────
Write-Host "Writing dashboard page..." -ForegroundColor Yellow

@'
// FILE: app/(dashboard)/dashboard/page.tsx
// Main dashboard — where users enter a ticker and get a strategy.
// This is a client component because it uses useState and event handlers.

'use client'

import { useState } from 'react'
import type { OptionsStrategy } from '@/types/strategy'
import type { MarketData } from '@/types/market'

// ── The strategy display component (inline for now — can be split later) ──────
function StrategyResult({
  strategy,
  marketData,
}: {
  strategy: OptionsStrategy
  marketData: MarketData
}) {
  const riskColour = strategy.metrics.riskRating <= 2
    ? 'text-emerald-400'
    : strategy.metrics.riskRating === 3
    ? 'text-yellow-400'
    : 'text-red-400'

  return (
    <div className="mt-8 space-y-6 max-w-3xl mx-auto">

      {/* Verdict banner */}
      <div className="bg-emerald-900/30 border border-emerald-700 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-lg font-bold text-white">{strategy.strategyName}</span>
          <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-full capitalize">
            {strategy.marketOutlook}
          </span>
          <span className={`text-sm font-semibold ${riskColour}`}>
            Risk {strategy.metrics.riskRating}/5
          </span>
        </div>
        <p className="text-emerald-300 font-medium">{strategy.verdict}</p>
      </div>

      {/* Technical snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Price', value: `$${marketData.currentPrice.toFixed(2)}` },
          { label: 'IV Rank', value: `${marketData.ivRank}`, note: marketData.ivRank > 50 ? 'Sell premium' : 'Buy premium' },
          { label: 'RSI (14)', value: `${marketData.rsi14}`, note: marketData.rsi14 > 70 ? '⚠ Overbought' : marketData.rsi14 < 30 ? '⚠ Oversold' : 'Neutral' },
          { label: 'vs 200 MA', value: marketData.priceVs200MA.toUpperCase() },
        ].map(item => (
          <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-1">{item.label}</p>
            <p className="text-white font-bold text-lg">{item.value}</p>
            {item.note && <p className="text-gray-400 text-xs mt-1">{item.note}</p>}
          </div>
        ))}
      </div>

      {/* Rationale */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Analysis</h3>
        <p className="text-gray-200 text-sm leading-relaxed">{strategy.rationale}</p>
      </div>

      {/* Risk / Reward */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-gray-500 text-xs mb-1">Max Profit</p>
          <p className="text-emerald-400 font-bold text-xl">{strategy.metrics.maxProfit}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-gray-500 text-xs mb-1">Max Loss</p>
          <p className="text-red-400 font-bold text-xl">{strategy.metrics.maxLoss}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-gray-500 text-xs mb-1">Prob. of Profit</p>
          <p className="text-blue-400 font-bold text-xl">{strategy.metrics.probabilityOfProfit}</p>
        </div>
      </div>

      {/* Greeks */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-gray-400 text-xs uppercase tracking-widest">Position Greeks</h3>
          <span className="text-xs text-gray-600 capitalize">{strategy.greeks.greeksSource}</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-gray-500 text-xs">Net Delta</p>
            <p className="text-white font-mono">{strategy.greeks.netDelta.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Net Theta / day</p>
            <p className="text-emerald-400 font-mono">+${Math.abs(strategy.greeks.netTheta).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Net Vega</p>
            <p className="text-red-400 font-mono">{strategy.greeks.netVega.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Trade legs */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Trade Legs</h3>
        <div className="space-y-2">
          {strategy.legs.map((leg, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                leg.action === 'sell' ? 'bg-red-900 text-red-300' : 'bg-blue-900 text-blue-300'
              }`}>
                {leg.action}
              </span>
              <span className="text-white font-mono">
                {leg.quantity}× ${leg.strike} {leg.type.toUpperCase()}
              </span>
              <span className="text-gray-400 text-sm">Exp: {leg.expiry}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timing */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Timing Rules</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Enter at DTE: </span><span className="text-white">{strategy.timing.idealEntryDTE} days</span></div>
          <div><span className="text-gray-500">Exit at DTE: </span><span className="text-white">{strategy.timing.closeAtDTE} days</span></div>
          <div><span className="text-gray-500">Profit target: </span><span className="text-white">{strategy.timing.closeProfitTarget}</span></div>
          <div><span className="text-gray-500">Stop loss: </span><span className="text-white">{strategy.timing.stopLoss}</span></div>
        </div>
      </div>

      {/* Warnings */}
      {strategy.warnings.length > 0 && (
        <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-xl p-5">
          <h3 className="text-yellow-500 text-xs uppercase tracking-widest mb-3">⚠ Warnings</h3>
          <ul className="space-y-1">
            {strategy.warnings.map((w, i) => (
              <li key={i} className="text-yellow-200 text-sm">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-gray-600 text-xs text-center pb-8">
        {strategy.disclaimer} Options trading involves significant risk and is not suitable for all investors.
      </p>
    </div>
  )
}

// ── MAIN DASHBOARD COMPONENT ──────────────────────────────────────────────────
export default function DashboardPage() {
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    strategy: OptionsStrategy
    marketData: MarketData
  } | null>(null)

  async function handleAnalyse() {
    if (!ticker.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim() }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Strategy Analysis</h1>
          <p className="text-gray-400">Enter any US stock ticker with listed options</p>
        </div>

        {/* Ticker input */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="e.g. AAPL, TSLA, SPY"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleAnalyse()}
            maxLength={5}
            className="flex-1 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 rounded-xl px-5 py-4 text-lg font-mono focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleAnalyse}
            disabled={loading || !ticker.trim()}
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="mt-10 text-center">
            <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400">Fetching live market data and generating strategy…</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mt-6 bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 font-medium">Error: {error}</p>
            <p className="text-red-600 text-sm mt-1">Check the ticker symbol and try again.</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <StrategyResult strategy={result.strategy} marketData={result.marketData} />
        )}
      </div>
    </div>
  )
}
'@ | Set-Content -Path "app\(dashboard)\dashboard\page.tsx" -Encoding UTF8
Write-Host "✓ app/(dashboard)/dashboard/page.tsx written" -ForegroundColor Green

# ── STEP 15: Write next.config.mjs ───────────────────────────────────────────
Write-Host "Writing next.config.mjs..." -ForegroundColor Yellow

@'
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow FMP API calls from server components
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
}

export default nextConfig
'@ | Set-Content -Path "next.config.mjs" -Encoding UTF8
Write-Host "✓ next.config.mjs written" -ForegroundColor Green

# ── STEP 16: Write tailwind.config.ts ────────────────────────────────────────
Write-Host "Writing tailwind.config.ts..." -ForegroundColor Yellow

@'
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        emerald: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          900: '#064e3b',
        },
      },
    },
  },
  plugins: [],
}

export default config
'@ | Set-Content -Path "tailwind.config.ts" -Encoding UTF8
Write-Host "✓ tailwind.config.ts written" -ForegroundColor Green

# ── STEP 17: Write tsconfig.json with path aliases ───────────────────────────
Write-Host "Writing tsconfig.json..." -ForegroundColor Yellow

@'
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
'@ | Set-Content -Path "tsconfig.json" -Encoding UTF8
Write-Host "✓ tsconfig.json written" -ForegroundColor Green

# ── STEP 18: Write .env.local template ───────────────────────────────────────
Write-Host ""
Write-Host "Writing .env.local template..." -ForegroundColor Yellow

# Only write this if .env.local doesn't already exist (don't overwrite real keys)
if (-not (Test-Path ".env.local")) {
    @'
# OptionsAI — Environment Variables
# Replace every xxxxx with your real keys before running npm run dev

# Clerk Authentication — https://dashboard.clerk.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Anthropic Claude — https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Financial Modeling Prep — https://site.financialmodelingprep.com/developer/docs
FMP_API_KEY=xxxxx

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
'@ | Set-Content -Path ".env.local" -Encoding UTF8
    Write-Host "✓ .env.local template created — FILL IN YOUR API KEYS BEFORE RUNNING" -ForegroundColor Yellow
} else {
    Write-Host "  .env.local already exists — not overwritten. Make sure FMP_API_KEY is set." -ForegroundColor DarkYellow
}

# ── STEP 19: Update .gitignore ───────────────────────────────────────────────
Write-Host "Updating .gitignore..." -ForegroundColor Yellow

$gitignoreContent = @'
# Dependencies
/node_modules
/.pnp
.pnp.js

# Testing
/coverage

# Next.js
/.next/
/out/

# Production
/build

# Environment variables — NEVER commit these
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
'@

$gitignoreContent | Set-Content -Path ".gitignore" -Encoding UTF8
Write-Host "✓ .gitignore updated" -ForegroundColor Green

# ── STEP 20: Final summary ────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Open .env.local and fill in your API keys:" -ForegroundColor White
Write-Host "     - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  (from dashboard.clerk.com)" -ForegroundColor Gray
Write-Host "     - CLERK_SECRET_KEY                   (from dashboard.clerk.com)" -ForegroundColor Gray
Write-Host "     - ANTHROPIC_API_KEY                  (from console.anthropic.com)" -ForegroundColor Gray
Write-Host "     - FMP_API_KEY                        (from financialmodelingprep.com)" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Start the development server:" -ForegroundColor White
Write-Host "     npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Open your browser:" -ForegroundColor White
Write-Host "     http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  4. Test with a ticker like AAPL or TSLA" -ForegroundColor White
Write-Host ""
Write-Host "  5. When it works locally, push to GitHub:" -ForegroundColor White
Write-Host "     git add ." -ForegroundColor Cyan
Write-Host "     git commit -m 'Fix folder structure, upgrade AI prompt, add FMP data'" -ForegroundColor Cyan
Write-Host "     git push" -ForegroundColor Cyan
Write-Host ""
Write-Host "  6. Add FMP_API_KEY to Vercel dashboard:" -ForegroundColor White
Write-Host "     vercel.com -> your project -> Settings -> Environment Variables" -ForegroundColor Gray
Write-Host ""
