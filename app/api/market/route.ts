// FILE: app/api/market/route.ts
// Fetches live market conditions from Yahoo Finance.
// Uses ^VIX directly for accurate VIX reading.

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const SECTORS = [
  { ticker: 'XLK', name: 'Technology' },
  { ticker: 'XLF', name: 'Financials' },
  { ticker: 'XLV', name: 'Healthcare' },
  { ticker: 'XLE', name: 'Energy' },
  { ticker: 'XLI', name: 'Industrials' },
  { ticker: 'XLY', name: 'Consumer Disc.' },
  { ticker: 'XLP', name: 'Consumer Stap.' },
  { ticker: 'XLU', name: 'Utilities' },
  { ticker: 'XLB', name: 'Materials' },
  { ticker: 'XLRE', name: 'Real Estate' },
  { ticker: 'XLC', name: 'Comm. Services' },
]

async function getYahooSession() {
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    redirect: 'follow', cache: 'no-store',
  })
  const rawCookies = cookieRes.headers.get('set-cookie') ?? ''
  const cookieStr = rawCookies.split(',').map((c: string) => c.split(';')[0].trim()).filter(Boolean).join('; ')
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': cookieStr },
    cache: 'no-store',
  })
  const crumb = (await crumbRes.text()).trim()
  return { cookie: cookieStr, crumb }
}

async function fetchQuote(symbol: string, cookie: string, crumb: string) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Cookie': cookie, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com',
  }
  // ^VIX needs URL encoding
  const encodedSymbol = encodeURIComponent(symbol)
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=2d&crumb=${encodeURIComponent(crumb)}`,
    { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) {
    console.error(`Failed to fetch ${symbol}: ${res.status}`)
    return null
  }
  const data = await res.json() as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number
          previousClose?: number
          chartPreviousClose?: number
        }
      }>
    }
  }
  const meta = data.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) return null
  const price = meta.regularMarketPrice
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price
  const change = Math.round((price - prevClose) * 100) / 100
  const changePercent = Math.round((change / prevClose) * 10000) / 100
  return { price, change, changePercent }
}

function determineRegime(vix: number, spyChangePercent: number) {
  if (vix < 15) {
    return {
      label: 'Low Volatility — Complacency',
      description: 'VIX is very low. Options are cheap. Ideal environment for buying options and debit spreads. Avoid selling premium — not enough edge.',
      vixLevel: 'low' as const,
      trend: spyChangePercent >= 0 ? 'bullish' as const : 'neutral' as const,
      recommendation: 'BUY OPTIONS — Low IV means cheap premiums. Use long calls, debit spreads, or LEAPS. Avoid iron condors today.',
      colour: 'text-primary',
      icon: 'sun' as const,
    }
  } else if (vix < 20) {
    return {
      label: 'Normal Market Conditions',
      description: 'VIX is in the normal range. Balanced environment. Check individual stock IV Rank to decide which strategy to use.',
      vixLevel: 'moderate' as const,
      trend: spyChangePercent >= 0 ? 'bullish' as const : 'neutral' as const,
      recommendation: 'NEUTRAL — Check individual stock IV Rank. Above 50 → sell premium. Below 30 → buy options.',
      colour: 'text-yellow-400',
      icon: 'cloud' as const,
    }
  } else if (vix < 30) {
    return {
      label: 'Elevated Volatility — Premium Selling Opportunity',
      description: 'VIX is elevated. Options premiums are rich. Sweet spot for selling premium strategies with meaningful edge.',
      vixLevel: 'elevated' as const,
      trend: spyChangePercent < -0.5 ? 'bearish' as const : 'neutral' as const,
      recommendation: 'SELL PREMIUM — Iron condors, cash-secured puts, bull put spreads. Elevated premiums give sellers the edge.',
      colour: 'text-orange-400',
      icon: 'cloud' as const,
    }
  } else {
    return {
      label: 'High Fear — Extreme Premium Selling Opportunity',
      description: 'VIX is very high. Extreme fear. Options are massively overpriced. Best time to sell premium — but reduce size and widen strikes.',
      vixLevel: 'extreme' as const,
      trend: 'bearish' as const,
      recommendation: 'SELL PREMIUM — But cut position size by 50%. Use wider-than-normal strikes. IV will revert — this is the edge professionals exploit.',
      colour: 'text-red-400',
      icon: 'rain' as const,
    }
  }
}

export async function GET() {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { cookie, crumb } = await getYahooSession()

    // Fetch all symbols in parallel — ^VIX is the real VIX index
    const allSymbols = ['^VIX', 'SPY', 'QQQ', 'IWM', ...SECTORS.map(s => s.ticker)]
    const results = await Promise.allSettled(
      allSymbols.map(sym => fetchQuote(sym, cookie, crumb))
    )

    const getResult = (idx: number) => {
      const r = results[idx]
      return r.status === 'fulfilled' ? r.value : null
    }

    const vixData = getResult(0)
    const spy = getResult(1)
    const qqq = getResult(2)
    const iwm = getResult(3)

    if (!spy) return NextResponse.json({ error: 'Could not fetch market data. Please try again.' }, { status: 502 })

    // Use real VIX — fall back to 18 if fetch fails
    const vix = vixData ? Math.round(vixData.price * 10) / 10 : 18
    const vixChange = vixData ? Math.round(vixData.change * 100) / 100 : 0

    // Build sector data
    const sectors = SECTORS.map((s, i) => {
      const q = getResult(4 + i)
      return {
        ticker: s.ticker,
        name: s.name,
        price: q?.price ?? 0,
        changePercent: q?.changePercent ?? 0,
        ivEstimate: 15,
      }
    }).filter(s => s.price > 0)

    const regime = determineRegime(vix, spy.changePercent)

    return NextResponse.json({
      vix,
      vixChange,
      spy: {
        ...spy,
        trend: spy.changePercent >= 0.1 ? 'up' : spy.changePercent <= -0.1 ? 'down' : 'flat'
      },
      qqq: qqq ?? { price: 0, change: 0, changePercent: 0 },
      iwm: iwm ?? { price: 0, change: 0, changePercent: 0 },
      sectors,
      regime,
      generatedAt: new Date().toISOString(),
    })

  } catch (err) {
    console.error('Market API error:', err)
    return NextResponse.json({ error: 'Market data fetch failed. Please try again.' }, { status: 500 })
  }
}