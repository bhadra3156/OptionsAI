// FILE: app/(dashboard)/scan/page.tsx
// Market Scan page — scans 30 tickers and shows ranked opportunities.
// Now with localStorage persistence + timestamp until manual Refresh.

'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Nav from '@/components/layout/nav'
import {
  TrendingUp, RefreshCw, Loader2, AlertCircle,
  ArrowUpRight, ArrowDownRight, Activity,
  Zap, BarChart3, TrendingDown, ExternalLink, Clock
} from 'lucide-react'
import type { ScanResult } from '@/lib/scanner'

interface ScanResponse {
  results: ScanResult[]
  scannedAt: string
  totalScanned: number
}

const SCAN_STORAGE_KEY = 'optionsai_last_scan'

const SIGNAL_STYLES = {
  'SELL PREMIUM': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'BUY OPTIONS': 'bg-primary/10 text-primary border-primary/20',
  'NEUTRAL': 'bg-muted text-muted-foreground border-border',
}

const SCORE_COLOUR = (score: number) => {
  if (score >= 70) return 'text-primary'
  if (score >= 50) return 'text-yellow-400'
  return 'text-muted-foreground'
}

const IVR_COLOUR = (ivRank: number) => {
  if (ivRank >= 60) return 'text-orange-400'
  if (ivRank >= 40) return 'text-yellow-400'
  return 'text-primary'
}

export default function ScanPage() {
  const router = useRouter()
  const [data, setData] = useState<ScanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'sell' | 'buy' | 'unusual'>('all')
  const [loadingStep, setLoadingStep] = useState('')
  const [isCached, setIsCached] = useState(false)

  const runScan = useCallback(async (forceFresh = false) => {
    if (!forceFresh) {
      const cached = localStorage.getItem(SCAN_STORAGE_KEY)
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as ScanResponse
          setData(parsed)
          setIsCached(true)
          return
        } catch (e) {
          console.error('Failed to parse cached scan')
        }
      }
    }

    setLoading(true)
    setError(null)
    setData(null)
    setIsCached(false)

    const steps = [
      'Connecting to markets...',
      'Scanning ETFs and mega caps...',
      'Scanning high IV favourites...',
      'Calculating metrics...',
      'AI scoring all opportunities...',
    ]
    let stepIndex = 0
    setLoadingStep(steps[0])
    const interval = setInterval(() => {
      stepIndex = Math.min(stepIndex + 1, steps.length - 1)
      setLoadingStep(steps[stepIndex])
    }, 4000)

    try {
      const res = await fetch('/api/scan')
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Scan failed.'); return }
      setData(json as ScanResponse)
      localStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(json))
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      clearInterval(interval)
      setLoading(false)
      setLoadingStep('')
    }
  }, [])

  // Load cached data on mount
  useEffect(() => {
    runScan(false)
  }, [runScan])

  const getFilteredResults = () => {
    if (!data) return []
    switch (activeFilter) {
      case 'sell': return [...data.results].filter(r => r.signal === 'SELL PREMIUM').sort((a, b) => b.aiScore - a.aiScore)
      case 'buy': return [...data.results].filter(r => r.signal === 'BUY OPTIONS').sort((a, b) => b.aiScore - a.aiScore)
      case 'unusual': return [...data.results].sort((a, b) => b.volOiRatio - a.volOiRatio).slice(0, 10)
      default: return [...data.results].sort((a, b) => b.aiScore - a.aiScore)
    }
  }

  const filtered = getFilteredResults()
  const sellCount = data?.results.filter(r => r.signal === 'SELL PREMIUM').length ?? 0
  const buyCount = data?.results.filter(r => r.signal === 'BUY OPTIONS').length ?? 0
  const topScore = data?.results[0]?.aiScore ?? 0

  const cachedTime = data && isCached 
    ? new Date(data.scannedAt).toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      })
    : ''

  return (
    <div className="min-h-screen bg-background text-foreground">

      <Nav />

      <main className="max-w-6xl mx-auto px-6 py-10">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Market Scan</h1>
            <p className="text-muted-foreground">
              {data
                ? `${data.totalScanned} tickers scanned · ${isCached ? 'Cached' : 'Live'}`
                : 'Scanning 30 of the most liquid options markets...'}
            </p>
          </div>
          <button
            onClick={() => runScan(true)}
            disabled={loading}
            className="flex items-center gap-2 bg-card border border-border text-sm font-medium px-4 py-2 rounded-md hover:bg-secondary/50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? 'Scanning...' : 'Refresh'}
          </button>
        </div>

        {/* Cached Banner */}
        {isCached && data && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md px-4 py-3 mb-6 flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-sm text-yellow-600">
                Cached scan from <span className="font-mono font-medium">{cachedTime}</span>
              </p>
              <p className="text-xs text-yellow-600/70">Click Refresh for latest scan</p>
            </div>
          </div>
        )}

        {/* IV Rank notice */}
        <div className="bg-card border border-border rounded-lg px-5 py-3 mb-6 flex items-start gap-3">
          <ExternalLink className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">IV Rank shown here is estimated.</span>{' '}
            For accurate 52-week IV Rank before trading, verify at{' '}
            <a
              href="https://marketchameleon.com/volReports/VolatilityRankings"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Market Chameleon ↗
            </a>
            {' '}— free, no account needed. This is what professional options traders use daily.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-border mb-6">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
            <p className="text-foreground font-medium mb-2">{loadingStep}</p>
            <p className="text-sm text-muted-foreground">Scanning 30 tickers — takes about 20 seconds</p>
            <div className="flex justify-center gap-1 mt-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-1 w-8 rounded-full bg-border overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-md p-4 mb-8">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-destructive font-medium mb-1">{error}</p>
              <button onClick={() => runScan(true)} className="text-xs text-destructive/70 hover:text-destructive underline">Try again</button>
            </div>
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <SummaryCard icon={Activity} label="Tickers Scanned" value={data.totalScanned.toString()} />
              <SummaryCard icon={TrendingDown} label="Sell Premium" value={sellCount.toString()} sub="IV Rank > 50" colour="text-orange-400" />
              <SummaryCard icon={ArrowUpRight} label="Buy Options" value={buyCount.toString()} sub="IV Rank < 30" colour="text-primary" />
              <SummaryCard icon={Zap} label="Top AI Score" value={`${topScore}/100`} sub={data.results[0]?.ticker ?? ''} colour={SCORE_COLOUR(topScore)} />
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { key: 'all', label: 'All Opportunities', icon: BarChart3 },
                { key: 'sell', label: `Sell Premium (${sellCount})`, icon: TrendingDown },
                { key: 'buy', label: `Buy Options (${buyCount})`, icon: ArrowUpRight },
                { key: 'unusual', label: 'Unusual Activity', icon: Zap },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key as typeof activeFilter)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md transition-colors ${
                    activeFilter === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">

              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_90px_60px_60px_60px_90px_80px_120px] gap-2 px-4 py-3 border-b border-border bg-secondary/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <div>Ticker</div>
                <div className="text-right">Price</div>
                <div className="text-right">
                  IV Rank*
                </div>
                <div className="text-right">IV30</div>
                <div className="text-right">Vol/OI</div>
                <div className="text-right">P/C</div>
                <div className="text-center">Signal</div>
                <div className="text-center">AI Score</div>
                <div className="text-right">Actions</div>
              </div>

              {/* Rows */}
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No results for this filter.</div>
              ) : (
                filtered.map((result, index) => (
                  <ScanRow
                    key={result.ticker}
                    result={result}
                    rank={index + 1}
                    onAnalyse={() => router.push(`/dashboard?ticker=${result.ticker}`)}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-muted-foreground">
                * IV Rank is estimated — not a true 52-week calculation. Always verify before trading.
              </p>
              <a
                href="https://marketchameleon.com/volReports/VolatilityRankings"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              >
                <ExternalLink className="h-3 w-3" />
                Verify IV Rank at Market Chameleon (free)
              </a>
            </div>
          </>
        )}

      </main>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, sub, colour = 'text-foreground' }: {
  icon: React.ElementType; label: string; value: string; sub?: string; colour?: string
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colour}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function ScanRow({ result, rank, onAnalyse }: {
  result: ScanResult; rank: number; onAnalyse: () => void
}) {
  const isTop3 = rank <= 3
  const mcUrl = `https://marketchameleon.com/Overview/${result.ticker}/IV/`

  return (
    <div className={`grid grid-cols-[1fr_80px_90px_60px_60px_60px_90px_80px_120px] gap-2 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/20 transition-colors items-center ${isTop3 ? 'bg-primary/[0.02]' : ''}`}>

      {/* Ticker */}
      <div className="flex items-center gap-2 min-w-0">
        {isTop3 && (
          <span className="text-xs font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0">#{rank}</span>
        )}
        <div className="min-w-0">
          <div className="font-bold text-sm">{result.ticker}</div>
          <div className="text-xs text-muted-foreground truncate">{result.category}</div>
        </div>
      </div>

      {/* Price */}
      <div className="text-right text-sm font-mono">
        ${result.currentPrice < 100 ? result.currentPrice.toFixed(2) : result.currentPrice.toFixed(0)}
      </div>

      {/* IV Rank — with Market Chameleon link */}
      <div className="text-right">
        <div className="flex items-center justify-end gap-1">
          <span className={`text-sm font-bold ${IVR_COLOUR(result.ivRank)}`}>{result.ivRank}~</span>
          <a
            href={mcUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Verify real IV Rank at Market Chameleon"
            className="text-muted-foreground hover:text-primary transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="w-full bg-border rounded-full h-1 mt-1">
          <div
            className={`h-1 rounded-full ${result.ivRank >= 60 ? 'bg-orange-400' : result.ivRank >= 40 ? 'bg-yellow-400' : 'bg-primary'}`}
            style={{ width: `${Math.max(result.ivRank, 2)}%` }}
          />
        </div>
      </div>

      {/* IV30 */}
      <div className="text-right text-sm text-muted-foreground">{result.iv30.toFixed(0)}%</div>

      {/* Vol/OI */}
      <div className={`text-right text-sm font-medium ${result.volOiRatio > 1 ? 'text-primary' : 'text-muted-foreground'}`}>
        {result.volOiRatio.toFixed(2)}
      </div>

      {/* Put/Call */}
      <div className="text-right text-sm text-muted-foreground">{result.putCallRatio.toFixed(2)}</div>

      {/* Signal */}
      <div className="text-center">
        <span className={`text-xs font-semibold px-2 py-1 rounded border inline-block ${SIGNAL_STYLES[result.signal]}`}>
          {result.signal === 'SELL PREMIUM' ? 'SELL' : result.signal === 'BUY OPTIONS' ? 'BUY' : '—'}
        </span>
      </div>

      {/* AI Score */}
      <div className="text-center">
        <div className={`text-lg font-bold ${SCORE_COLOUR(result.aiScore)}`}>{result.aiScore}</div>
        <div className="text-xs text-muted-foreground">/100</div>
      </div>

      {/* Actions — Analyse + Market Chameleon */}
      <div className="flex items-center justify-end gap-2">
        <a
          href={mcUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Real IV Rank on Market Chameleon"
          className="text-xs text-muted-foreground hover:text-primary border border-border rounded px-2 py-1.5 transition-colors whitespace-nowrap flex items-center gap-1"
          onClick={e => e.stopPropagation()}
        >
          IV <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={onAnalyse}
          className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 transition-colors whitespace-nowrap"
        >
          Analyse →
        </button>
      </div>

    </div>
  )
}