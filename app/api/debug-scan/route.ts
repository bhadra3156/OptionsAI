// FILE: app/api/debug-scan/route.ts
// Debug endpoint - checks specific expiry IV values

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const cookieRes = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow', cache: 'no-store',
    })
    const rawCookies = cookieRes.headers.get('set-cookie') ?? ''
    const cookieStr = rawCookies.split(',').map((c: string) => c.split(';')[0].trim()).filter(Boolean).join('; ')

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookieStr },
      cache: 'no-store',
    })
    const crumb = (await crumbRes.text()).trim()
    const enc = encodeURIComponent(crumb)
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': cookieStr, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com',
    }

    // Get expiry list first
    const defaultRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/AAPL?crumb=${enc}`, { headers, cache: 'no-store' })
    const defaultData = await defaultRes.json() as {
      optionChain?: { result?: Array<{ expirationDates?: number[] }> }
    }
    const expiries = defaultData.optionChain?.result?.[0]?.expirationDates ?? []
    const nowSecs = Math.floor(Date.now() / 1000)

    // Find 30-45 DTE expiry
    const target = expiries.find(ts => {
      const dte = Math.round((ts - nowSecs) / 86400)
      return dte >= 20 && dte <= 60
    })

    if (!target) return NextResponse.json({ error: 'No target expiry found', expiries })

    const targetDTE = Math.round((target - nowSecs) / 86400)

    // Fetch specific expiry
    const specRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/AAPL?date=${target}&crumb=${enc}`, { headers, cache: 'no-store' })
    const specData = await specRes.json() as {
      optionChain?: {
        result?: Array<{
          options?: Array<{
            calls?: Array<{ strike?: number; impliedVolatility?: number; openInterest?: number; volume?: number }>
            puts?: Array<{ strike?: number; impliedVolatility?: number; openInterest?: number; volume?: number }>
          }>
        }>
      }
    }

    const calls = specData.optionChain?.result?.[0]?.options?.[0]?.calls ?? []

    // Show ATM calls (strikes near $295)
    const atmCalls = calls
      .filter(c => c.strike && Math.abs((c.strike - 295) / 295) < 0.05)
      .map(c => ({
        strike: c.strike,
        rawIV: c.impliedVolatility,
        ivAsPercent: c.impliedVolatility ? (c.impliedVolatility * 100).toFixed(2) + '%' : 'null',
        oi: c.openInterest,
        volume: c.volume,
      }))

    // Show full range of IV values to understand the scale
    const allIVs = calls
      .filter(c => c.impliedVolatility && c.impliedVolatility > 0.001)
      .map(c => c.impliedVolatility!)
      .sort((a, b) => a - b)

    return NextResponse.json({
      targetExpiry: new Date(target * 1000).toISOString().split('T')[0],
      targetDTE,
      totalCalls: calls.length,
      callsWithIV: allIVs.length,
      ivRange: {
        min: allIVs[0],
        max: allIVs[allIVs.length - 1],
        median: allIVs[Math.floor(allIVs.length / 2)],
        minAsPercent: allIVs[0] ? (allIVs[0] * 100).toFixed(1) + '%' : null,
        maxAsPercent: allIVs[allIVs.length - 1] ? (allIVs[allIVs.length - 1] * 100).toFixed(1) + '%' : null,
        medianAsPercent: allIVs[Math.floor(allIVs.length / 2)] ? (allIVs[Math.floor(allIVs.length / 2)] * 100).toFixed(1) + '%' : null,
      },
      atmCalls,
    })

  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}