// FILE: app/api/analyze/route.ts
// Core API endpoint. POST a ticker → get back a strategy.
// Uses Yahoo Finance for market data + Claude AI for strategy generation.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchMarketData } from '@/lib/yahoo'
import { generateStrategy } from '@/lib/anthropic'
import { supabaseAdmin } from '@/lib/supabase'
import { isValidTicker } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'You must be signed in to analyse a ticker.' },
        { status: 401 }
      )
    }

    let body: { ticker?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request. Expected JSON with a ticker field.' },
        { status: 400 }
      )
    }

    const { ticker } = body

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker symbol is required.' }, { status: 400 })
    }

    if (!isValidTicker(ticker)) {
      return NextResponse.json(
        { error: 'Invalid ticker. Use 1-5 letters only (e.g. AAPL, TSLA, SPY).' },
        { status: 400 }
      )
    }

    let marketData
    try {
      marketData = await fetchMarketData(ticker)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: `Market data error: ${msg}` }, { status: 502 })
    }

    let strategy
    try {
      strategy = await generateStrategy(marketData)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: `AI strategy error: ${msg}` }, { status: 502 })
    }

    try {
      await supabaseAdmin.from('analyses').insert({
        user_id: userId,
        ticker: marketData.ticker,
        strategy_json: strategy,
        market_snapshot: {
          currentPrice: marketData.currentPrice,
          ivRank: marketData.ivRank,
          iv30: marketData.iv30,
          putCallRatio: marketData.putCallRatio,
          daysToEarnings: marketData.daysToEarnings,
          vix: marketData.vix,
        },
      })
    } catch (dbErr) {
      console.error('Supabase save failed (non-critical):', dbErr)
    }

    return NextResponse.json({
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
    })

  } catch (error) {
    console.error('Unexpected error in /api/analyze:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}