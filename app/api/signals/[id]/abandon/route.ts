// FILE: app/api/signals/[id]/abandon/route.ts
// =============================================================================
// POST /api/signals/[id]/abandon
// =============================================================================
// Closes out an APPROVED signal that the user has decided NOT to execute.
// This is the "I changed my mind" exit ramp — after Telegram approval, but
// before actually placing the trade in IBKR.
//
// Why a separate status from 'rejected':
//   'rejected' = user said NO to the signal up front (didn't like it)
//   'abandoned' = user said YES initially, then chose not to execute
//   The distinction matters for analytics: high-quality signals that get
//   abandoned suggest workflow friction; signals that get rejected suggest
//   the AI is generating ideas the user doesn't trust.
//
// Rules:
//   - Only the signal owner can abandon
//   - Only signals in 'approved' status can be abandoned
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: signal, error: fetchErr } = await supabaseAdmin
      .from('signals')
      .select('id, user_id, status')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single()

    if (fetchErr || !signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    if (signal.status !== 'approved') {
      return NextResponse.json(
        { error: `Can only abandon signals in 'approved' status — this one is '${signal.status}'` },
        { status: 409 }
      )
    }

    const { error: updateErr } = await supabaseAdmin
      .from('signals')
      .update({ status: 'abandoned' })
      .eq('id', params.id)

    if (updateErr) throw updateErr

    return NextResponse.json({ ok: true, status: 'abandoned' })
  } catch (err) {
    console.error('POST /api/signals/[id]/abandon error:', err)
    return NextResponse.json(
      { error: 'Failed to abandon signal' },
      { status: 500 }
    )
  }
}
