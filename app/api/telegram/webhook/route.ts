// FILE: app/api/telegram/webhook/route.ts
// =============================================================================
// POST /api/telegram/webhook
// =============================================================================
// PUBLIC endpoint that Telegram POSTs to when a user taps an inline button
// on one of our signal messages. This is the only signals-related route
// that does NOT use Clerk auth (Telegram doesn't have a user session).
//
// SECURITY:
//   Verified by Telegram's X-Telegram-Bot-Api-Secret-Token header. The
//   secret is set when registering the webhook (one-time setup) and stored
//   in TELEGRAM_WEBHOOK_SECRET env var. Any request without the right header
//   gets 401. Without this, the URL is internet-exposed and anyone could
//   trigger approvals.
//
// FLOW:
//   1. Verify header
//   2. Parse Telegram Update — we only handle callback_query (button taps)
//   3. Parse callback_data: "approve:<uuid>" or "reject:<uuid>"
//   4. Look up the signal (verifying it's still pending)
//   5. Update signal status + telegram_approvals row directly via supabaseAdmin
//   6. Edit the original message to show the user's choice
//   7. Acknowledge the callback (Telegram requires this within ~10s)
//   8. Return 200 to Telegram
//
// IMPORTANT: must respond quickly. Don't do any slow work synchronously.
// If a step fails, log it but still return 200 to Telegram so it doesn't
// retry the same callback and create duplicate work.
//
// Middleware note: this route MUST be added to the public list in
// middleware.ts or Clerk will block Telegram's request.
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  answerCallbackQuery,
  editSignalMessageAfterResponse,
} from '@/lib/telegram/send'

// Telegram Update shape — we only model the fields we use
interface TelegramUpdate {
  update_id: number
  callback_query?: {
    id: string                          // for answerCallbackQuery
    from: { id: number; username?: string }
    message?: {
      message_id: number
      chat: { id: number }
      text?: string                     // original message text (for editing)
    }
    data?: string                       // our callback_data e.g. "approve:<uuid>"
  }
}

export async function POST(request: NextRequest) {
  // ===== STEP 1: Verify the secret =====
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expectedSecret) {
    console.error('[telegram-webhook] TELEGRAM_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const providedSecret = request.headers.get('x-telegram-bot-api-secret-token')
  if (providedSecret !== expectedSecret) {
    // Don't leak whether the secret was missing or wrong — both are 401
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ===== STEP 2: Parse the update =====
  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // We only handle callback_query (button taps). Ignore other update types.
  const cb = update.callback_query
  if (!cb || !cb.data || !cb.message) {
    // Still return 200 so Telegram doesn't retry — we just have nothing to do
    return NextResponse.json({ ok: true, ignored: true })
  }

  // ===== STEP 3: Parse callback_data =====
  // Expected format: "approve:<uuid>" or "reject:<uuid>"
  const [action, signalId] = cb.data.split(':')

  if ((action !== 'approve' && action !== 'reject') || !signalId) {
    await safeAck(cb.id, 'Invalid action')
    return NextResponse.json({ ok: true, ignored: 'bad-callback' })
  }

  // ===== STEP 4: Look up the signal =====
  const { data: signal, error: fetchErr } = await supabaseAdmin
    .from('signals')
    .select('id, user_id, status')
    .eq('id', signalId)
    .single()

  if (fetchErr || !signal) {
    await safeAck(cb.id, 'Signal not found')
    return NextResponse.json({ ok: true, ignored: 'signal-not-found' })
  }

  // If already responded to or expired, acknowledge but don't re-update
  if (signal.status !== 'pending') {
    await safeAck(cb.id, `Signal already ${signal.status}`)
    return NextResponse.json({ ok: true, ignored: `already-${signal.status}` })
  }

  // ===== STEP 5: Update signal + telegram_approvals =====
  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  const responseValue = action === 'approve' ? 'yes' : 'no'
  const now = new Date().toISOString()

  const { error: signalUpdateErr } = await supabaseAdmin
    .from('signals')
    .update({ status: newStatus, responded_at: now })
    .eq('id', signalId)
    .eq('status', 'pending')              // optimistic concurrency check

  if (signalUpdateErr) {
    console.error('[telegram-webhook] signal update failed:', signalUpdateErr)
    await safeAck(cb.id, 'Update failed — try again')
    // Still 200 so Telegram doesn't retry (we'd just hit the same DB error)
    return NextResponse.json({ ok: true, ignored: 'db-error' })
  }

  // Update the matching telegram_approvals row (best-effort)
  await supabaseAdmin
    .from('telegram_approvals')
    .update({ response: responseValue, responded_at: now })
    .eq('signal_id', signalId)
    .is('response', null)

  // ===== STEP 6: Edit the original message =====
  // Best-effort — if this fails, the DB is still correct, the user just sees
  // the buttons still on screen
  try {
    if (cb.message.text) {
      await editSignalMessageAfterResponse(
        cb.message.message_id,
        cb.message.text,
        responseValue
      )
    }
  } catch (err) {
    console.error('[telegram-webhook] message edit failed:', err)
  }

  // ===== STEP 7: Acknowledge the callback =====
  // Required by Telegram or the user's button shows a spinner forever
  const ackText = newStatus === 'approved'
    ? '✅ Approved — paste the IBKR ticket above into Trader Workstation.'
    : '❌ Rejected.'
  await safeAck(cb.id, ackText)

  // ===== STEP 8: Return 200 =====
  return NextResponse.json({ ok: true, signalId, newStatus })
}

// Wrapper around answerCallbackQuery that swallows errors —
// we don't want a Telegram quirk to break the whole response
async function safeAck(callbackQueryId: string, text: string): Promise<void> {
  try {
    await answerCallbackQuery(callbackQueryId, text)
  } catch (err) {
    console.error('[telegram-webhook] answerCallbackQuery failed:', err)
  }
}
