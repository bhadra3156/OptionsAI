// FILE: app/api/signals/[id]/approve/route.ts
// =============================================================================
// POST /api/signals/[id]/approve
// =============================================================================
// Marks a signal as approved.
// Called by:
//   - Telegram webhook when user taps YES (Phase D)
//   - Future manual "approve" button in /signals UI
//
// Side effects:
//   - signals.status -> 'approved'
//   - signals.responded_at -> NOW()
//   - telegram_approvals row updated with response='yes' (if exists)
//
// Rules:
//   - Only the signal owner (matching user_id) can approve
//   - Only signals in 'pending' status can be approved
//   - If signal has expired, return 410 Gone with a clear message
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

    // Fetch the signal, verifying ownership
    const { data: signal, error: fetchErr } = await supabaseAdmin
      .from('signals')
      .select('id, user_id, status')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single()

    if (fetchErr || !signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    if (signal.status === 'expired') {
      return NextResponse.json(
        { error: 'Signal has expired and can no longer be approved' },
        { status: 410 }
      )
    }

    if (signal.status !== 'pending') {
      return NextResponse.json(
        { error: `Signal is already ${signal.status}` },
        { status: 409 }
      )
    }

    // Update signal
    const now = new Date().toISOString()
    const { error: updateErr } = await supabaseAdmin
      .from('signals')
      .update({ status: 'approved', responded_at: now })
      .eq('id', params.id)

    if (updateErr) throw updateErr

    // Best-effort: update the matching telegram_approval row (don't fail if it's missing)
    await supabaseAdmin
      .from('telegram_approvals')
      .update({ response: 'yes', responded_at: now })
      .eq('signal_id', params.id)
      .is('response', null)

    return NextResponse.json({ ok: true, status: 'approved' })
  } catch (err) {
    console.error('POST /api/signals/[id]/approve error:', err)
    return NextResponse.json(
      { error: 'Failed to approve signal' },
      { status: 500 }
    )
  }
}