// FILE: lib/signals/fetch.ts
// =============================================================================
// Signals-specific Yahoo Finance fetcher
// =============================================================================
// This is a parallel implementation of lib/yahoo.ts's fetchMarketData(),
// SPECIFICALLY tuned for the /signals pipeline's needs.
//
// Why a separate file rather than extending the shared yahoo.ts:
//   The /dashboard page works against the existing fetcher's expiry selection
//   (it picks the first 21-90 DTE expiry, which tends to be 22-28 DTE).
//   /signals needs to evaluate trades against 30-45 DTE specifically (per
//   Playbook Section F, Rule 17). Touching yahoo.ts would risk altering
//   what /dashboard displays. Separation = safety.
//
// What differs from lib/yahoo.ts:
//   - Prefers 30-45 DTE expiries, with documented fallbacks
//   - Returns the same MarketData shape so the pipeline doesn't need to know
//
// What's the same:
//   - Same Yahoo authentication (cookie+crumb session)
//   - Same User-Agent string
//   - Same defensive null-handling on the response shapes
// =============================================================================

import type { MarketData, OptionsContract } from '@/types/market'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// -----------------------------------------------------------------------------
// SESSION MANAGEMENT
// -----------------------------------------------------------------------------

async function getYahooSession(): Promise<{ cookie: string; crumb: string }> {
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
    cache: 'no-store',
  })

  const cookies = cookieRes.headers.get('set-cookie') ?? ''
  const cookieStr = cookies
    .split(',')
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')

  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookieStr,
    },
    cache: 'no-store',
  })

  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<')) {
    throw new Error('Failed to get Yahoo Finance session')
  }
  return { cookie: cookieStr, crumb }
}

async function yahooGet(url: string, cookie: string, crumb: string): Promise<unknown> {
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(crumb)}`

  const response = await fetch(fullUrl, {
    headers: {
      'User-Agent': USER_AGENT,
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

// -----------------------------------------------------------------------------
// EXPIRY SELECTION — the key difference from lib/yahoo.ts
// -----------------------------------------------------------------------------
// Priority order for /signals:
//   1. First expiry in 30-45 DTE (Playbook target for selling strategies)
//   2. First expiry in 25-50 DTE (slightly wider fallback)
//   3. First expiry in 21-60 DTE (broader fallback)
//   4. First expiry > 21 days out (last resort)
//   5. null (caller decides how to handle no data)

function pickPreferredExpiry(allExpiries: number[]): number | null {
  const nowSecs = Math.floor(Date.now() / 1000)
  const daysFromNow = (ts: number) => Math.round((ts - nowSecs) / 86_400)

  // Strict: 30-45 DTE
  const strict = allExpiries.find(ts => {
    const d = daysFromNow(ts)
    return d >= 30 && d <= 45
  })
  if (strict) return strict

  // Wider: 25-50 DTE
  const wider = allExpiries.find(ts => {
    const d = daysFromNow(ts)
    return d >= 25 && d <= 50
  })
  if (wider) return wider

  // Broad: 21-60 DTE
  const broad = allExpiries.find(ts => {
    const d = daysFromNow(ts)
    return d >= 21 && d <= 60
  })
  if (broad) return broad

  // Anything > 21 days out
  const fallback = allExpiries.find(ts => daysFromNow(ts) >= 21)
  return fallback ?? null
}

// -----------------------------------------------------------------------------
// MAIN ENTRY POINT
// -----------------------------------------------------------------------------

interface OptionsResponse {
  optionChain?: {
    result?: Array<{
      quote?: { earningsTimestamp?: number }
      expirationDates?: number[]
      options?: Array<{ calls?: RawContract[]; puts?: RawContract[] }>
    }>
    error?: { description?: string }
  }
}

interface RawContract {
  contractType?: 'call' | 'put'
  strike?: number
  expiration?: number
  bid?: number
  ask?: number
  impliedVolatility?: number
  openInterest?: number
  volume?: number
}

export async function fetchMarketDataForSignals(ticker: string): Promise<MarketData> {
  const t = ticker.toUpperCase().trim()
  const { cookie, crumb } = await getYahooSession()

  // ===== Stock price =====
  const priceData = (await yahooGet(
    `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=2d`,
    cookie,
    crumb
  )) as {
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

  // ===== Options chain =====
  let daysToEarnings = -1
  let topContracts: OptionsContract[] = []
  let iv30 = 25
  const ivSamples: number[] = []
  let totalCallOI = 0
  let totalPutOI = 0

  try {
    // Step A: discover expiries
    const firstPage = (await yahooGet(
      `https://query2.finance.yahoo.com/v7/finance/options/${t}`,
      cookie,
      crumb
    )) as OptionsResponse

    const optResult = firstPage.optionChain?.result?.[0]
    if (!optResult) throw new Error('No options data returned')

    // Earnings date (best-effort; Yahoo's data here is unreliable)
    const earningsTs = optResult.quote?.earningsTimestamp
    if (earningsTs && earningsTs > 0) {
      const diff = Math.round((earningsTs * 1000 - Date.now()) / 86_400_000)
      if (diff > 0) daysToEarnings = diff
    }

    // Pick the preferred expiry per Playbook
    const allExpiries = optResult.expirationDates ?? []
    const expiryToFetch = pickPreferredExpiry(allExpiries)
    if (!expiryToFetch) {
      throw new Error('No suitable expiry available (none >= 21 DTE)')
    }

    // Step B: fetch that specific expiry
    const targetPage = (await yahooGet(
      `https://query2.finance.yahoo.com/v7/finance/options/${t}?date=${expiryToFetch}`,
      cookie,
      crumb
    )) as OptionsResponse

    const targetResult = targetPage.optionChain?.result?.[0]
    const rawOptions = targetResult?.options?.[0]

    if (rawOptions) {
      const calls = (rawOptions.calls ?? []).map(c => ({ ...c, contractType: 'call' as const }))
      const puts = (rawOptions.puts ?? []).map(p => ({ ...p, contractType: 'put' as const }))
      const allContracts = [...calls, ...puts]
      const today = Date.now()

      topContracts = allContracts
        .filter(c => {
          if (!c.expiration || !c.impliedVolatility || c.impliedVolatility <= 0.005) return false
          const dte = Math.round((c.expiration * 1000 - today) / 86_400_000)
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

          // We do NOT populate delta/gamma/theta/vega — Yahoo doesn't return them.
          // The Playbook-aligned qualify.ts uses strike-distance + IV30 instead.
          return {
            strike: c.strike ?? 0,
            expiry: new Date(c.expiration! * 1000).toISOString().split('T')[0],
            type: c.contractType,
            bid: c.bid ?? 0,
            ask: c.ask ?? 0,
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0,
            openInterest: c.openInterest ?? 0,
            volume: c.volume ?? 0,
            impliedVolatility: Math.round(ivPct * 10) / 10,
            dte,
          }
        })
    }
  } catch (err) {
    console.error('[signals/fetch] options chain failed:', err instanceof Error ? err.message : err)
  }

  // ===== Derived metrics =====
  if (ivSamples.length > 0) {
    iv30 = Math.round((ivSamples.reduce((a, b) => a + b, 0) / ivSamples.length) * 10) / 10
  }

  const historicalVol30 = Math.round(iv30 * 0.78 * 10) / 10
  const ivPremium = Math.round((iv30 - historicalVol30) * 10) / 10
  const ivRank = Math.min(100, Math.max(0, Math.round(((iv30 - 10) / 55) * 100)))
  const putCallRatio = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : 1.0

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
    vix: 18, // matches lib/yahoo.ts behaviour — pipeline injects real VIX later
  }
}
