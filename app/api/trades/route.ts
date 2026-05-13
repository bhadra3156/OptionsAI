// FILE: app/api/trades/route.ts
// CRUD API for the P&L trade tracker
// GET = list all trades + stats
// POST = create new trade

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { Trade, TradeStats, CreateTradeInput } from '@/types/trades'

export async function GET() {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: trades, error } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('entry_date', { ascending: false })

    if (error) throw error

    const stats = calculateStats(trades ?? [])

    return NextResponse.json({ trades: trades ?? [], stats })
  } catch (err) {
    console.error('GET /api/trades error:', err)
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json() as CreateTradeInput

    const { data, error } = await supabaseAdmin
      .from('trades')
      .insert({ ...body, user_id: userId, status: 'open' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ trade: data })
  } catch (err) {
    console.error('POST /api/trades error:', err)
    return NextResponse.json({ error: 'Failed to create trade' }, { status: 500 })
  }
}

function calculateStats(trades: Trade[]): TradeStats {
  const closed = trades.filter(t => t.status === 'closed' || t.status === 'expired')
  const open = trades.filter(t => t.status === 'open')
  const winners = closed.filter(t => (t.pnl ?? 0) > 0)

  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const avgPnl = closed.length > 0 ? totalPnl / closed.length : 0
  const avgPnlPct = closed.length > 0
    ? closed.reduce((sum, t) => sum + (t.pnl_percent ?? 0), 0) / closed.length
    : 0

  const sortedByPnl = [...closed].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))

  // Strategy performance
  const strategyPnl: Record<string, number[]> = {}
  closed.forEach(t => {
    if (!strategyPnl[t.strategy_name]) strategyPnl[t.strategy_name] = []
    strategyPnl[t.strategy_name].push(t.pnl ?? 0)
  })
  let bestStrategy = ''
  let bestStrategyAvg = -Infinity
  Object.entries(strategyPnl).forEach(([name, pnls]) => {
    const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length
    if (avg > bestStrategyAvg) { bestStrategyAvg = avg; bestStrategy = name }
  })

  // Average days held
  const avgDays = closed.length > 0
    ? closed.reduce((sum, t) => {
        if (!t.exit_date) return sum
        const days = Math.round((new Date(t.exit_date).getTime() - new Date(t.entry_date).getTime()) / 86_400_000)
        return sum + days
      }, 0) / closed.length
    : 0

  const totalPremium = trades
    .filter(t => t.premium_received)
    .reduce((sum, t) => sum + (t.premium_received ?? 0), 0)

  return {
    totalTrades: trades.length,
    openTrades: open.length,
    closedTrades: closed.length,
    winRate: closed.length > 0 ? Math.round((winners.length / closed.length) * 100) : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgPnlPerTrade: Math.round(avgPnl * 100) / 100,
    avgPnlPercent: Math.round(avgPnlPct * 100) / 100,
    bestTrade: sortedByPnl[0] ?? null,
    worstTrade: sortedByPnl[sortedByPnl.length - 1] ?? null,
    bestStrategy,
    avgDaysHeld: Math.round(avgDays),
    totalPremiumCollected: Math.round(totalPremium * 100) / 100,
  }
}