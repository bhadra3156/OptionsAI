// FILE: app/api/signals/scan/route.ts
// =============================================================================
// POST /api/signals/scan — user-triggered signals pipeline
// =============================================================================
// Thin wrapper around runScanPipeline (which lives in lib/signals/pipeline.ts).
// All the actual work is in the pipeline file — this route just handles
// auth and HTTP concerns.
//
// See lib/signals/pipeline.ts for the full pipeline documentation.
// =============================================================================

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // 60s on Vercel Pro tier; Hobby ignores and uses 10s

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { runScanPipeline } from '@/lib/signals/pipeline'

export async function POST() {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const result = await runScanPipeline(userId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('POST /api/signals/scan error:', err)
    return NextResponse.json(
      { error: 'Signal scan failed' },
      { status: 500 }
    )
  }
}
