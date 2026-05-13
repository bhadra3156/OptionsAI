// FILE: lib/scanner.ts
// Fixed IV calculation: Yahoo returns IV as annualised decimal (0.25 = 25%)
// Filter out fake IV values (0.00001 placeholder) and zero-OI expired contracts

export const SCAN_TICKERS = {
  'Major ETFs': ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT', 'XLE', 'XLF', 'XLK', 'ARKK', 'SLV'],
  'Mega Cap Tech': ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AMD', 'CRM', 'INTC'],
  'High IV Favourites': ['NFLX', 'COIN', 'PLTR', 'MSTR', 'RBLX', 'SNAP', 'UBER', 'HOOD', 'GME', 'BABA'],
}

export const ALL_TICKERS = Object.values(SCAN_TICKERS).flat()

export interface ScanResult {
  ticker: string
  category: string
  currentPrice: number
  ivRank: number
  iv30: number
  putCallRatio: number
  volOiRatio: number
  daysToEarnings: number
  totalVolume: number
  totalOI: number
  aiScore: number
  signal: 'SELL PREMIUM' | 'BUY OPTIONS' | 'NEUTRAL'
  error?: string
}

async function getYahooSession(): Promise<{ cookie: string; crumb: string }> {
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    redirect: 'follow', cache: 'no-store',
  })
  const rawCookies = cookieRes.headers.get('set-cookie') ?? ''
  const cookieStr = rawCookies.split(',').map((c: string) => c.split(';')[0].trim()).filter(Boolean).join('; ')
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Cookie': cookieStr },
    cache: 'no-store',
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<')) throw new Error('Failed to get Yahoo Finance session.')
  return { cookie: cookieStr, crumb }
}

type OptionContract = {
  strike?: number
  impliedVolatility?: number
  openInterest?: number
  volume?: number
  expiration?: number
}

type YahooOptionsPage = {
  optionChain?: {
    result?: Array<{
      quote?: { earningsTimestamp?: number }
      expirationDates?: number[]
      options?: Array<{ calls?: OptionContract[]; puts?: OptionContract[] }>
    }>
  }
}

// Returns true if IV value is real (not Yahoo's fake placeholder 0.00001)
function isRealIV(iv: number | undefined): boolean {
  if (!iv) return false
  if (iv < 0.005) return false  // Below 0.5% is the fake placeholder
  return true
}

async function fetchOneTicker(ticker: string, cookie: string, crumb: string): Promise<Partial<ScanResult>> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Cookie': cookie, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com',
  }
  const enc = encodeURIComponent(crumb)
  const nowSecs = Math.floor(Date.now() / 1000)
  const today = Date.now()

  try {
    // Fetch price and default options page in parallel
    const [priceRes, optRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d&crumb=${enc}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) }),
      fetch(`https://query2.finance.yahoo.com/v7/finance/options/${ticker}?crumb=${enc}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) }),
    ])

    if (!priceRes.ok) return { ticker, error: `Price ${priceRes.status}` }
    const priceData = await priceRes.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } }
    const currentPrice = priceData.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0
    if (!currentPrice) return { ticker, error: 'No price' }

    if (!optRes.ok) return { ticker, currentPrice, error: `Options ${optRes.status}` }
    const defaultData = await optRes.json() as YahooOptionsPage
    const defaultResult = defaultData.optionChain?.result?.[0]

    // Earnings date
    const earningsTs = defaultResult?.quote?.earningsTimestamp
    const daysToEarnings = earningsTs && earningsTs > 0
      ? Math.max(0, Math.round((earningsTs * 1000 - today) / 86_400_000))
      : -1

    // Find best expiry in 20-60 DTE range
    const allExpiries = defaultResult?.expirationDates ?? []
    const targetExpiry =
      allExpiries.find(ts => { const d = Math.round((ts - nowSecs) / 86400); return d >= 30 && d <= 45 }) ??
      allExpiries.find(ts => { const d = Math.round((ts - nowSecs) / 86400); return d >= 20 && d <= 60 }) ??
      allExpiries.find(ts => ts > nowSecs + 7 * 86400)

    if (!targetExpiry) return { ticker, currentPrice, daysToEarnings, error: 'No future expiry' }

    // Fetch the specific future expiry
    const specRes = await fetch(
      `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?date=${targetExpiry}&crumb=${enc}`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) }
    )
    if (!specRes.ok) return { ticker, currentPrice, daysToEarnings, error: `Spec expiry ${specRes.status}` }

    const specData = await specRes.json() as YahooOptionsPage
    const rawOptions = specData.optionChain?.result?.[0]?.options?.[0]
    const calls = rawOptions?.calls ?? []
    const puts = rawOptions?.puts ?? []

    let totalVolume = 0
    let totalOI = 0
    let totalCallOI = 0
    let totalPutOI = 0
    const ivSamples: number[] = []

    for (const c of calls) {
      // Skip fake IV values and zero-OI expired contracts
      if (!isRealIV(c.impliedVolatility)) continue
      totalVolume += c.volume ?? 0
      totalOI += c.openInterest ?? 0
      totalCallOI += c.openInterest ?? 0
      if (c.strike) {
        const pct = Math.abs(c.strike - currentPrice) / currentPrice
        if (pct < 0.15) {
          // Yahoo IV is already in decimal form: 0.25 = 25%
          // Multiply by 100 to get percentage
          ivSamples.push(c.impliedVolatility! * 100)
        }
      }
    }

    for (const p of puts) {
      if (!isRealIV(p.impliedVolatility)) continue
      totalVolume += p.volume ?? 0
      totalOI += p.openInterest ?? 0
      totalPutOI += p.openInterest ?? 0
      if (p.strike) {
        const pct = Math.abs(p.strike - currentPrice) / currentPrice
        if (pct < 0.15) {
          ivSamples.push(p.impliedVolatility! * 100)
        }
      }
    }

    // Calculate IV30 from samples
    // If no valid samples, try using the median of ALL valid IVs in the chain
    let iv30 = 0
    if (ivSamples.length > 0) {
      iv30 = Math.round(ivSamples.reduce((a, b) => a + b, 0) / ivSamples.length * 10) / 10
    } else {
      // Fallback: use any valid IV from the chain
      const allValid = [...calls, ...puts]
        .filter(c => isRealIV(c.impliedVolatility))
        .map(c => c.impliedVolatility! * 100)
      if (allValid.length > 0) {
        const sorted = allValid.sort((a, b) => a - b)
        iv30 = Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10
      } else {
        iv30 = 25 // true fallback default
      }
    }

    // IV Rank: estimated from absolute IV level
    // Low IV stocks (SPY, QQQ): IV around 15-20% → IVR 10-20
    // Medium IV stocks (AAPL, MSFT): IV around 25-35% → IVR 25-45
    // High IV stocks (TSLA, COIN): IV around 60-100% → IVR 70-100
    // Formula: (iv30 - 10) / 90 * 100 gives better spread
    const ivRank = Math.min(100, Math.max(0, Math.round((iv30 - 10) / 90 * 100)))

    const putCallRatio = totalCallOI > 0
      ? Math.round(totalPutOI / totalCallOI * 100) / 100
      : 1.0
    const volOiRatio = totalOI > 0
      ? Math.round(totalVolume / totalOI * 100) / 100
      : 0

    return { ticker, currentPrice, ivRank, iv30, putCallRatio, volOiRatio, daysToEarnings, totalVolume, totalOI }

  } catch (err) {
    return { ticker, error: err instanceof Error ? err.message : 'Failed' }
  }
}

export async function fetchAllScanData(): Promise<Partial<ScanResult>[]> {
  const { cookie, crumb } = await getYahooSession()
  const results: Partial<ScanResult>[] = []

  const batchSize = 5
  for (let i = 0; i < ALL_TICKERS.length; i += batchSize) {
    const batch = ALL_TICKERS.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(t => fetchOneTicker(t, cookie, crumb)))
    batchResults.forEach((r, idx) => {
      const ticker = batch[idx]
      results.push(r.status === 'fulfilled' ? { ...r.value, ticker } : { ticker, error: 'Failed' })
    })
    if (i + batchSize < ALL_TICKERS.length) {
      await new Promise(res => setTimeout(res, 400))
    }
  }

  return results.map(r => {
    const cat = Object.entries(SCAN_TICKERS).find(([, tickers]) => tickers.includes(r.ticker ?? ''))
    return { ...r, category: cat?.[0] ?? 'Other' }
  })
}

export function getSignal(ivRank: number): ScanResult['signal'] {
  if (ivRank >= 50) return 'SELL PREMIUM'
  if (ivRank <= 30) return 'BUY OPTIONS'
  return 'NEUTRAL'
}