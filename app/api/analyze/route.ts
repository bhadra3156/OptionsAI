// FILE: app/api/analyze/route.ts
// This is the CORE API endpoint of the entire application.
// When the frontend sends a POST request with a ticker symbol,
// this route: 1) fetches live market data from Polygon.io
//             2) sends it to Claude AI to generate a strategy
//             3) saves the result to Supabase
//             4) returns the strategy JSON to the frontend
//
// It is a server-side only route — API keys never reach the browser.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchMarketData } from '@/lib/polygon'
import { generateStrategy } from '@/lib/anthropic'
import { supabaseAdmin } from '@/lib/supabase'
import { isValidTicker } from '@/lib/utils'
import type { AnalyzeRequest, AnalyzeResponse } from '@/types/strategy'

export async function POST(request: NextRequest) {
  try {
    // ── 1. Authentication check ──────────────────────────────────────────────
    // Clerk's auth() returns the userId if logged in, null if not
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'You must be signed in to analyse a ticker.' },
        { status: 401 }
      )
    }

    // ── 2. Parse and validate the request body ──────────────────────────────
    let body: AnalyzeRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON with a ticker field.' },
        { status: 400 }
      )
    }

    const { ticker } = body

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { error: 'Ticker symbol is required.' },
        { status: 400 }
      )
    }

    if (!isValidTicker(ticker)) {
      return NextResponse.json(
        { error: 'Invalid ticker symbol. Use 1–5 letters (e.g. AAPL, TSLA, SPY).' },
        { status: 400 }
      )
    }

    // ── 3. Fetch live market data from Polygon.io ────────────────────────────
    let marketData
    try {
      marketData = await fetchMarketData(ticker)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json(
        { error: `Failed to fetch market data: ${message}` },
        { status: 502 }
      )
    }

    // ── 4. Generate strategy with Claude AI ─────────────────────────────────
    let strategy
    try {
      strategy = await generateStrategy(marketData)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json(
        { error: `AI strategy generation failed: ${message}` },
        { status: 502 }
      )
    }

    // ── 5. Save to Supabase (best-effort — don't fail if DB is down) ─────────
    try {
      await supabaseAdmin.from('analyses').insert({
        user_id: userId,
        ticker: marketData.ticker,
        strategy_json: strategy,
        market_data: {
          currentPrice: marketData.currentPrice,
          ivRank: marketData.ivRank,
          iv30: marketData.iv30,
          daysToEarnings: marketData.daysToEarnings,
          putCallRatio: marketData.putCallRatio,
          vix: marketData.vix,
        },
      })
    } catch (dbError) {
      // Log the error but don't fail the request — strategy still gets returned
      console.error('Failed to save analysis to Supabase:', dbError)
    }

    // ── 6. Return the strategy to the frontend ───────────────────────────────
    const response: AnalyzeResponse = {
      strategy,
      marketData: {
        ticker: marketData.ticker,
        currentPrice: marketData.currentPrice,
        ivRank: marketData.ivRank,
        iv30: marketData.iv30,
        historicalVol30: marketData.historicalVol30,
        ivPremium: marketData.ivPremium,
        daysToEarnings: marketData.daysToEarnings,
        putCallRatio: marketData.putCallRatio,
        vix: marketData.vix,
      },
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)

  } catch (error) {
    // Catch-all for any unexpected errors
    console.error('Unexpected error in /api/analyze:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
