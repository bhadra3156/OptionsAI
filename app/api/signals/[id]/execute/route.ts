// FILE: app/api/signals/[id]/execute/route.ts
// =============================================================================
// POST /api/signals/[id]/execute
// =============================================================================
// Called when the user clicks "I placed this trade" and reports the actual
// fill price. We then:
//   1. Insert a row into the existing `trades` table (P&L journal lives there)
//   2. Mark the signal as 'executed' and link its executed_trade_id to the new row
//
// Why route into existing /trades:
//   The user already has a working P&L tracker at /trades. Building a parallel
//   one would be wasteful. The signal -> trade promotion is one-way: signals
//   feed the journal; the journal doesn't know it came from a signal.
//
// Input body (matches ExecuteSignalInput in types/signals.ts):
//   { actualFillPrice: number, contracts: number, notes?: string }
//
// Rules:
//   - Only the signal owner can execute
//   - Only signals in 'approved' status can be executed
//   - If body data is missing/invalid, return 400
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { Signal, SignalLeg, ExecuteSignalInput } from '@/types/signals'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Parse and validate body
    const body = (await request.json()) as Partial<ExecuteSignalInput>
    if (
      typeof body.actualFillPrice !== 'number' ||
      typeof body.contracts !== 'number' ||
      body.contracts < 1 ||
      !Number.isFinite(body.actualFillPrice)
    ) {
      return NextResponse.json(
        { error: 'actualFillPrice (number) and contracts (>=1) are required' },
        { status: 400 }
      )
    }

    // Fetch the signal, verifying ownership
    const { data: rawSignal, error: fetchErr } = await supabaseAdmin
      .from('signals')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single()

    if (fetchErr || !rawSignal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    const signal = rawSignal as Signal

    if (signal.status !== 'approved') {
      return NextResponse.json(
        { error: `Signal is in '${signal.status}' state — must be 'approved' to execute` },
        { status: 409 }
      )
    }

    // Build the trades row from the signal
    const tradeRow = buildTradeRow(signal, body as ExecuteSignalInput, userId)

    // Insert trade
    const { data: insertedTrade, error: insertErr } = await supabaseAdmin
      .from('trades')
      .insert(tradeRow)
      .select('id')
      .single()

    if (insertErr || !insertedTrade) {
      console.error('execute: insert trades failed:', insertErr)
      return NextResponse.json(
        { error: 'Failed to create trade row' },
        { status: 500 }
      )
    }

    // Link the signal to the new trade and mark executed
    const now = new Date().toISOString()
    const { error: linkErr } = await supabaseAdmin
      .from('signals')
      .update({
        status: 'executed',
        executed_at: now,
        executed_trade_id: insertedTrade.id,
      })
      .eq('id', params.id)

    if (linkErr) {
      // Trade row exists but link failed — log loudly, return success-with-warning
      console.error('execute: trade inserted but signal link failed:', linkErr)
      return NextResponse.json(
        {
          ok: true,
          tradeId: insertedTrade.id,
          warning: 'Trade created but signal link failed. Check Supabase manually.',
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      ok: true,
      tradeId: insertedTrade.id,
      signalId: params.id,
    })
  } catch (err) {
    console.error('POST /api/signals/[id]/execute error:', err)
    return NextResponse.json(
      { error: 'Failed to execute signal' },
      { status: 500 }
    )
  }
}

// -----------------------------------------------------------------------------
// HELPER: convert a Signal into a row shaped for the trades table
// -----------------------------------------------------------------------------
// The existing trades schema (from your supabase-schema and trades_route)
// expects these columns:
//   user_id, ticker, strategy_name, market_outlook, entry_date, expiry_date,
//   dte_at_entry, contracts, legs (JSONB), premium_received OR premium_paid,
//   max_loss, status, notes
// =============================================================================

function buildTradeRow(
  signal: Signal,
  input: ExecuteSignalInput,
  userId: string
): Record<string, unknown> {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10) // YYYY-MM-DD

  // Find the latest expiry across all legs (defines expiry_date)
  const legs = signal.legs_json as SignalLeg[]
  const expiryDate = legs
    .map(l => l.expiry)
    .sort()
    .reverse()[0] ?? todayIso

  const dteAtEntry = Math.max(
    0,
    Math.round((new Date(expiryDate).getTime() - today.getTime()) / 86_400_000)
  )

  // Decide credit vs debit
  // If ANY leg is a 'sell', treat as credit-side trade (user receives premium)
  // For credit: actualFillPrice IS the per-contract credit
  // For debit:  actualFillPrice IS the per-contract debit paid
  const hasSell = legs.some(l => l.action === 'sell')

  // Extract maxLoss as a number from the metrics string (e.g. "$315" -> 315)
  const maxLossNumeric = extractDollarAmount(signal.metrics_json.maxLoss) ?? 0

  const baseRow: Record<string, unknown> = {
    user_id: userId,
    ticker: signal.ticker,
    strategy_name: signal.strategy_name,
    market_outlook: signal.market_outlook,
    entry_date: todayIso,
    expiry_date: expiryDate,
    dte_at_entry: dteAtEntry,
    contracts: input.contracts,
    legs: legs,
    max_loss: maxLossNumeric,
    status: 'open',
    notes: input.notes ?? `From signal ${signal.id} (confidence ${signal.confidence}/100)`,
  }

  if (hasSell) {
    baseRow.premium_received = input.actualFillPrice
  } else {
    baseRow.premium_paid = input.actualFillPrice
  }

  return baseRow
}

// Pulls a number out of a string like "$210", "$1,200", "$3.50"
function extractDollarAmount(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}