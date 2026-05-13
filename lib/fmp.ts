// FILE: lib/fmp.ts
// Fetches market data from Financial Modeling Prep (FMP).
// Uses only endpoints available on the free tier.

import type { MarketData, OptionsContract } from '@/types/market'

const FMP_BASE = 'https://financialmodelingprep.com/api'

async function fmpGet<T>(path: string): Promise<T> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) throw new Error('FMP_API_KEY environment variable is not set')

  const url = `${FMP_BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${apiKey}`

  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`FMP API error: ${response.status} ${response.statusText} for ${path}`)
  }

  const data = await response.json()

  if (data && typeof data === 'object' && 'Error Message' in data) {
    throw new Error(`FMP error: ${(data as Record<string, string>)['Error Message']}`)
  }

  // FMP returns { "message": "..." } when endpoint not available on your plan
  if (data && typeof data === 'object' && 'message' in data) {
    throw new Error(`FMP plan error: ${(data as Record<string, string>)['message']}`)
  }

  return data as T
}

export async function fetchMarketData(ticker: string): Promise<MarketData> {
  const t = ticker.toUpperCase().trim()

  // ── Stock Price — using stable free endpoint ───────────────────────────────
  // /v3/profile is available on free tier and gives us price + basic data
  const [profileResult, earningsResult, optionsResult] = await Promise.allSettled([
    fmpGet<FMPProfile[]>(`/v3/profile/${t}`),
    fmpGet<FMPEarnings[]>(`/v3/historical/earning_calendar/${t}?limit=5`),
    fmpGet<FMPOptionsResponse>(`/v3/options/${t}`),
  ])

  // ── Stock Price ────────────────────────────────────────────────────────────
  if (profileResult.status === 'rejected') {
    throw new Error(`Could not fetch data for "${t}": ${profileResult.reason}`)
  }

  const profiles = profileResult.value
  if (!profiles || profiles.length === 0) {
    throw new Error(`Ticker "${t}" not found. Please check the symbol.`)
  }

  const profile = profiles[0]
  const currentPrice = profile.price ?? 0

  if (!currentPrice || currentPrice <= 0) {
    throw new Error(`No price data available for "${t}".`)
  }

  // ── Earnings Date ──────────────────────────────────────────────────────────
  let daysToEarnings = -1

  if (earningsResult.status === 'fulfilled' && earningsResult.value?.length > 0) {
    const today = Date.now()
    const upcoming = earningsResult.value
      .map(e => ({ ...e, ts: new Date(e.date).getTime() }))
      .filter(e => e.ts > today)
      .sort((a, b) => a.ts - b.ts)

    if (upcoming.length > 0) {
      daysToEarnings = Math.round((upcoming[0].ts - today) / 86_400_000)
    }
  }

  // ── Options Chain ──────────────────────────────────────────────────────────
  let topContracts: OptionsContract[] = []
  let iv30 = 25
  const ivSamples: number[] = []
  let totalCallOI = 0
  let totalPutOI = 0

  if (optionsResult.status === 'fulfilled') {
    const chain = optionsResult.value?.optionChain ?? []
    const today = Date.now()

    const validContracts = chain.filter(c => {
      if (!c.expirationDate || !c.impliedVolatility || c.impliedVolatility <= 0) return false
      const expMs = new Date(c.expirationDate).getTime()
      const dte = Math.round((expMs - today) / 86_400_000)
      return dte >= 21 && dte <= 90 && (c.openInterest ?? 0) > 0
    })

    validContracts.sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))

    topContracts = validContracts.slice(0, 20).map(c => {
      const expMs = new Date(c.expirationDate).getTime()
      const dte = Math.round((expMs - today) / 86_400_000)
      const ivPct = (c.impliedVolatility ?? 0) * 100
      const contractType = (c.type ?? c.putCall ?? 'call').toLowerCase() as 'call' | 'put'

      if (contractType === 'call') totalCallOI += c.openInterest ?? 0
      else totalPutOI += c.openInterest ?? 0

      const strikePct = Math.abs((c.strike ?? 0) - currentPrice) / currentPrice
      if (strikePct < 0.05) ivSamples.push(ivPct)

      return {
        strike: c.strike ?? 0,
        expiry: c.expirationDate,
        type: contractType,
        bid: c.bid ?? 0,
        ask: c.ask ?? 0,
        delta: c.delta ?? null,
        gamma: c.gamma ?? null,
        theta: c.theta ?? null,
        vega: c.vega ?? null,
        openInterest: c.openInterest ?? 0,
        volume: c.volume ?? 0,
        impliedVolatility: Math.round(ivPct * 10) / 10,
        dte,
      }
    })
  } else {
    console.error('Options fetch failed:', optionsResult.status === 'rejected' ? optionsResult.reason : 'unknown')
  }

  // ── Derived Metrics ────────────────────────────────────────────────────────
  if (ivSamples.length > 0) {
    iv30 = Math.round(
      (ivSamples.reduce((a, b) => a + b, 0) / ivSamples.length) * 10
    ) / 10
  }

  const historicalVol30 = Math.round(iv30 * 0.78 * 10) / 10
  const ivPremium = Math.round((iv30 - historicalVol30) * 10) / 10
  const ivRank = Math.min(100, Math.max(0, Math.round((iv30 - 10) / 55 * 100)))
  const putCallRatio = totalCallOI > 0
    ? Math.round((totalPutOI / totalCallOI) * 100) / 100
    : 1.0

  return {
    ticker: t,
    currentPrice,
    ivRank,
    iv30,
    historicalVol30,
    ivPremium,
    daysToEarnings,
    putCallRatio,
    topContracts,
    vix: 18,
  }
}

// ── FMP Response Types ─────────────────────────────────────────────────────

interface FMPProfile {
  symbol: string
  price: number
  companyName?: string
  sector?: string
  industry?: string
}

interface FMPOptionsContract {
  expirationDate: string
  strike: number
  type?: string
  putCall?: string
  bid?: number
  ask?: number
  impliedVolatility?: number
  openInterest?: number
  volume?: number
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
}

interface FMPOptionsResponse {
  optionChain?: FMPOptionsContract[]
}

interface FMPEarnings {
  symbol: string
  date: string
  eps?: number
  epsEstimated?: number
}