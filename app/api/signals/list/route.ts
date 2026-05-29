// FILE: app/api/signals/list/route.ts
// =============================================================================
// GET /api/signals/list
// =============================================================================
// Returns three buckets of signals for the signed-in user:
//   - pending:  awaiting Telegram response, newest first
//   - approved: user said YES, waiting for "I placed this trade" report
//   - history:  rejected/expired/executed/abandoned in the last 24 hours
//
// Also returns timing metadata: when was the last scan, when is the next.
// nextScanAt is null until cron is wired in Phase F.
// =============================================================================

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { Signal, SignalsListResponse } from '@/types/signals'

export async function GET() {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Three queries in parallel — Supabase is fast enough that this is fine
    const [pendingRes, approvedRes, historyRes] = await Promise.all([
      supabaseAdmin
        .from('signals')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('signals')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .order('responded_at', { ascending: false }),
      supabaseAdmin
        .from('signals')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['rejected', 'expired', 'executed', 'abandoned'])
        .gte('updated_at', oneDayAgo)
        .order('updated_at', { ascending: false }),
    ])

    if (pendingRes.error) throw pendingRes.error
    if (approvedRes.error) throw approvedRes.error
    if (historyRes.error) throw historyRes.error

    // Most recent scan time = MAX(qualified_at) across ALL signals for this user
    const { data: latestRow } = await supabaseAdmin
      .from('signals')
      .select('qualified_at')
      .eq('user_id', userId)
      .order('qualified_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const response: SignalsListResponse = {
      pending: (pendingRes.data ?? []) as Signal[],
      approved: (approvedRes.data ?? []) as Signal[],
      history: (historyRes.data ?? []) as Signal[],
      lastScanAt: latestRow?.qualified_at ?? null,
      nextScanAt: null,  // populated in Phase F once cron schedule is known
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('GET /api/signals/list error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    )
  }
}