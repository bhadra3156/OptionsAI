// FILE: app/api/signals/[id]/reject/route.ts
// =============================================================================
// POST /api/signals/[id]/reject
// =============================================================================
// Marks a signal as rejected. Mirror of /approve.
// Called by:
//   - Telegram webhook when user taps NO (Phase D)
//   - Future manual "reject" button in /signals UI
//
// Side effects:
//   - signals.status -> 'rejected'
//   - signals.responded_at -> NOW()
//   - telegram_approvals row updated with response='no' (if exists)
//
// Rules: identical to /approve except terminal state is 'rejected'.
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

    if (signal.status !== 'pending') {
      return NextResponse.json(
        { error: `Signal is already ${signal.status}` },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const { error: updateErr } = await supabaseAdmin
      .from('signals')
      .update({ status: 'rejected', responded_at: now })
      .eq('id', params.id)

    if (updateErr) throw updateErr

    await supabaseAdmin
      .from('telegram_approvals')
      .update({ response: 'no', responded_at: now })
      .eq('signal_id', params.id)
      .is('response', null)

    return NextResponse.json({ ok: true, status: 'rejected' })
  } catch (err) {
    console.error('POST /api/signals/[id]/reject error:', err)
    return NextResponse.json(
      { error: 'Failed to reject signal' },
      { status: 500 }
    )
  }
}