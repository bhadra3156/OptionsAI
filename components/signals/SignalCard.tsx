// FILE: components/signals/SignalCard.tsx
// =============================================================================
// SignalCard — the primary visual component for a single signal
// =============================================================================
// Used in both the Pending and Approved sections. Different action buttons
// depending on status, but everything else (metrics, rationale, IBKR ticket)
// stays consistent for a familiar feel.
//
// Sections:
//   Header:   Ticker · Strategy · Confidence badge · Risk badge
//   Metrics:  POP, DTE, max profit, max loss in a tidy grid
//   Actions:  Status-dependent buttons (Approve/Reject OR Execute/Abandon)
//   IBKR ticket: collapsible, with copy-to-clipboard
//   Rationale: collapsible
//   Warnings: shown if any, always visible
// =============================================================================

'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  PlayCircle,
  TimerReset,
} from 'lucide-react'
import type { Signal, SignalLeg } from '@/types/signals'

interface SignalCardProps {
  signal: Signal
  variant: 'pending' | 'approved'
  onApprove?: () => void           // pending only
  onReject?: () => void            // pending only
  onExecute?: () => void           // approved only — opens the dialog
  onAbandon?: () => void           // approved only
}

export default function SignalCard({
  signal,
  variant,
  onApprove,
  onReject,
  onExecute,
  onAbandon,
}: SignalCardProps) {
  const [ticketOpen, setTicketOpen] = useState(variant === 'approved')
  const [rationaleOpen, setRationaleOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [actionInFlight, setActionInFlight] = useState<string | null>(null)

  // DTE computed from the latest leg expiry
  const dte = computeDte(signal.legs_json)

  async function copyTicket() {
    try {
      await navigator.clipboard.writeText(signal.ibkr_ticket)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // older browsers / iframes might block clipboard — show a fallback
      setCopied(false)
    }
  }

  function wrapAction(name: string, fn?: () => void) {
    if (!fn) return
    setActionInFlight(name)
    Promise.resolve(fn()).finally(() => setActionInFlight(null))
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-xl font-bold">{signal.ticker}</h3>
            <span className="text-muted-foreground">·</span>
            <span className="text-base font-medium">{signal.strategy_name}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {variant === 'approved' && signal.responded_at
              ? `Approved at ${formatTime(signal.responded_at)}`
              : `Qualified at ${formatTime(signal.qualified_at)}`}
            {dte !== null && ` · ${dte} DTE`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ConfidenceBadge value={signal.confidence} />
          <RiskBadge value={signal.risk_rating} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Metric label="POP" value={signal.metrics_json.probabilityOfProfit} />
        <Metric label="Max profit" value={signal.metrics_json.maxProfit} />
        <Metric label="Max loss" value={signal.metrics_json.maxLoss} highlight />
        <Metric label="IV Rank" value={`${signal.iv_rank}/100`} />
      </div>

      {/* Action buttons — depend on variant */}
      {variant === 'pending' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => wrapAction('approve', onApprove)}
            disabled={actionInFlight !== null}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md px-4 py-2 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {actionInFlight === 'approve' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve
          </button>
          <button
            onClick={() => wrapAction('reject', onReject)}
            disabled={actionInFlight !== null}
            className="flex-1 bg-muted hover:bg-muted/70 text-sm font-medium rounded-md px-4 py-2 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {actionInFlight === 'reject' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Reject
          </button>
        </div>
      )}

      {variant === 'approved' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => wrapAction('execute', onExecute)}
            disabled={actionInFlight !== null}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md px-4 py-2 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <PlayCircle className="h-4 w-4" />
            I placed this trade
          </button>
          <button
            onClick={() => wrapAction('abandon', onAbandon)}
            disabled={actionInFlight !== null}
            className="bg-muted hover:bg-muted/70 text-sm font-medium rounded-md px-3 py-2 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {actionInFlight === 'abandon' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TimerReset className="h-4 w-4" />
            )}
            Skip
          </button>
        </div>
      )}

      {/* IBKR ticket — collapsible */}
      <div>
        <button
          onClick={() => setTicketOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {ticketOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          IBKR Ticket
        </button>
        {ticketOpen && (
          <div className="mt-2 relative">
            <pre className="bg-background border border-border rounded-md p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
              {signal.ibkr_ticket}
            </pre>
            <button
              onClick={copyTicket}
              className="absolute top-2 right-2 inline-flex items-center gap-1 bg-muted hover:bg-muted/70 text-xs px-2 py-1 rounded-md transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Rationale — collapsible */}
      <div>
        <button
          onClick={() => setRationaleOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {rationaleOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          AI Rationale
        </button>
        {rationaleOpen && (
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {signal.rationale}
          </p>
        )}
      </div>

      {/* Warnings — always visible if present */}
      {signal.warnings && signal.warnings.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-md p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Risks &amp; warnings
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 ml-5 list-disc">
            {signal.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// SUB-COMPONENTS
// -----------------------------------------------------------------------------

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-medium mt-0.5 ${highlight ? 'text-orange-400' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 85 ? 'text-green-400 border-green-500/30 bg-green-500/10'
             : value >= 75 ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
             : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${color}`}>
      Conf {value}
    </span>
  )
}

function RiskBadge({ value }: { value: number }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border border-border bg-muted text-muted-foreground">
      Risk {value}/5
    </span>
  )
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function computeDte(legs: SignalLeg[] | null): number | null {
  if (!legs || legs.length === 0) return null
  const latest = legs.map(l => l.expiry).sort().reverse()[0]
  if (!latest) return null
  const ms = new Date(latest).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.round((ms - Date.now()) / 86_400_000))
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
