// FILE: components/signals/StatusBar.tsx
// =============================================================================
// Top metadata strip — shows last scan time, next scan time, and counts.
// Lives under the page title. Pure presentation; no API calls of its own.
// =============================================================================

'use client'

import { Clock, CheckCircle2, XCircle, AlarmClock } from 'lucide-react'

interface StatusBarProps {
  lastScanAt: string | null      // ISO timestamp from /api/signals/list
  nextScanAt: string | null      // ISO timestamp; null until Phase F cron is wired
  pendingCount: number
  approvedCount: number
  historyCount: number
}

export default function StatusBar({
  lastScanAt,
  nextScanAt,
  pendingCount,
  approvedCount,
  historyCount,
}: StatusBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        <span>
          Last scan:{' '}
          <span className="text-foreground">{formatRelative(lastScanAt)}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <AlarmClock className="h-3.5 w-3.5" />
        <span>
          Next scan:{' '}
          <span className="text-foreground">
            {nextScanAt ? formatRelative(nextScanAt) : 'Manual only'}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-yellow-500" />
          {pendingCount} pending
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        <span>{approvedCount} approved</span>
      </div>

      <div className="flex items-center gap-1.5">
        <XCircle className="h-3.5 w-3.5" />
        <span>{historyCount} in 24h history</span>
      </div>
    </div>
  )
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  const diffMin = Math.round(diffMs / 60_000)

  if (diffMin < 0) {
    // Future timestamp (next scan)
    const absMin = Math.abs(diffMin)
    if (absMin < 60) return `in ${absMin}m`
    return `in ${Math.round(absMin / 60)}h`
  }
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}
