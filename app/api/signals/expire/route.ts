// FILE: app/api/signals/expire/route.ts
// =============================================================================
// POST /api/signals/expire
// =============================================================================
// Internal housekeeping endpoint. Marks any 'pending' signal whose 15-min
// approval window has elapsed as 'expired'. Also edits the Telegram message
// to reflect the expiry (best-effort).
//
// Auth: CRON_SECRET header (same scheme as /api/cron/scan-signals).
//   This route will be called by Vercel Cron in Phase F (e.g. every 5 min).
//   For now, you can hit it manually with a curl to test.
//
// Why a separate endpoint and not piggybacked on the scan endpoint:
//   - Concerns separated: scan creates signals, expire closes them
//   - Different schedule: expiry should run more often than scan
//   - Easier to test/operate
// =============================================================================

export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { editSignalMessageAfterExpiry } from '@/lib/telegram/send'
import { SIGNAL_CONFIG } from '@/types/signals'

interface PendingSignalRow {
  id: string
  qualified_at: string
  // We need the matching telegram_approvals.message_id to edit the message.
  // Postgres can return this via a JOIN-like select on the related table.
  telegram_approvals: Array<{
    id: string
    telegram_message_id: number | null
    response: string | null
  }> | null
}

export async function POST(request: NextRequest) {
  // Same auth scheme as /api/cron/scan-signals
  const authHeader = request.headers.get('authorization')

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    )
  }

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  return handleExpiry()
}

// Allow GET too for manual testing in a browser (with the right header)
export async function GET(request: NextRequest) {
  return POST(request)
}

async function handleExpiry(): Promise<NextResponse> {
  const windowMinutes = SIGNAL_CONFIG.APPROVAL_WINDOW_MINUTES
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  // Find pending signals past their window, with their telegram_approvals
  // Supabase nested select syntax pulls related rows in one query
  const { data: rawPending, error: fetchErr } = await supabaseAdmin
    .from('signals')
    .select('id, qualified_at, telegram_approvals(id, telegram_message_id, response)')
    .eq('status', 'pending')
    .lte('qualified_at', cutoff)

  if (fetchErr) {
    console.error('[expire] fetch failed:', fetchErr)
    return NextResponse.json(
      { error: 'Failed to fetch expiring signals' },
      { status: 500 }
    )
  }

  const pending = (rawPending ?? []) as PendingSignalRow[]

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, expiredCount: 0 })
  }

  // Bulk-update all expired signals in one query
  const ids = pending.map(p => p.id)
  const { error: updateErr } = await supabaseAdmin
    .from('signals')
    .update({ status: 'expired', expired_at: now })
    .in('id', ids)
    .eq('status', 'pending')

  if (updateErr) {
    console.error('[expire] update failed:', updateErr)
    return NextResponse.json(
      { error: 'Failed to mark signals expired' },
      { status: 500 }
    )
  }

  // Mark telegram_approvals.expired_handled = true so we don't double-process
  const approvalIds = pending
    .flatMap(p => p.telegram_approvals ?? [])
    .filter(a => a.response === null)
    .map(a => a.id)

  if (approvalIds.length > 0) {
    await supabaseAdmin
      .from('telegram_approvals')
      .update({ expired_handled: true })
      .in('id', approvalIds)
  }

  // Best-effort: edit the Telegram messages to show "EXPIRED"
  // Done in parallel; failures logged but don't fail the request
  const editResults = await Promise.allSettled(
    pending
      .flatMap(p => (p.telegram_approvals ?? []).map(a => ({ p, a })))
      .filter(({ a }) => a.response === null && a.telegram_message_id !== null)
      .map(async ({ a }) => {
        // We don't have the original message text in DB. Send a fallback expiry note.
        // (Telegram needs the original text to fully replicate the message; we'd
        // need to fetch it via Bot API getMessage, which doesn't exist. Simpler:
        // just edit to a short expiry notice.)
        try {
          await editSignalMessageAfterExpiry(a.telegram_message_id!, '⏱ Signal expired')
        } catch (err) {
          console.warn('[expire] message edit failed:', err)
          throw err
        }
      })
  )

  const editFailures = editResults.filter(r => r.status === 'rejected').length

  return NextResponse.json({
    ok: true,
    expiredCount: pending.length,
    editFailures,
  })
}
