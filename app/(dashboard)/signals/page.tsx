// FILE: app/(dashboard)/signals/page.tsx
// =============================================================================
// /signals — AI-qualified trade opportunities
// =============================================================================
// This is the main UI for the /signals feature. Three sections:
//   1. Pending: signals awaiting your YES/NO decision
//   2. Approved: signals you've said YES to, awaiting actual IBKR placement
//   3. History: rejected/expired/executed/abandoned from the last 24h
//
// Data flow:
//   - On mount: GET /api/signals/list
//   - Auto-refresh: every 30 seconds (keeps UI in sync with phone/Telegram taps)
//   - User actions: POST to approve/reject/execute/abandon, then refetch
//   - Scan Now button: POST /api/signals/scan, then refetch
//
// Legal: required disclaimer at the bottom per project rules.
// =============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import { Sparkles, Loader2, Inbox } from 'lucide-react'
import type { Signal, SignalsListResponse } from '@/types/signals'
import StatusBar from '@/components/signals/StatusBar'
import ScanButton from '@/components/signals/ScanButton'
import SignalCard from '@/components/signals/SignalCard'
import HistoryRow from '@/components/signals/HistoryRow'
import ExecuteDialog from '@/components/signals/ExecuteDialog'

const REFRESH_INTERVAL_MS = 30_000  // 30 seconds

export default function SignalsPage() {
  const [data, setData] = useState<SignalsListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [executingSignal, setExecutingSignal] = useState<Signal | null>(null)

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/list')
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Failed to load signals')
        return
      }
      setData(body as SignalsListResponse)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    refetch()
    const id = setInterval(refetch, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refetch])

  // -------------------------------------------------------------------------
  // Actions — each posts then refetches
  // -------------------------------------------------------------------------

  async function approve(id: string) {
    await fetch(`/api/signals/${id}/approve`, { method: 'POST' })
    await refetch()
  }
  async function reject(id: string) {
    await fetch(`/api/signals/${id}/reject`, { method: 'POST' })
    await refetch()
  }
  async function abandon(id: string) {
    await fetch(`/api/signals/${id}/abandon`, { method: 'POST' })
    await refetch()
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const pending = data?.pending ?? []
  const approved = data?.approved ?? []
  const history = data?.history ?? []

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Signals
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              AI-qualified options trade opportunities, ruthlessly disciplined.
            </p>
          </div>
          <ScanButton onScanComplete={refetch} />
        </div>

        {/* Status bar */}
        <StatusBar
          lastScanAt={data?.lastScanAt ?? null}
          nextScanAt={data?.nextScanAt ?? null}
          pendingCount={pending.length}
          approvedCount={approved.length}
          historyCount={history.length}
        />

        {/* Error banner (if any) */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* PENDING section */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-yellow-400 mb-3">
            ⏳ Pending approval ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <EmptyState text="No pending signals. Tap “Scan Now” to look for opportunities." />
          ) : (
            <div className="space-y-4">
              {pending.map(signal => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  variant="pending"
                  onApprove={() => approve(signal.id)}
                  onReject={() => reject(signal.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* APPROVED section */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-3">
            ✅ Approved — ready to place ({approved.length})
          </h2>
          {approved.length === 0 ? (
            <EmptyState text="No approved signals waiting for execution." />
          ) : (
            <div className="space-y-4">
              {approved.map(signal => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  variant="approved"
                  onExecute={() => setExecutingSignal(signal)}
                  onAbandon={() => abandon(signal.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* HISTORY section */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            📜 History (last 24 hours) ({history.length})
          </h2>
          {history.length === 0 ? (
            <EmptyState text="Nothing closed out in the last 24 hours." />
          ) : (
            <div className="bg-card border border-border rounded-lg">
              {history.map(signal => (
                <HistoryRow key={signal.id} signal={signal} />
              ))}
            </div>
          )}
        </section>

        {/* Legal disclaimer — required on any page showing strategy output */}
        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-6 mt-8">
          This analysis is for educational and informational purposes only. It does not constitute
          financial advice. Options trading involves significant risk and is not suitable for all
          investors. You may lose more than your initial investment.
        </p>
      </div>

      {/* Execute dialog (rendered when a signal is selected for execution) */}
      {executingSignal && (
        <ExecuteDialog
          signal={executingSignal}
          open={executingSignal !== null}
          onClose={() => setExecutingSignal(null)}
          onExecuted={refetch}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
