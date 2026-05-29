// FILE: app/api/cron/scan-signals/route.ts
// =============================================================================
// GET /api/cron/scan-signals
// =============================================================================
// Endpoint hit by Vercel Cron on a schedule (configured in vercel.json — added
// in Phase F). Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` so we
// know it's a legitimate scheduled call and not a public visitor.
//
// What it does:
//   - Verifies the CRON_SECRET
//   - Looks up the user_id to assign signals to (env var CRON_USER_ID)
//   - Runs the same pipeline as POST /api/signals/scan
//   - Returns the summary so Vercel Cron logs are useful
//
// Why a separate route from /api/signals/scan:
//   The user-facing route uses Clerk auth(). Cron has no Clerk session, so it
//   would always fail auth. This route uses a static secret instead, and pulls
//   the user_id from an env var.
//
// Env vars needed:
//   CRON_SECRET   — already added to .env.local in Phase B handoff
//   CRON_USER_ID  — added in Phase F before scheduling. Until then, only manual
//                   calls (via POST /api/signals/scan) work.
// =============================================================================

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { runScanPipeline } from '@/app/api/signals/scan/route'

export async function GET(request: NextRequest) {
  // Verify the secret
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on server' },
      { status: 500 }
    )
  }

  if (authHeader !== expected) {
    return NextResponse.json(
      { error: 'Unauthorised' },
      { status: 401 }
    )
  }

  // Verify the user_id
  const userId = process.env.CRON_USER_ID
  if (!userId) {
    return NextResponse.json(
      {
        error: 'CRON_USER_ID not configured. Set it in Vercel env vars to your Clerk user_id.',
      },
      { status: 500 }
    )
  }

  // Run the pipeline
  try {
    const result = await runScanPipeline(userId)
    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (err) {
    console.error('CRON /api/cron/scan-signals error:', err)
    return NextResponse.json(
      { error: 'Cron scan failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}