// FILE: components/signals/HistoryRow.tsx
// =============================================================================
// Compact one-line row for a past signal in the 24h history section.
// Single line, read-only, optionally expandable to show the rationale.
// =============================================================================

'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Signal } from '@/types/signals'

interface HistoryRowProps {
  signal: Signal
}

const STATUS_STYLES: Record<Signal['status'], { label: string; cls: string }> = {
  rejected:  { label: 'REJECTED',  cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  expired:   { label: 'EXPIRED',   cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
  executed:  { label: 'EXECUTED',  cls: 'bg-green-500/10 text-green-400 border-green-500/30' },
  abandoned: { label: 'ABANDONED', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  pending:   { label: 'PENDING',   cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  approved:  { label: 'APPROVED',  cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
}

export default function HistoryRow({ signal }: HistoryRowProps) {
  const [expanded, setExpanded] = useState(false)
  const style = STATUS_STYLES[signal.status]
  const time = new Date(signal.updated_at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 py-2 px-1 hover:bg-muted/30 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-xs text-muted-foreground tabular-nums w-12 flex-shrink-0">
          {time}
        </span>
        <span className="font-medium text-sm w-16 flex-shrink-0">{signal.ticker}</span>
        <span className="text-sm text-muted-foreground flex-1 truncate">
          {signal.strategy_name}
        </span>
        <span
          className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border flex-shrink-0 ${style.cls}`}
        >
          {style.label}
        </span>
      </button>

      {expanded && (
        <div className="pl-9 pr-2 pb-3 text-xs text-muted-foreground space-y-1">
          <div>
            <span className="text-foreground">Confidence:</span> {signal.confidence}/100 ·{' '}
            <span className="text-foreground">IV Rank:</span> {signal.iv_rank} ·{' '}
            <span className="text-foreground">Risk:</span> {signal.risk_rating}/5
          </div>
          {signal.rationale && (
            <div className="leading-relaxed">{signal.rationale}</div>
          )}
        </div>
      )}
    </div>
  )
}
