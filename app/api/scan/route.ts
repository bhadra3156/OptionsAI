// FILE: app/api/scan/route.ts
// API endpoint for the Market Scan page.
// Fetches all 30 tickers, then calls Claude once to score them all.

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { fetchAllScanData, getSignal } from '@/lib/scanner'
import type { ScanResult } from '@/lib/scanner'

const anthropic = new Anthropic()

export async function GET() {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Step 1: Fetch all 30 tickers in parallel
    const rawData = await fetchAllScanData()

    // Filter out failed fetches
    const validData = rawData.filter(r => r.currentPrice && r.currentPrice > 0 && !r.error)

    if (validData.length === 0) {
      return NextResponse.json({ error: 'Could not fetch market data. Please try again.' }, { status: 502 })
    }

    // Step 2: Score all tickers in ONE Claude call
    const scoringPrompt = `You are a professional options trader. Score each of these stocks as options trading opportunities right now.

For each ticker, give a score from 1-100 based on:
- How extreme the IV Rank is (very high or very low = more edge = higher score)
- How high the Vol/OI ratio is (unusual activity = higher score)
- Whether put/call ratio shows clear directional conviction
- Overall opportunity quality for options strategies right now

Data:
${validData.map(d => `${d.ticker}: price=$${d.currentPrice}, ivRank=${d.ivRank}, iv30=${d.iv30}%, volOI=${d.volOiRatio}, putCall=${d.putCallRatio}, daysToEarnings=${d.daysToEarnings}`).join('\n')}

Return ONLY valid JSON — an object where keys are ticker symbols and values are integer scores 1-100. No markdown, no explanation.
Example: {"SPY": 45, "TSLA": 78, "AAPL": 62}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: scoringPrompt }],
    })

    const content = message.content[0]
    let scores: Record<string, number> = {}

    if (content.type === 'text') {
      try {
        const clean = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        scores = JSON.parse(clean)
      } catch {
        // If scoring fails, use IV Rank as fallback score
        validData.forEach(d => { if (d.ticker) scores[d.ticker] = d.ivRank ?? 50 })
      }
    }

    // Step 3: Build final results
    const results: ScanResult[] = validData.map(d => ({
      ticker: d.ticker ?? '',
      category: d.category ?? 'Other',
      currentPrice: d.currentPrice ?? 0,
      ivRank: d.ivRank ?? 0,
      iv30: d.iv30 ?? 0,
      putCallRatio: d.putCallRatio ?? 1,
      volOiRatio: d.volOiRatio ?? 0,
      daysToEarnings: d.daysToEarnings ?? -1,
      totalVolume: d.totalVolume ?? 0,
      totalOI: d.totalOI ?? 0,
      aiScore: scores[d.ticker ?? ''] ?? 50,
      signal: getSignal(d.ivRank ?? 0),
    }))

    // Sort by AI score descending
    results.sort((a, b) => b.aiScore - a.aiScore)

    return NextResponse.json({
      results,
      scannedAt: new Date().toISOString(),
      totalScanned: results.length,
    })

  } catch (error) {
    console.error('Scan error:', error)
    return NextResponse.json(
      { error: 'Market scan failed. Please try again.' },
      { status: 500 }
    )
  }
}