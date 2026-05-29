// FILE: app/(dashboard)/dashboard/page.tsx
// Added: localStorage persistence + timestamp for cached analysis

'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import Nav from '@/components/layout/nav'
import {
  TrendingUp, Search, Loader2, AlertCircle,
  ArrowUpRight, ArrowDownRight, Minus,
  ShieldCheck, Clock, AlertTriangle, ChevronRight,
  ChevronDown, ChevronUp, CheckCircle2, BookOpen,
  Move, Target, Activity, Calculator, Bookmark, BookmarkCheck, Star, X, BarChart2
} from 'lucide-react'
import type { AnalyzeResponse } from '@/types/strategy'
import { getRiskLabel, getRiskColour, formatDate } from '@/lib/utils'

const DASHBOARD_STORAGE_KEY = 'optionsai_last_dashboard_analysis'

function estimateGreeks(
  strike: number,
  price: number,
  iv30Percent: number,
  dte: number,
  action: 'buy' | 'sell',
  type: 'call' | 'put'
) {
  const iv = iv30Percent / 100
  const t = Math.max(dte, 1) / 365
  const sqrtT = Math.sqrt(t)
  const moneyness = (price - strike) / (price * iv * sqrtT)
  let rawDelta: number
  if (type === 'call') {
    rawDelta = Math.max(0.02, Math.min(0.98, 0.5 + moneyness * 0.2))
  } else {
    rawDelta = Math.max(-0.98, Math.min(-0.02, -0.5 + moneyness * 0.2))
  }
  const gamma = Math.max(0.0001, 0.4 * Math.exp(-0.5 * moneyness * moneyness) / (price * iv * sqrtT))
  const thetaPerDay = (price * iv * 0.4) / (2 * Math.sqrt(365 / Math.max(dte, 1))) / 100
  const vega = (price * sqrtT * 0.4) / 100
  if (action === 'sell') {
    return {
      delta: Math.round(-rawDelta * 1000) / 1000,
      gamma: Math.round(-gamma * 10000) / 10000,
      theta: Math.round(thetaPerDay * 100) / 100,
      vega: Math.round(-vega * 100) / 100,
    }
  } else {
    return {
      delta: Math.round(rawDelta * 1000) / 1000,
      gamma: Math.round(gamma * 10000) / 10000,
      theta: Math.round(-thetaPerDay * 100) / 100,
      vega: Math.round(vega * 100) / 100,
    }
  }
}

// ... [All your existing helper functions remain exactly the same: GreeksExplainerCard, 
// calculateExpectedMove, assessStrikes, CHECKLIST, PositionSizingCard, PnLCurveCard, 
// OutlookBadge, RiskPips, SectionLabel, MetricTile, TimingTile, ExpectedMoveCard, etc.] ...

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const [ticker, setTicker] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(true)
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [isCached, setIsCached] = useState(false)

  // Load from URL or cached result
  useEffect(() => {
    const urlTicker = searchParams.get('ticker')
    if (urlTicker) {
      const cleanTicker = urlTicker.toUpperCase()
      setTicker(cleanTicker)
      setChecklistOpen(false)
      runAnalysis(cleanTicker)
    } else {
      // Try to restore last cached analysis
      const cached = localStorage.getItem(DASHBOARD_STORAGE_KEY)
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as AnalyzeResponse
          setResult(parsed)
          setIsCached(true)
        } catch (e) {
          console.error('Failed to parse cached dashboard result')
        }
      }
    }
  }, [searchParams])

  // Save fresh result to localStorage
  useEffect(() => {
    if (result && !isCached) {
      localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(result))
    }
  }, [result, isCached])

  async function runAnalysis(targetTicker: string) {
    setIsLoading(true)
    setError(null)
    setIsCached(false)
    setLoadingMsg('Fetching live options chain...')

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: targetTicker }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Something went wrong.')
        return
      }

      setResult(data as AnalyzeResponse)
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setIsLoading(false)
      setLoadingMsg('')
    }
  }

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticker.trim()) return
    runAnalysis(ticker.trim().toUpperCase())
  }

  const cachedTime = result && isCached 
    ? new Date(result.generatedAt || Date.now()).toLocaleTimeString('en-GB', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      })
    : ''

  // ... rest of your original code (watchlist, addToWatchlist, removeFromWatchlist, etc.) remains unchanged ...

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Strategy Analysis</h1>
          <p className="text-muted-foreground">Enter any US stock ticker with listed options</p>
        </div>

        <form onSubmit={handleAnalyze} className="flex gap-3 mb-6">
          <input
            type="text"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            placeholder="Enter ticker — e.g. AAPL, TSLA, SPY, QQQ"
            maxLength={5}
            className="flex-1 bg-card border border-border rounded-md px-4 py-3 text-base font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
            autoFocus
          />
          <button type="submit" disabled={isLoading || !ticker.trim()} className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Analysing...</> : <><Search className="h-4 w-4" />Analyse</>}
          </button>
        </form>

        {/* Cached Banner */}
        {isCached && result && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md px-4 py-3 mb-6 flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-sm text-yellow-600">
                Cached analysis from <span className="font-mono font-medium">{cachedTime}</span>
              </p>
              <p className="text-xs text-yellow-600/70">Enter new ticker or click Analyse for fresh data</p>
            </div>
          </div>
        )}

        {/* Watchlist, Checklist, Error, Loading, and Results sections remain exactly as in your original code */}
        {/* ... Paste all your original JSX from watchlist to the end here ... */}

        {result && !isLoading && (
          <div className="space-y-4">
            {/* Your original result rendering code (Strategy Header, Risk/Reward, Expected Move, Greeks, etc.) */}
            {/* ... unchanged ... */}
          </div>
        )}
      </main>
    </div>
  )
}

// Keep ALL your existing helper functions (GreeksExplainerCard, ExpectedMoveCard, PositionSizingCard, PnLCurveCard, etc.) exactly as they were in the file you provided.