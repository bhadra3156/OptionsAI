// FILE: app/(dashboard)/dashboard/page.tsx
// Added: Expected Move Calculator shown on every strategy result

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
  Move, Target, Activity
} from 'lucide-react'
import type { AnalyzeResponse } from '@/types/strategy'
import { getRiskLabel, getRiskColour, formatDate } from '@/lib/utils'

function estimateGreeks(
  strike: number,
  price: number,
  iv30Percent: number,
  dte: number,
  action: 'buy' | 'sell',
  type: 'call' | 'put'
) {
  const iv = iv30Percent / 100
  const t = dte / 365
  const sqrtT = Math.sqrt(t)

  // Estimate delta from moneyness
  // ATM options have delta ~0.50 for calls, ~-0.50 for puts
  // OTM delta decreases, ITM delta increases
  const moneyness = (price - strike) / price
  let rawDelta: number

  if (type === 'call') {
    rawDelta = Math.max(0.01, Math.min(0.99, 0.5 + moneyness * 2.5))
  } else {
    rawDelta = Math.max(-0.99, Math.min(-0.01, -0.5 + moneyness * 2.5))
  }

  // Gamma: highest at ATM, decays with time
  // Approximation: gamma ≈ 0.4 / (price × iv × sqrtT)
  const gamma = Math.max(0, 0.4 / (price * iv * sqrtT * 10))

  // Theta: time decay per day
  // Approximation: theta ≈ -(price × iv × 0.4) / (2 × sqrt(365 × dte))
  const thetaPerDay = -(price * iv * 0.4) / (2 * Math.sqrt(365 * Math.max(dte, 1))) / 100

  // Vega: sensitivity to 1% change in IV
  // Approximation: vega ≈ price × sqrtT × 0.4 / 100
  const vega = (price * sqrtT * 0.4) / 100

  // Flip signs for sell positions
  const multiplier = action === 'sell' ? -1 : 1

  return {
    delta: Math.round(rawDelta * multiplier * 1000) / 1000,
    gamma: Math.round(gamma * multiplier * 10000) / 10000,
    theta: Math.round(thetaPerDay * multiplier * 100) / 100,
    vega: Math.round(vega * multiplier * 100) / 100,
  }
}

function GreeksExplainerCard({
  legs,
  price,
  iv30,
  ticker,
}: {
  legs: AnalyzeResponse['strategy']['legs']
  price: number
  iv30: number
  ticker: string
}) {
  // Calculate Greeks for each leg
  const legGreeks = legs.map(leg => {
    // Parse expiry to get DTE
    const expiry = new Date(leg.expiry + 'T00:00:00')
    const dte = Math.max(1, Math.round((expiry.getTime() - Date.now()) / 86_400_000))

    const greeks = estimateGreeks(leg.strike, price, iv30, dte, leg.action, leg.type)
    return { ...leg, ...greeks, dte }
  })

  // Sum all legs to get position Greeks (× 100 for contract multiplier)
  const positionDelta = legGreeks.reduce((sum, l) => sum + l.delta, 0)
  const positionGamma = legGreeks.reduce((sum, l) => sum + l.gamma, 0)
  const positionTheta = legGreeks.reduce((sum, l) => sum + l.theta, 0)
  const positionVega = legGreeks.reduce((sum, l) => sum + l.vega, 0)

  // Dollar values (× 100 for 1 contract = 100 shares)
  const dollarTheta = positionTheta * 100
  const dollarVega = positionVega * 100
  const dollarDelta = positionDelta * 100

  // Generate plain English explanations
  const thetaExplain = dollarTheta >= 0
    ? `This position earns $${Math.abs(dollarTheta).toFixed(2)} per day from time decay`
    : `This position loses $${Math.abs(dollarTheta).toFixed(2)} per day from time decay`

  const vegaExplain = dollarVega >= 0
    ? `Gains $${Math.abs(dollarVega).toFixed(0)} if IV rises 1% (long volatility)`
    : `Loses $${Math.abs(dollarVega).toFixed(0)} if IV rises 1% (short volatility)`

  const vegaRisk10 = Math.abs(dollarVega * 10)
  const vegaExplain10 = dollarVega >= 0
    ? `If IV rises 10%, this position gains approximately $${vegaRisk10.toFixed(0)}`
    : `If IV rises 10%, this position loses approximately $${vegaRisk10.toFixed(0)}`

  const deltaExplain = positionDelta > 0.1
    ? `Bullish bias — gains $${Math.abs(dollarDelta).toFixed(0)} if ${ticker} rises $1`
    : positionDelta < -0.1
    ? `Bearish bias — gains $${Math.abs(dollarDelta).toFixed(0)} if ${ticker} falls $1`
    : `Neutral — minimal directional exposure ($${Math.abs(dollarDelta).toFixed(0)} per $1 move)`

  const gammaNote = positionGamma < -0.005
    ? 'Short gamma — your delta exposure increases against you as the stock moves'
    : positionGamma > 0.005
    ? 'Long gamma — your position benefits from large moves in either direction'
    : 'Minimal gamma exposure'

  // Determine overall Greek profile
  const isThetaPositive = dollarTheta > 0
  const isVegaNegative = dollarVega < 0
  const profileLabel = isThetaPositive && isVegaNegative
    ? 'Premium Seller Profile'
    : !isThetaPositive && !isVegaNegative
    ? 'Premium Buyer Profile'
    : 'Mixed Profile'

  const profileColour = isThetaPositive && isVegaNegative
    ? 'text-primary'
    : !isThetaPositive && !isVegaNegative
    ? 'text-orange-400'
    : 'text-yellow-400'

  const profileDesc = isThetaPositive && isVegaNegative
    ? 'Time works for you. IV spikes work against you. Classic selling strategy.'
    : !isThetaPositive && !isVegaNegative
    ? 'Time works against you. IV expansion helps you. Classic buying strategy.'
    : 'Mixed Greek exposure — monitor both time decay and IV changes.'

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <SectionLabel icon={Activity}>Position Greeks Explainer</SectionLabel>

      {/* Profile badge */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <span className={`text-sm font-bold ${profileColour}`}>{profileLabel}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{profileDesc}</p>
        </div>
        <div className="text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1">
          Estimated · 1 contract
        </div>
      </div>

      {/* Four Greeks cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">

        {/* Delta */}
        <div className="bg-secondary/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Delta</span>
            <span className={`text-sm font-bold font-mono ${positionDelta > 0.05 ? 'text-emerald-400' : positionDelta < -0.05 ? 'text-red-400' : 'text-muted-foreground'}`}>
              {positionDelta > 0 ? '+' : ''}{positionDelta.toFixed(3)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{deltaExplain}</p>
        </div>

        {/* Theta */}
        <div className={`rounded-lg p-3 ${dollarTheta >= 0 ? 'bg-primary/10 border border-primary/20' : 'bg-secondary/30'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Theta</span>
            <span className={`text-sm font-bold font-mono ${dollarTheta >= 0 ? 'text-primary' : 'text-red-400'}`}>
              {dollarTheta >= 0 ? '+' : ''}${dollarTheta.toFixed(2)}/day
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{thetaExplain}</p>
          {dollarTheta >= 0 && (
            <p className="text-xs text-primary/70 mt-1">
              Weekly: +${(Math.abs(dollarTheta) * 7).toFixed(0)} · Monthly: +${(Math.abs(dollarTheta) * 30).toFixed(0)}
            </p>
          )}
        </div>

        {/* Vega */}
        <div className={`rounded-lg p-3 ${dollarVega < 0 ? 'bg-secondary/30' : 'bg-orange-500/5 border border-orange-500/10'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vega</span>
            <span className={`text-sm font-bold font-mono ${dollarVega >= 0 ? 'text-orange-400' : 'text-muted-foreground'}`}>
              {dollarVega >= 0 ? '+' : ''}${dollarVega.toFixed(2)}/1%IV
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{vegaExplain}</p>
        </div>

        {/* Gamma */}
        <div className="bg-secondary/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gamma</span>
            <span className={`text-sm font-bold font-mono ${positionGamma < -0.003 ? 'text-red-400' : 'text-muted-foreground'}`}>
              {positionGamma > 0 ? '+' : ''}{positionGamma.toFixed(4)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{gammaNote}</p>
        </div>

      </div>

      {/* Plain English summary box */}
      <div className="bg-secondary/20 border border-border rounded-lg p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">In plain English — what this means for your trade</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className={`text-xs shrink-0 mt-0.5 ${dollarTheta >= 0 ? 'text-primary' : 'text-red-400'}`}>
              {dollarTheta >= 0 ? '✓' : '✗'}
            </span>
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-medium">Time decay:</span> {thetaExplain}.
              {dollarTheta >= 0
                ? ` Every day that passes, this position becomes more profitable — even if ${ticker} doesn't move.`
                : ` Every day that passes, this position loses value — ${ticker} needs to move in your favour quickly.`}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className={`text-xs shrink-0 mt-0.5 ${dollarVega < 0 ? 'text-primary' : 'text-orange-400'}`}>
              {dollarVega < 0 ? '✓' : '△'}
            </span>
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-medium">Volatility risk:</span> {vegaExplain10}.
              {dollarVega < 0
                ? ' IV crush after earnings or a vol spike is your main risk — manage this by closing before earnings.'
                : ' A volatility expansion helps this position — but be careful of IV crush after earnings.'}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground shrink-0 mt-0.5">→</span>
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-medium">Directional exposure:</span> {deltaExplain}.
            </p>
          </div>
        </div>
      </div>

      {/* Per-leg breakdown */}
      {legs.length > 1 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Per-leg breakdown</p>
          <div className="space-y-1">
            {legGreeks.map((leg, i) => (
              <div key={i} className="flex items-center gap-3 text-xs font-mono text-muted-foreground bg-secondary/20 rounded px-3 py-2">
                <span className={`font-semibold uppercase ${leg.action === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>{leg.action}</span>
                <span>${leg.strike} {leg.type.toUpperCase()}</span>
                <span className="ml-auto flex gap-4">
                  <span>Δ {leg.delta > 0 ? '+' : ''}{leg.delta.toFixed(3)}</span>
                  <span>θ {leg.theta > 0 ? '+' : ''}${(leg.theta * 100).toFixed(2)}/d</span>
                  <span>V {leg.vega > 0 ? '+' : ''}${(leg.vega * 100).toFixed(2)}</span>
                </span>
              </div>
            ))}
            <div className="flex items-center gap-3 text-xs font-mono bg-primary/5 border border-primary/10 rounded px-3 py-2">
              <span className="font-semibold text-primary">TOTAL</span>
              <span className="text-muted-foreground">position</span>
              <span className="ml-auto flex gap-4">
                <span className="text-foreground">Δ {positionDelta > 0 ? '+' : ''}{positionDelta.toFixed(3)}</span>
                <span className={dollarTheta >= 0 ? 'text-primary' : 'text-red-400'}>θ {dollarTheta > 0 ? '+' : ''}${dollarTheta.toFixed(2)}/d</span>
                <span className={dollarVega < 0 ? 'text-muted-foreground' : 'text-orange-400'}>V {dollarVega > 0 ? '+' : ''}${dollarVega.toFixed(2)}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        Greeks are estimated using standard Black-Scholes approximations. Actual Greeks may vary — verify on your broker platform before trading.
        All values shown per 1 contract (100 shares).
      </p>
    </div>
  )
}


// ── Expected Move Calculator ───────────────────────────────────────────────
// Formula: Expected Move = Price × IV30(decimal) × √(DTE/365)
// This is the standard 1-standard-deviation expected move used by all
// professional options platforms (Tastytrade, ThinkorSwim, Interactive Brokers)

function calculateExpectedMove(price: number, iv30Percent: number, dte: number) {
  const iv = iv30Percent / 100  // convert percentage to decimal
  const expectedMove = price * iv * Math.sqrt(dte / 365)
  const expectedMovePercent = (expectedMove / price) * 100
  const upperBound = price + expectedMove
  const lowerBound = price - expectedMove

  return {
    expectedMove: Math.round(expectedMove * 100) / 100,
    expectedMovePercent: Math.round(expectedMovePercent * 100) / 100,
    upperBound: Math.round(upperBound * 100) / 100,
    lowerBound: Math.round(lowerBound * 100) / 100,
  }
}

// Assess whether trade legs are outside the expected move (for iron condors etc.)
function assessStrikes(
  legs: AnalyzeResponse['strategy']['legs'],
  lowerBound: number,
  upperBound: number,
  signal: 'safe' | 'tight' | 'inside'
): { shortCallStrike: number | null; shortPutStrike: number | null; assessment: string; colour: string } {
  const shortCall = legs.find(l => l.action === 'sell' && l.type === 'call')
  const shortPut = legs.find(l => l.action === 'sell' && l.type === 'put')

  if (!shortCall && !shortPut) {
    return { shortCallStrike: null, shortPutStrike: null, assessment: '', colour: '' }
  }

  const callOk = shortCall ? shortCall.strike >= upperBound : true
  const putOk = shortPut ? shortPut.strike <= lowerBound : true

  if (callOk && putOk) {
    return {
      shortCallStrike: shortCall?.strike ?? null,
      shortPutStrike: shortPut?.strike ?? null,
      assessment: 'Strikes are outside the expected move — good positioning',
      colour: 'text-emerald-400',
    }
  } else {
    return {
      shortCallStrike: shortCall?.strike ?? null,
      shortPutStrike: shortPut?.strike ?? null,
      assessment: 'Warning: one or more short strikes are inside the expected move — higher risk',
      colour: 'text-orange-400',
    }
  }
}

// ── Pre-Trade Checklist ────────────────────────────────────────────────────
const CHECKLIST = [
  { number: '01', title: 'Verify the earnings date', detail: 'Our tool sometimes shows "Unknown" for earnings. Always check the exact date on your broker platform before entering. Never hold a short options position through earnings — IV crush will destroy the position.', flag: 'Critical' },
  { number: '02', title: 'Check the bid/ask spread', detail: 'Calculate: (Ask - Bid) / Mid price. If the spread is more than 10% of the mid price, the option is illiquid — skip it. Wide spreads mean you lose money the moment you enter. Stick to contracts with 500+ open interest.', flag: 'Critical' },
  { number: '03', title: 'Cross-check the IV Rank', detail: 'Our IV Rank is estimated from current IV levels, not a true 52-week calculation. Before entering, verify IV Rank on your broker platform or at marketchameleon.com. The strategy direction depends on this number being correct.', flag: 'Important' },
  { number: '04', title: 'Size to 2-5% of your portfolio maximum', detail: 'Start with 1 contract only. If your portfolio is £10,000, maximum risk per trade is £200-500. This feels too small — that is correct. Small size lets you survive the learning curve. Never size up until you have 3+ months of consistent results.', flag: 'Important' },
  { number: '05', title: 'Set your exit orders immediately after entry', detail: 'The moment you open a trade, enter a GTC limit order to close at 50% of max profit. If you sold a spread for £200, immediately place a buy order to close it at £100. Do not wait and watch.', flag: 'Critical' },
  { number: '06', title: 'Set your stop loss order', detail: 'For credit strategies: stop at 2x the premium received. If you collected £200, stop at £400 loss. For debit strategies: stop at 50% of premium paid. These orders protect you when you are not watching.', flag: 'Critical' },
  { number: '07', title: 'Check VIX and broader market conditions', detail: 'VIX above 30 = extreme fear — widen strikes or reduce size. VIX below 15 = complacency — be cautious with iron condors as sharp moves can blow through strikes quickly.', flag: 'Important' },
  { number: '08', title: 'Confirm your broker options approval level', detail: 'Iron condors require Level 3. Spreads require Level 2. Covered calls require Level 1. Cash-secured puts require Level 2. Apply for the right level before you need it — approval can take days.', flag: 'Setup' },
  { number: '09', title: 'Check for macro events in your DTE window', detail: 'Look for Fed meetings, CPI data, and jobs reports in the next 30 days. These cause sharp moves that can blow through iron condor strikes. If a major event falls within your DTE window, reduce size or skip the trade.', flag: 'Important' },
  { number: '10', title: 'Record the trade in your trading journal', detail: 'Write down: ticker, strategy, strikes, expiry, premium, IV Rank at entry, reason, and planned exit. Traders who keep detailed records consistently outperform those who do not.', flag: 'Discipline' },
]

const FLAG_COLOURS: Record<string, string> = {
  Critical: 'bg-red-500/10 text-red-400',
  Important: 'bg-orange-500/10 text-orange-400',
  Setup: 'bg-blue-500/10 text-blue-400',
  Discipline: 'bg-primary/10 text-primary',
}

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const [ticker, setTicker] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(true)

  useEffect(() => {
    const t = searchParams.get('ticker')
    if (t) {
      setTicker(t.toUpperCase())
      setChecklistOpen(false)
    }
  }, [searchParams])

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    if (!ticker.trim()) return
    setIsLoading(true)
    setError(null)
    setResult(null)
    setChecklistOpen(false)
    setLoadingMsg('Fetching live options chain...')
    const steps = ['Fetching live options chain...', 'Calculating IV Rank and Greeks...', 'Searching for market context...', 'Generating strategy with Claude AI...']
    let stepIndex = 0
    const stepInterval = setInterval(() => { stepIndex = (stepIndex + 1) % steps.length; setLoadingMsg(steps[stepIndex]) }, 2500)
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: ticker.trim().toUpperCase() }) })
      const data = await response.json()
      if (!response.ok) { setError(data.error ?? 'Something went wrong.'); return }
      setResult(data as AnalyzeResponse)
    } catch { setError('Network error. Check your connection and try again.') }
    finally { clearInterval(stepInterval); setIsLoading(false); setLoadingMsg('') }
  }

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

        {/* Pre-Trade Checklist */}
        <div className="bg-card border border-border rounded-lg mb-8 overflow-hidden">
          <button onClick={() => setChecklistOpen(!checklistOpen)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div className="text-left">
                <div className="font-semibold text-sm">Pre-Trade Checklist</div>
                <div className="text-xs text-muted-foreground">10 steps to complete before entering any trade</div>
              </div>
            </div>
            {checklistOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {checklistOpen && (
            <div className="border-t border-border">
              <div className="px-6 py-3 bg-secondary/20 border-b border-border">
                <p className="text-xs text-muted-foreground leading-relaxed">The AI generates the strategy. <span className="text-foreground font-medium">You are responsible for the execution.</span> Complete every step below before placing any trade.</p>
              </div>
              <div className="divide-y divide-border">
                {CHECKLIST.map(item => <ChecklistItem key={item.number} item={item} flagColours={FLAG_COLOURS} />)}
              </div>
              <div className="px-6 py-4 bg-secondary/20 border-t border-border">
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">New to options? Read the <Link href="/strategies" className="text-primary hover:underline">Options Trading Playbook</Link> before placing your first trade.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-md p-4 mb-8">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border border-border mb-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <p className="text-foreground font-medium mb-1">{loadingMsg}</p>
            <p className="text-sm text-muted-foreground">This takes 15-25 seconds</p>
          </div>
        )}

        {result && !isLoading && (
          <div className="space-y-4">

            {/* Strategy Header */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold">{result.strategy.strategyName}</h2>
                    <OutlookBadge outlook={result.strategy.marketOutlook} />
                  </div>
                  <p className="text-sm text-muted-foreground">{result.marketData.ticker} · Generated {new Date(result.generatedAt).toLocaleTimeString('en-GB')}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-lg font-bold ${getRiskColour(result.strategy.metrics.riskRating)}`}>{getRiskLabel(result.strategy.metrics.riskRating)}</div>
                  <div className="text-xs text-muted-foreground">Risk level</div>
                  <RiskPips rating={result.strategy.metrics.riskRating} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.strategy.rationale}</p>
            </div>

            {/* Risk/Reward + Market Data */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-lg p-6">
                <SectionLabel icon={ShieldCheck}>Risk / Reward</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Max profit" value={result.strategy.metrics.maxProfit} colour="text-emerald-400" />
                  <MetricTile label="Max loss" value={result.strategy.metrics.maxLoss} colour="text-red-400" />
                  <MetricTile label="Prob. of profit" value={result.strategy.metrics.probabilityOfProfit} colour="text-primary" />
                  <MetricTile label="Breakeven" value={result.strategy.metrics.breakeven.join(' / ')} />
                </div>
              </div>
              <div className="bg-card border border-border rounded-lg p-6">
                <SectionLabel icon={TrendingUp}>Live Market Data — {result.marketData.ticker}</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Price" value={`$${result.marketData.currentPrice.toFixed(2)}`} />
                  <MetricTile label="IV Rank" value={`${result.marketData.ivRank}`} colour={result.marketData.ivRank > 50 ? 'text-orange-400' : result.marketData.ivRank < 30 ? 'text-primary' : ''} sub={result.marketData.ivRank > 50 ? 'High — sell premium' : result.marketData.ivRank < 30 ? 'Low — buy options' : 'Neutral'} />
                  <MetricTile label="IV30" value={`${result.marketData.iv30.toFixed(1)}%`} />
                  <MetricTile label="Put / Call" value={result.marketData.putCallRatio.toFixed(2)} />
                  <MetricTile label="IV Premium" value={`${result.marketData.ivPremium > 0 ? '+' : ''}${result.marketData.ivPremium.toFixed(1)}%`} />
                  <MetricTile label="Earnings" value={result.marketData.daysToEarnings === -1 ? 'Unknown' : `${result.marketData.daysToEarnings} days`} colour={result.marketData.daysToEarnings !== -1 && result.marketData.daysToEarnings <= 14 ? 'text-orange-400' : ''} />
                </div>
              </div>
            </div>

            {/* ── EXPECTED MOVE CALCULATOR ─────────────────────────────── */}
            <ExpectedMoveCard
              price={result.marketData.currentPrice}
              iv30={result.marketData.iv30}
              ticker={result.marketData.ticker}
              legs={result.strategy.legs}
              strategyName={result.strategy.strategyName}
            />

            {/* Greeks Explainer */}
            <GreeksExplainerCard
              legs={result.strategy.legs}
              price={result.marketData.currentPrice}
              iv30={result.marketData.iv30}
              ticker={result.marketData.ticker}
            />

            {/* Position Sizing Calculator */}
            <PositionSizingCard
              strategy={result.strategy}
              marketData={result.marketData}
            />

            {/* Trade Legs */}
            <div className="bg-card border border-border rounded-lg p-6">
              <SectionLabel icon={ChevronRight}>Trade Legs</SectionLabel>
              <div className="space-y-2">
                {result.strategy.legs.map((leg, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded uppercase tracking-wider ${leg.action === 'buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{leg.action}</span>
                    <span className="font-mono text-sm font-medium">{leg.quantity} x ${leg.strike} {leg.type.toUpperCase()}</span>
                    <span className="text-sm text-muted-foreground ml-auto">Expiry: {formatDate(leg.expiry)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timing */}
            <div className="bg-card border border-border rounded-lg p-6">
              <SectionLabel icon={Clock}>Timing Rules</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <TimingTile label="Enter at DTE" value={`${result.strategy.timing.idealEntryDTE} days`} />
                <TimingTile label="Exit at DTE" value={`${result.strategy.timing.closeAtDTE} days`} />
                <TimingTile label="Profit target" value={result.strategy.timing.closeProfitTarget} />
                <TimingTile label="Stop loss" value={result.strategy.timing.stopLoss} />
              </div>
            </div>

            {/* Warnings */}
            {result.strategy.warnings.length > 0 && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-6">
                <SectionLabel icon={AlertTriangle} colour="text-yellow-500">Warnings</SectionLabel>
                <ul className="space-y-2">
                  {result.strategy.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-yellow-500/80"><span className="shrink-0 mt-0.5">•</span>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Checklist reminder */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Before entering this trade — <button onClick={() => { setChecklistOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-primary hover:underline font-medium">complete the pre-trade checklist</button>. Verify earnings date, bid/ask spread, and IV Rank on your broker platform.
                </p>
              </div>
            </div>

            <div className="border-t border-border pt-6 pb-2">
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                This analysis is for educational and informational purposes only. It does not constitute financial advice. Options trading involves significant risk. You may lose more than your initial investment.
              </p>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}

// ── Expected Move Card Component ──────────────────────────────────────────

function ExpectedMoveCard({
  price, iv30, ticker, legs, strategyName
}: {
  price: number
  iv30: number
  ticker: string
  legs: AnalyzeResponse['strategy']['legs']
  strategyName: string
}) {
  // Calculate for multiple DTE windows
  const windows = [
    { label: '7 days', dte: 7 },
    { label: '14 days', dte: 14 },
    { label: '21 days', dte: 21 },
    { label: '30 days', dte: 30 },
    { label: '45 days', dte: 45 },
    { label: '60 days', dte: 60 },
  ]

  // Use 30 DTE as the primary display (matches the strategy's target DTE)
  const primary = calculateExpectedMove(price, iv30, 30)

  // Check if this is a credit strategy with short strikes
  const hasShortStrikes = legs.some(l => l.action === 'sell')
  const shortCall = legs.find(l => l.action === 'sell' && l.type === 'call')
  const shortPut = legs.find(l => l.action === 'sell' && l.type === 'put')

  const strikesAssessment = hasShortStrikes
    ? assessStrikes(legs, primary.lowerBound, primary.upperBound, 'safe')
    : null

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <SectionLabel icon={Move}>Expected Move Calculator</SectionLabel>

      {/* Main expected move display */}
      <div className="bg-secondary/30 rounded-lg p-4 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">30-day expected move for {ticker}</p>
            <p className="text-2xl font-bold text-foreground">
              ±${primary.expectedMove.toFixed(2)}
              <span className="text-lg text-muted-foreground ml-2">(±{primary.expectedMovePercent.toFixed(1)}%)</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Based on IV30 of {iv30.toFixed(1)}% · 68% probability stock stays between{' '}
              <span className="text-primary font-medium">${primary.lowerBound.toFixed(2)}</span>
              {' '}and{' '}
              <span className="text-primary font-medium">${primary.upperBound.toFixed(2)}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-1">Formula</div>
            <div className="font-mono text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1">
              ${price} × {iv30.toFixed(1)}% × √(30/365)
            </div>
          </div>
        </div>
      </div>

      {/* Visual price range bar */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Lower bound</span>
          <span>Current price</span>
          <span>Upper bound</span>
        </div>
        <div className="relative h-8 bg-secondary/30 rounded-lg overflow-hidden">
          {/* Expected move zone */}
          <div
            className="absolute top-0 h-full bg-primary/10 border-x border-primary/30"
            style={{ left: '15%', right: '15%' }}
          />
          {/* Current price marker */}
          <div className="absolute top-0 h-full w-0.5 bg-primary left-1/2 transform -translate-x-1/2" />
          {/* Short call strike marker */}
          {shortCall && (
            <div
              className="absolute top-0 h-full w-0.5 bg-red-400"
              style={{ left: `${Math.min(85, Math.max(15, 50 + ((shortCall.strike - price) / (primary.expectedMove * 2)) * 70))}%` }}
              title={`Short call: $${shortCall.strike}`}
            />
          )}
          {/* Short put strike marker */}
          {shortPut && (
            <div
              className="absolute top-0 h-full w-0.5 bg-red-400"
              style={{ left: `${Math.min(85, Math.max(15, 50 + ((shortPut.strike - price) / (primary.expectedMove * 2)) * 70))}%` }}
              title={`Short put: $${shortPut.strike}`}
            />
          )}
          {/* Labels */}
          <div className="absolute inset-0 flex items-center justify-between px-2">
            <span className="text-xs font-mono text-primary">${primary.lowerBound.toFixed(0)}</span>
            <span className="text-xs font-mono text-foreground">${price.toFixed(0)}</span>
            <span className="text-xs font-mono text-primary">${primary.upperBound.toFixed(0)}</span>
          </div>
        </div>
        {hasShortStrikes && (
          <p className="text-xs text-muted-foreground mt-1">Red lines = your short strikes</p>
        )}
      </div>

      {/* Strike assessment for credit strategies */}
      {strikesAssessment && strikesAssessment.assessment && (
        <div className={`flex items-start gap-2 mb-5 p-3 rounded-md bg-secondary/20`}>
          <Target className={`h-4 w-4 shrink-0 mt-0.5 ${strikesAssessment.colour}`} />
          <div>
            <p className={`text-sm font-medium ${strikesAssessment.colour}`}>{strikesAssessment.assessment}</p>
            {shortCall && <p className="text-xs text-muted-foreground mt-0.5">Short call at ${shortCall.strike} vs upper bound ${primary.upperBound.toFixed(2)} — {shortCall.strike >= primary.upperBound ? '✓ outside' : '⚠ inside'} expected move</p>}
            {shortPut && <p className="text-xs text-muted-foreground mt-0.5">Short put at ${shortPut.strike} vs lower bound ${primary.lowerBound.toFixed(2)} — {shortPut.strike <= primary.lowerBound ? '✓ outside' : '⚠ inside'} expected move</p>}
          </div>
        </div>
      )}

      {/* DTE table */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Expected move by time horizon</p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {windows.map(w => {
            const calc = calculateExpectedMove(price, iv30, w.dte)
            return (
              <div key={w.label} className="bg-secondary/30 rounded-md p-2.5 text-center">
                <div className="text-xs text-muted-foreground mb-1">{w.label}</div>
                <div className="text-sm font-bold text-foreground">±${calc.expectedMove.toFixed(0)}</div>
                <div className="text-xs text-muted-foreground">±{calc.expectedMovePercent.toFixed(1)}%</div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        The expected move represents one standard deviation — there is a 68% probability the stock stays within this range by expiry.
        Professional options traders use this to ensure short strikes in credit strategies are positioned outside this range.
      </p>
    </div>
  )
}

// ── Checklist Item ─────────────────────────────────────────────────────────

function ChecklistItem({ item, flagColours }: { item: typeof CHECKLIST[0]; flagColours: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="px-6 py-3 hover:bg-secondary/20 transition-colors">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start gap-4 text-left">
        <span className="text-xs font-bold text-primary font-mono mt-0.5 shrink-0 w-6">{item.number}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{item.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${flagColours[item.flag]}`}>{item.flag}</span>
          </div>
          {expanded && <p className="text-sm text-muted-foreground leading-relaxed mt-2">{item.detail}</p>}
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
      </button>
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────


function PositionSizingCard({
  strategy,
  marketData,
}: {
  strategy: AnalyzeResponse['strategy']
  marketData: AnalyzeResponse['marketData']
}) {
  const [portfolioSize, setPortfolioSize] = useState(10000)
  const [riskPercent, setRiskPercent] = useState(2)
  const [currency, setCurrency] = useState<'GBP' | 'USD'>('GBP')

  const symbol = currency === 'GBP' ? '£' : '$'

  // Determine max risk per trade from strategy
  const maxLossPerContract = (() => {
    const ml = strategy.metrics.maxLoss
    // Try to parse dollar amount from string like "$550" or "$1,800"
    const match = ml.replace(/,/g, '').match(/\$?([\d.]+)/)
    if (match) return parseFloat(match[1])
    // Fallback: use premium paid/received estimate
    return 500
  })()

  const maxProfitPerContract = (() => {
    const mp = strategy.metrics.maxProfit
    if (mp === 'Unlimited') return null
    const match = mp.replace(/,/g, '').match(/\$?([\d.]+)/)
    if (match) return parseFloat(match[1])
    return 300
  })()

  // Core calculation
  const maxRiskDollars = (portfolioSize * riskPercent) / 100
  const optimalContracts = Math.max(1, Math.floor(maxRiskDollars / maxLossPerContract))
  const actualRisk = optimalContracts * maxLossPerContract
  const actualRiskPercent = (actualRisk / portfolioSize) * 100
  const potentialProfit = maxProfitPerContract ? optimalContracts * maxProfitPerContract : null
  const riskRewardRatio = potentialProfit ? Math.round((potentialProfit / actualRisk) * 10) / 10 : null

  // Portfolio tiers
  const tiers = [
    { pct: 1, label: 'Conservative', colour: 'text-primary' },
    { pct: 2, label: 'Standard', colour: 'text-yellow-400' },
    { pct: 5, label: 'Aggressive', colour: 'text-orange-400' },
  ].map(t => ({
    ...t,
    maxRisk: (portfolioSize * t.pct) / 100,
    contracts: Math.max(1, Math.floor(((portfolioSize * t.pct) / 100) / maxLossPerContract)),
  }))

  // Warning messages
  const warnings: string[] = []
  if (optimalContracts === 1 && actualRiskPercent > riskPercent + 1) {
    warnings.push(`Minimum 1 contract exceeds your ${riskPercent}% target. Consider a smaller position or different strategy.`)
  }
  if (maxLossPerContract > portfolioSize * 0.1) {
    warnings.push('This strategy has a large max loss relative to your portfolio. Consider a narrower spread width.')
  }
  if (strategy.metrics.riskRating >= 4) {
    warnings.push('Risk rating 4-5: This is a high-risk strategy. Start with 1 contract only regardless of portfolio size.')
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <SectionLabel icon={Calculator}>Position Sizing Calculator</SectionLabel>

      {/* Portfolio inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">
            Portfolio Size
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrency(currency === 'GBP' ? 'USD' : 'GBP')}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary/80 transition-colors shrink-0"
            >
              {symbol}
            </button>
            <input
              type="number"
              min="100"
              step="1000"
              value={portfolioSize}
              onChange={e => setPortfolioSize(Math.max(100, parseFloat(e.target.value) || 0))}
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">
            Risk Per Trade
          </label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 5].map(pct => (
              <button
                key={pct}
                onClick={() => setRiskPercent(pct)}
                className={`flex-1 py-2 text-sm font-medium rounded-md border transition-colors ${
                  riskPercent === pct
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">
            Max Risk in {currency}
          </label>
          <div className="bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm font-semibold text-primary">
            {symbol}{maxRiskDollars.toFixed(0)} maximum
          </div>
        </div>
      </div>

      {/* Main recommendation */}
      <div className={`rounded-xl p-5 mb-5 ${
        optimalContracts <= 2
          ? 'bg-primary/5 border border-primary/20'
          : 'bg-orange-500/5 border border-orange-500/20'
      }`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Recommended position size</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-foreground">{optimalContracts}</span>
              <span className="text-lg text-muted-foreground">contract{optimalContracts > 1 ? 's' : ''}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Maximum risk: <span className="text-foreground font-medium">{symbol}{actualRisk.toFixed(0)}</span>
              {' '}({actualRiskPercent.toFixed(1)}% of portfolio)
            </p>
          </div>

          <div className="text-right">
            {potentialProfit !== null && (
              <div className="mb-2">
                <p className="text-xs text-muted-foreground">Potential profit</p>
                <p className="text-lg font-bold text-emerald-400">{symbol}{potentialProfit.toFixed(0)}</p>
              </div>
            )}
            {riskRewardRatio !== null && (
              <div>
                <p className="text-xs text-muted-foreground">Risk/Reward ratio</p>
                <p className="text-lg font-bold text-foreground">1 : {riskRewardRatio}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-contract breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-secondary/30 rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Max loss / contract</p>
          <p className="text-sm font-bold text-red-400">{symbol}{maxLossPerContract.toFixed(0)}</p>
        </div>
        <div className="bg-secondary/30 rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Max profit / contract</p>
          <p className="text-sm font-bold text-emerald-400">
            {maxProfitPerContract ? `${symbol}${maxProfitPerContract.toFixed(0)}` : 'Unlimited'}
          </p>
        </div>
        <div className="bg-secondary/30 rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">50% profit target</p>
          <p className="text-sm font-bold text-primary">
            {maxProfitPerContract
              ? `${symbol}${(optimalContracts * maxProfitPerContract * 0.5).toFixed(0)}`
              : '—'}
          </p>
        </div>
        <div className="bg-secondary/30 rounded-md p-3">
          <p className="text-xs text-muted-foreground mb-1">Stop loss (2× premium)</p>
          <p className="text-sm font-bold text-orange-400">
            {symbol}{(actualRisk * 2).toFixed(0)}
          </p>
        </div>
      </div>

      {/* Comparison table */}
      <div className="mb-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
          Risk level comparison — {symbol}{portfolioSize.toLocaleString()} portfolio
        </p>
        <div className="grid grid-cols-3 gap-3">
          {tiers.map(tier => (
            <button
              key={tier.pct}
              onClick={() => setRiskPercent(tier.pct)}
              className={`p-3 rounded-lg border text-left transition-all ${
                riskPercent === tier.pct
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-secondary/20 hover:bg-secondary/40'
              }`}
            >
              <div className={`text-xs font-semibold mb-1 ${tier.colour}`}>{tier.label}</div>
              <div className="text-lg font-bold">{tier.contracts} contract{tier.contracts > 1 ? 's' : ''}</div>
              <div className="text-xs text-muted-foreground">
                {symbol}{tier.maxRisk.toFixed(0)} risk ({tier.pct}%)
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Professional rules reminder */}
      <div className="bg-secondary/20 border border-border rounded-lg p-4 mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Professional Position Sizing Rules
        </p>
        <div className="grid md:grid-cols-2 gap-2">
          {[
            { ok: riskPercent <= 2, text: riskPercent <= 2 ? `${riskPercent}% risk is within the 2% professional standard` : `${riskPercent}% risk is above the 2% standard — use with caution` },
            { ok: true, text: `Never risk more than 5% on any single trade regardless of conviction` },
            { ok: optimalContracts >= 1, text: `Start with ${Math.min(optimalContracts, 2)} contract${Math.min(optimalContracts, 2) > 1 ? 's' : ''} until you have 3+ months of consistent results` },
            { ok: true, text: `Set your stop loss at ${symbol}${(actualRisk * 2).toFixed(0)} (2× premium received) before entering` },
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`text-xs shrink-0 mt-0.5 ${rule.ok ? 'text-primary' : 'text-orange-400'}`}>
                {rule.ok ? '✓' : '△'}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">{rule.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-orange-400 text-xs shrink-0 mt-0.5">⚠</span>
              <p className="text-xs text-orange-400/80 leading-relaxed">{w}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        Max loss figures are parsed from the AI strategy output and may be estimates.
        Always verify exact risk on your broker platform before entering a trade.
        All values shown per {optimalContracts} contract{optimalContracts > 1 ? 's' : ''}.
      </p>
    </div>
  )
}


function OutlookBadge({ outlook }: { outlook: string }) {
  const styles: Record<string, string> = { bullish: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', bearish: 'bg-red-500/10 text-red-400 border-red-500/20', neutral: 'bg-muted text-muted-foreground border-border', 'high-volatility': 'bg-orange-500/10 text-orange-400 border-orange-500/20' }
  const icons: Record<string, React.ReactNode> = { bullish: <ArrowUpRight className="h-3 w-3" />, bearish: <ArrowDownRight className="h-3 w-3" />, neutral: <Minus className="h-3 w-3" />, 'high-volatility': <AlertTriangle className="h-3 w-3" /> }
  return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded border capitalize ${styles[outlook] ?? styles.neutral}`}>{icons[outlook]}{outlook.replace('-', ' ')}</span>
}

function RiskPips({ rating }: { rating: number }) {
  const colours = ['bg-emerald-400', 'bg-green-400', 'bg-yellow-400', 'bg-orange-400', 'bg-red-400']
  return (
    <div className="flex gap-1 mt-1.5 justify-end">
      {[1,2,3,4,5].map(i => <div key={i} className={`h-1.5 w-4 rounded-full ${i <= rating ? colours[rating-1] : 'bg-border'}`} />)}
    </div>
  )
}

function SectionLabel({ icon: Icon, children, colour = 'text-muted-foreground' }: { icon: React.ElementType; children: React.ReactNode; colour?: string }) {
  return <div className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider mb-4 ${colour}`}><Icon className="h-3.5 w-3.5" />{children}</div>
}

function MetricTile({ label, value, colour = 'text-foreground', sub }: { label: string; value: string; colour?: string; sub?: string }) {
  return (
    <div className="bg-secondary/50 rounded-md px-3 py-2.5">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-semibold leading-tight ${colour}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function TimingTile({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground mb-1">{label}</div><div className="text-sm font-medium">{value}</div></div>
}