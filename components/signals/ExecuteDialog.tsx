// FILE: components/signals/ExecuteDialog.tsx
// =============================================================================
// Modal shown when user clicks "I placed this trade"
// =============================================================================
// Asks for the actual fill price + contract count, optional notes.
// On submit, calls POST /api/signals/[id]/execute which:
//   1. Creates a row in the trades table
//   2. Updates the signal status to 'executed'
//   3. Links signal -> trade via executed_trade_id
//
// Built without an external dialog library — plain Tailwind + React.
// Mobile-friendly: closes on backdrop tap, full-width on small screens.
// =============================================================================

'use client'

import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { Signal } from '@/types/signals'

interface ExecuteDialogProps {
  signal: Signal
  open: boolean
  onClose: () => void
  onExecuted: () => void
}

export default function ExecuteDialog({ signal, open, onClose, onExecuted }: ExecuteDialogProps) {
  const [fillPrice, setFillPrice] = useState('')
  const [contracts, setContracts] = useState('1')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state whenever a new signal is opened
  useEffect(() => {
    if (open) {
      setFillPrice('')
      setContracts('1')
      setNotes('')
      setError(null)
      setSubmitting(false)
    }
  }, [open, signal.id])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  // Is this a credit-side trade? (any sell leg = credit)
  const isCredit = (signal.legs_json ?? []).some(l => l.action === 'sell')

  async function submit() {
    setError(null)
    const fillNum = parseFloat(fillPrice)
    const contractsNum = parseInt(contracts, 10)

    if (!Number.isFinite(fillNum) || fillNum <= 0) {
      setError('Fill price must be a positive number (per contract, in $)')
      return
    }
    if (!Number.isInteger(contractsNum) || contractsNum < 1) {
      setError('Contracts must be a whole number >= 1')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/signals/${signal.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualFillPrice: fillNum,
          contracts: contractsNum,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Execution failed')
        return
      }
      onExecuted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg w-full max-w-md p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Record Trade Execution</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {signal.ticker} · {signal.strategy_name}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="fillPrice" className="block text-sm font-medium mb-1">
              Actual fill price <span className="text-muted-foreground font-normal">(per contract, in $)</span>
            </label>
            <input
              id="fillPrice"
              type="number"
              step="0.01"
              min="0"
              value={fillPrice}
              onChange={e => setFillPrice(e.target.value)}
              placeholder={isCredit ? 'e.g. 0.80 (credit received)' : 'e.g. 1.50 (debit paid)'}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isCredit
                ? 'Net credit you received when the order filled.'
                : 'Net debit you paid when the order filled.'}
            </p>
          </div>

          <div>
            <label htmlFor="contracts" className="block text-sm font-medium mb-1">
              Number of contracts
            </label>
            <input
              id="contracts"
              type="number"
              step="1"
              min="1"
              value={contracts}
              onChange={e => setContracts(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium mb-1">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Filled slightly worse than mid; market choppy"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 bg-muted hover:bg-muted/70 text-sm font-medium rounded-md px-4 py-2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || !fillPrice}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md px-4 py-2 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Record trade'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
