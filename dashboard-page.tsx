// FILE: app/(dashboard)/dashboard/page.tsx
// The main dashboard page — where the user enters a ticker and gets a strategy.
// This is a CLIENT component because it needs useState for the form and results.
// The actual API calls go through our /api/analyze route — never directly to Polygon or Claude.

'use client'

import { useState } from 'react'
import { UserButton } from '@clerk/nextjs'
import { TrendingUp, Search, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { AnalyzeResponse } from '@/types/strategy'

// ── Sub-components ────────────────────────────────────────────────────────────
// These will be built in Phase 6. For now we show raw JSON so you can verify everything works.

export default function DashboardPage() {
  const [ticker, setTicker] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()

    // Basic validation
    if (!ticker.trim()) return
    if (ticker.trim().length > 5) {
      setError('Ticker symbols are 1–5 letters. Try AAPL, TSLA, or SPY.')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase() }),
      })

      const data = await response.json()

      if (!response.ok) {
        // The API returned an error — show it to the user
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      setResult(data as AnalyzeResponse)

    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">OptionsAI</span>
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-6 py-16">

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Analyse Any Ticker
          </h1>
          <p className="text-muted-foreground text-lg">
            Enter a US stock symbol to receive an institutional-grade options strategy
          </p>
        </div>

        {/* ── Ticker Input Form ──────────────────────────────────────── */}
        <form onSubmit={handleAnalyze} className="flex gap-3 mb-8">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter ticker (e.g. AAPL)"
            maxLength={5}
            className="flex-1 bg-card border border-border rounded-md px-4 py-3 text-lg font-mono tracking-wider placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary uppercase"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !ticker.trim()}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Analyse
              </>
            )}
          </button>
        </form>

        {/* ── Error Display ──────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-md p-4 mb-8">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* ── Loading State ──────────────────────────────────────────── */}
        {isLoading && (
          <div className="text-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Fetching live market data and generating strategy...</p>
            <p className="text-sm text-muted-foreground mt-1">This takes 5–10 seconds</p>
          </div>
        )}

        {/* ── Strategy Result ────────────────────────────────────────── */}
        {result && !isLoading && (
          <div className="space-y-6">

            {/* Strategy Name and Outlook */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">{result.strategy.strategyName}</h2>
                  <p className="text-muted-foreground capitalize mt-1">
                    Market Outlook: {result.strategy.marketOutlook}
                  </p>
                </div>
                <span className="bg-primary/10 text-primary border border-primary/20 rounded-md px-3 py-1 text-sm font-medium">
                  Risk: {result.strategy.metrics.riskRating}/5
                </span>
              </div>

              {/* Rationale */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {result.strategy.rationale}
              </p>
            </div>

            {/* Market Data Summary */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">
                Market Data — {result.marketData.ticker}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <DataPoint label="Price" value={`$${result.marketData.currentPrice.toFixed(2)}`} />
                <DataPoint label="IV Rank" value={`${result.marketData.ivRank}`} highlight={result.marketData.ivRank > 50} />
                <DataPoint label="IV30" value={`${result.marketData.iv30.toFixed(1)}%`} />
                <DataPoint label="VIX" value={`${result.marketData.vix}`} />
                <DataPoint label="Put/Call" value={result.marketData.putCallRatio.toFixed(2)} />
                <DataPoint label="IV Premium" value={`${result.marketData.ivPremium > 0 ? '+' : ''}${result.marketData.ivPremium.toFixed(1)}%`} />
                <DataPoint label="HV30" value={`${result.marketData.historicalVol30.toFixed(1)}%`} />
                <DataPoint label="Earnings" value={result.marketData.daysToEarnings === -1 ? 'Unknown' : `${result.marketData.daysToEarnings}d`} />
              </div>
            </div>

            {/* Trade Legs */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">
                Trade Legs
              </h3>
              <div className="space-y-2">
                {result.strategy.legs.map((leg, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm font-mono">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                      leg.action === 'buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {leg.action}
                    </span>
                    <span>{leg.quantity} contract{leg.quantity > 1 ? 's' : ''}</span>
                    <span className="uppercase">{leg.type}</span>
                    <span>${leg.strike}</span>
                    <span className="text-muted-foreground">{leg.expiry}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">
                Risk / Reward
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DataPoint label="Max Profit" value={result.strategy.metrics.maxProfit} positive />
                <DataPoint label="Max Loss" value={result.strategy.metrics.maxLoss} negative />
                <DataPoint label="Prob. of Profit" value={result.strategy.metrics.probabilityOfProfit} highlight />
                {result.strategy.metrics.breakeven.map((be, i) => (
                  <DataPoint key={i} label={`Breakeven ${result.strategy.metrics.breakeven.length > 1 ? i + 1 : ''}`} value={be} />
                ))}
              </div>
            </div>

            {/* Timing */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">
                Timing Rules
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <DataPoint label="Enter at DTE" value={`${result.strategy.timing.idealEntryDTE} days`} />
                <DataPoint label="Exit at DTE" value={`${result.strategy.timing.closeAtDTE} days`} />
                <DataPoint label="Profit Target" value={result.strategy.timing.closeProfitTarget} />
                <DataPoint label="Stop Loss" value={result.strategy.timing.stopLoss} />
              </div>
            </div>

            {/* Warnings */}
            {result.strategy.warnings.length > 0 && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-6">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-yellow-500/80">
                  ⚠ Warnings
                </h3>
                <ul className="space-y-2">
                  {result.strategy.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-yellow-500/70 flex items-start gap-2">
                      <span className="shrink-0">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Legal Disclaimer */}
            <div className="border-t border-border pt-6">
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                This analysis is for educational and informational purposes only. It does not constitute
                financial advice. Options trading involves significant risk and is not suitable for all investors.
                You may lose more than your initial investment.
              </p>
            </div>

          </div>
        )}

      </main>
    </div>
  )
}

// Small helper component for consistent data display
function DataPoint({
  label,
  value,
  highlight = false,
  positive = false,
  negative = false,
}: {
  label: string
  value: string
  highlight?: boolean
  positive?: boolean
  negative?: boolean
}) {
  const valueClass = positive
    ? 'text-emerald-400'
    : negative
    ? 'text-red-400'
    : highlight
    ? 'text-primary'
    : 'text-foreground'

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-semibold text-sm ${valueClass}`}>{value}</p>
    </div>
  )
}
