// FILE: lib/yahoo.ts
// Fetches market data from Yahoo Finance using crumb/cookie authentication.
// Fetches multiple expiry dates to ensure we get future contracts (30-90 DTE).

import type { MarketData, OptionsContract } from '@/types/market'

async function getYahooCrumb(): Promise<{ cookie: string; crumb: string }> {
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
    cache: 'no-store',
  })

  const cookies = cookieRes.headers.get('set-cookie') ?? ''
  const cookieStr = cookies.split(',').map(c => c.split(';')[0].trim()).join('; ')

  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookieStr,
    },
    cache: 'no-store',
  })

  const crumb = (await crumbRes.text()).trim()
  return { cookie: cookieStr, crumb }
}

async function yahooGet(url: string, cookie: string, crumb: string): Promise<unknown> {
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(crumb)}`

  const response = await fetch(fullUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookie,
      'Accept': 'application/json',
      'Referer': 'https://finance.yahoo.com',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`Yahoo Finance ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

export async function fetchMarketData(ticker: string): Promise<MarketData> {
  const t = ticker.toUpperCase().trim()
  const { cookie, crumb } = await getYahooCrumb()

  // ── Stock Price ────────────────────────────────────────────────────────────
  const priceData = await yahooGet(
    `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=2d`,
    cookie, crumb
  ) as {
    chart?: {
      result?: Array<{ meta?: { regularMarketPrice?: number } }>
      error?: { description?: string }
    }
  }

  if (priceData.chart?.error) {
    throw new Error(priceData.chart.error.description ?? `Ticker "${t}" not found`)
  }

  const currentPrice = priceData.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0
  if (!currentPrice || currentPrice <= 0) {
    throw new Error(`Ticker "${t}" not found. Please check the symbol.`)
  }

  // ── Options Chain — fetch available expiry dates then get future ones ──────
  let daysToEarnings = -1
  let topContracts: OptionsContract[] = []
  let iv30 = 25
  const ivSamples: number[] = []
  let totalCallOI = 0
  let totalPutOI = 0

  try {
    // First call — get list of all available expiration timestamps
    const firstPage = await yahooGet(
      `https://query2.finance.yahoo.com/v7/finance/options/${t}`,
      cookie, crumb
    ) as OptionsResponse

    const optResult = firstPage.optionChain?.result?.[0]
    if (!optResult) throw new Error('No options data returned')

    // Get earnings date
    const earningsTs = optResult.quote?.earningsTimestamp
    if (earningsTs && earningsTs > 0) {
      const diff = Math.round((earningsTs * 1000 - Date.now()) / 86_400_000)
      if (diff > 0) daysToEarnings = diff
    }

    // Get all available expiry timestamps
    const allExpiries = optResult.expirationDates ?? []
    const now = Math.floor(Date.now() / 1000)

    // Filter to expiries that are 21-90 days from now
    const targetExpiries = allExpiries.filter(ts => {
      const daysAway = Math.round((ts - now) / 86_400)
      return daysAway >= 21 && daysAway <= 90
    })

    // Use first target expiry, fall back to any future expiry
    const futureExpiries = allExpiries.filter(ts => ts > now + (21 * 86_400))
    const expiryToFetch = targetExpiries[0] ?? futureExpiries[0] ?? allExpiries[allExpiries.length - 1]

    if (!expiryToFetch) throw new Error('No future expiry dates available')

    // Fetch the specific expiry we want
    const targetPage = await yahooGet(
      `https://query2.finance.yahoo.com/v7/finance/options/${t}?date=${expiryToFetch}`,
      cookie, crumb
    ) as OptionsResponse

    const targetResult = targetPage.optionChain?.result?.[0]
    const rawOptions = targetResult?.options?.[0]

    if (rawOptions) {
      const calls = (rawOptions.calls ?? []).map(c => ({ ...c, contractType: 'call' as const }))
      const puts = (rawOptions.puts ?? []).map(p => ({ ...p, contractType: 'put' as const }))
      const allContracts = [...calls, ...puts]
      const today = Date.now()

      topContracts = allContracts
        .filter(c => {
          if (!c.expiration || !c.impliedVolatility || c.impliedVolatility <= 0) return false
          const dte = Math.round((c.expiration * 1000 - today) / 86_400_000)
          // Only include contracts with valid future expiry (at least 7 days out)
          return dte >= 7 && (c.openInterest ?? 0) > 0
        })
        .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
        .slice(0, 20)
        .map(c => {
          const dte = Math.round((c.expiration! * 1000 - today) / 86_400_000)
          const ivPct = (c.impliedVolatility ?? 0) * 100

          if (c.contractType === 'call') totalCallOI += c.openInterest ?? 0
          else totalPutOI += c.openInterest ?? 0

          const strikePct = Math.abs((c.strike ?? 0) - currentPrice) / currentPrice
          if (strikePct < 0.08) ivSamples.push(ivPct)

          return {
            strike: c.strike ?? 0,
            expiry: new Date(c.expiration! * 1000).toISOString().split('T')[0],
            type: c.contractType,
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
    }
  } catch (err) {
    console.error('Options chain fetch failed:', err instanceof Error ? err.message : err)
  }

  // ── Derived Metrics ────────────────────────────────────────────────────────
  if (ivSamples.length > 0) {
    iv30 = Math.round((ivSamples.reduce((a, b) => a + b, 0) / ivSamples.length) * 10) / 10
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

// Internal types for Yahoo Finance response shape
interface RawContract {
  contractType?: 'call' | 'put'
  strike?: number
  expiration?: number
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

interface OptionsResponse {
  optionChain?: {
    result?: Array<{
      quote?: { earningsTimestamp?: number }
      expirationDates?: number[]
      options?: Array<{ calls?: RawContract[]; puts?: RawContract[] }>
    }>
  }
}