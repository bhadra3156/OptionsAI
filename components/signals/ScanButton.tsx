// FILE: components/signals/ScanButton.tsx
// =============================================================================
// Manual "Scan Now" trigger
// =============================================================================
// Calls POST /api/signals/scan, then notifies parent to refresh.
// Disabled while a scan is in flight. Shows progress feedback.
//
// IMPORTANT: a scan can take 20-30 seconds because of Claude Opus latency.
// The button stays in 'scanning' state for the full duration to prevent
// double-trigger (which would cost extra API spend).
// =============================================================================

'use client'

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

interface ScanButtonProps {
  onScanComplete: () => void
}

export default function ScanButton({ onScanComplete }: ScanButtonProps) {
  const [scanning, setScanning] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)

  async function runScan() {
    if (scanning) return
    setScanning(true)
    setLastResult(null)

    try {
      const res = await fetch('/api/signals/scan', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setLastResult(`Error: ${data.error ?? 'unknown'}`)
        return
      }

      const { qualifiedCount, persistedCount, telegramSentCount, totalScanned } = data
      setLastResult(
        qualifiedCount > 0
          ? `✓ ${qualifiedCount} qualified, ${persistedCount} saved, ${telegramSentCount} sent to phone`
          : `Scanned ${totalScanned} — none qualified`
      )

      onScanComplete()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      setLastResult(`Error: ${msg}`)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={runScan}
        disabled={scanning}
        className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          scanning
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {scanning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning (10-30s)…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Scan Now
          </>
        )}
      </button>

      {lastResult && (
        <p className="text-xs text-muted-foreground">{lastResult}</p>
      )}
    </div>
  )
}
