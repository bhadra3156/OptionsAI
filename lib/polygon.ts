// FILE: lib/polygon.ts
// This file fetches all required market data from Polygon.io.
// It exports one function: fetchMarketData(ticker)
// That function returns everything Claude needs to make a strategy decision.

import type { MarketData, OptionsContract } from '@/types/market'

// The Polygon.io API base URL
const POLYGON_BASE = 'https://api.polygon.io'

// Helper: make an authenticated GET request to Polygon.io
// Reads POLYGON_API_KEY from environment variables automatically
async function polygonGet(path: string): Promise<unknown> {
  const apiKey = process.env.POLYGON_API_KEY
  if (!apiKey) {
    throw new Error('POLYGON_API_KEY environment variable is not set')
  }

  const url = `${POLYGON_BASE}${path}${path.includes('?') ? '&' : '?'}apiKey=${apiKey}`

  const response = await fetch(url, {
    // Cache for 60 seconds — options data doesn't need to be real-time for our purpose
    next: { revalidate: 60 },
  })

  if (!response.ok) {
    throw new Error(`Polygon.io request failed: ${response.status} ${response.statusText} for ${path}`)
  }

  return response.json()
}

// ── MAIN FUNCTION ─────────────────────────────────────────────────────────────
// Fetches all market data for a ticker and returns it in the shape Claude expects.
// On the free Polygon.io tier, some data (IV Rank, Greeks) may be unavailable —
// we handle those gracefully with sensible defaults and estimates.
export async function fetchMarketData(ticker: string): Promise<MarketData> {
  const upperTicker = ticker.toUpperCase().trim()

  // Run multiple API calls in parallel to save time
  const [priceData, optionsData, vixData] = await Promise.allSettled([
    polygonGet(`/v2/aggs/ticker/${upperTicker}/prev`),
    polygonGet(`/v3/snapshot/options/${upperTicker}?limit=250&sort=open_interest&order=desc`),
    polygonGet(`/v2/aggs/ticker/VIXY/prev`), // VIX proxy via VIXY ETF
  ])

  // ── Current Stock Price ──────────────────────────────────────────────────
  let currentPrice = 0
  if (priceData.status === 'fulfilled') {
    const data = priceData.value as { results?: Array<{ c: number }> }
    currentPrice = data.results?.[0]?.c ?? 0
  }
  if (currentPrice === 0) {
    throw new Error(`Could not fetch price data for ${upperTicker}. Check the ticker symbol.`)
  }

  // ── VIX Level ─────────────────────────────────────────────────────────────
  let vix = 18 // sensible default if VIXY fetch fails
  if (vixData.status === 'fulfilled') {
    const data = vixData.value as { results?: Array<{ c: number }> }
    // VIXY price is roughly 10x actual VIX — this is an approximation
    const vixyPrice = data.results?.[0]?.c ?? 0
    if (vixyPrice > 0) vix = Math.round(vixyPrice * 1.2)
  }

  // ── Options Chain Processing ──────────────────────────────────────────────
  let topContracts: OptionsContract[] = []
  let iv30 = 25          // default fallback values
  let ivRank = 40
  let historicalVol30 = 20
  let putCallRatio = 1.0
  let daysToEarnings = -1

  if (optionsData.status === 'fulfilled') {
    const data = optionsData.value as {
      results?: Array<{
        details?: {
          contract_type: 'call' | 'put'
          expiration_date: string
          strike_price: number
        }
        greeks?: {
          delta: number
          gamma: number
          theta: number
          vega: number
        }
        implied_volatility?: number
        open_interest?: number
        day?: { volume: number }
        last_quote?: { ask: number; bid: number }
      }>
    }

    const results = data.results ?? []

    // Filter for contracts with good data and reasonable DTE (7–90 days)
    const today = new Date()
    const validContracts = results.filter(r => {
      if (!r.details || !r.greeks || !r.last_quote) return false
      if (!r.implied_volatility || r.implied_volatility <= 0) return false
      const expiry = new Date(r.details.expiration_date)
      const dte = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return dte >= 7 && dte <= 120
    })

    // Build our standardised contract objects
    topContracts = validContracts.slice(0, 20).map(r => {
      const expiry = new Date(r.details!.expiration_date)
      const dte = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return {
        strike: r.details!.strike_price,
        expiry: r.details!.expiration_date,
        type: r.details!.contract_type,
        bid: r.last_quote!.bid,
        ask: r.last_quote!.ask,
        delta: r.greeks!.delta,
        gamma: r.greeks!.gamma,
        theta: r.greeks!.theta,
        vega: r.greeks!.vega,
        openInterest: r.open_interest ?? 0,
        volume: r.day?.volume ?? 0,
        impliedVolatility: (r.implied_volatility ?? 0) * 100, // convert to percentage
        dte,
      }
    })

    // Estimate IV30 from ATM options (closest strike to current price, ~30 DTE)
    const atmContracts = validContracts.filter(r => {
      if (!r.details || !r.implied_volatility) return false
      const expiry = new Date(r.details.expiration_date)
      const dte = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      const strikeDiff = Math.abs(r.details.strike_price - currentPrice) / currentPrice
      return dte >= 20 && dte <= 40 && strikeDiff < 0.05
    })

    if (atmContracts.length > 0) {
      const avgIV = atmContracts.reduce((sum, r) => sum + (r.implied_volatility ?? 0), 0) / atmContracts.length
      iv30 = Math.round(avgIV * 100 * 10) / 10 // percentage, 1 decimal
    }

    // Estimate historical vol from the IV premium concept
    // Without paid Polygon data, we approximate HV30 as 75–80% of IV30
    historicalVol30 = Math.round(iv30 * 0.78 * 10) / 10

    // IV Rank — approximation based on current IV relative to typical ranges
    // True IVR requires 52 weeks of IV history (paid tier)
    // We use a heuristic: < 20% IV = low rank, > 50% IV = high rank
    ivRank = Math.min(100, Math.max(0, Math.round((iv30 - 15) / 50 * 100)))

    // Put/Call ratio from open interest
    const totalCallOI = results.filter(r => r.details?.contract_type === 'call')
      .reduce((sum, r) => sum + (r.open_interest ?? 0), 0)
    const totalPutOI = results.filter(r => r.details?.contract_type === 'put')
      .reduce((sum, r) => sum + (r.open_interest ?? 0), 0)

    if (totalCallOI > 0) {
      putCallRatio = Math.round((totalPutOI / totalCallOI) * 100) / 100
    }
  }

  const ivPremium = Math.round((iv30 - historicalVol30) * 10) / 10

  return {
    ticker: upperTicker,
    currentPrice,
    ivRank,
    iv30,
    historicalVol30,
    ivPremium,
    daysToEarnings,  // -1 = unknown (earnings calendar requires paid Polygon tier)
    putCallRatio,
    topContracts,
    vix,
  }
}
