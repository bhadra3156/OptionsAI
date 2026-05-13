// FILE: app/api/trades/[id]/route.ts
// PATCH = close/update a trade
// DELETE = delete a trade

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { CloseTradeInput, Trade } from '@/types/trades'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json() as CloseTradeInput & { status?: string }

    // Get the trade first to calculate P&L
    const { data: trade } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single()

    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })

    const t = trade as Trade

    // Calculate P&L
    let pnl = 0
    let pnl_percent = 0

    if (body.exit_price !== undefined) {
      if (t.premium_received) {
        // Credit trade: profit = premium received - cost to close
        pnl = Math.round((t.premium_received - body.exit_price) * t.contracts * 100 * 100) / 100
        const maxRisk = t.max_loss ?? t.premium_received * 3
        pnl_percent = Math.round((pnl / Math.abs(maxRisk)) * 10000) / 100
      } else if (t.premium_paid) {
        // Debit trade: profit = current value - premium paid
        pnl = Math.round((body.exit_price - t.premium_paid) * t.contracts * 100 * 100) / 100
        pnl_percent = Math.round((pnl / (t.premium_paid * t.contracts * 100)) * 10000) / 100
      }
    }

    const { data, error } = await supabaseAdmin
      .from('trades')
      .update({
        exit_date: body.exit_date,
        exit_price: body.exit_price,
        exit_reason: body.exit_reason,
        pnl,
        pnl_percent,
        status: body.status ?? 'closed',
        notes: body.notes ?? t.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ trade: data })
  } catch (err) {
    console.error('PATCH /api/trades/[id] error:', err)
    return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { error } = await supabaseAdmin
      .from('trades')
      .delete()
      .eq('id', params.id)
      .eq('user_id', userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/trades/[id] error:', err)
    return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 })
  }
}