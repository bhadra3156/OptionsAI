// FILE: app/(dashboard)/market/page.tsx
// Market Conditions Dashboard — the first page professionals check every morning.
// Shows VIX, SPY trend, sector rotation, and market regime indicator.
// All data from Yahoo Finance (free, no API key needed).

'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import Nav from '@/components/layout/nav'
import {
  TrendingUp, TrendingDown, Minus, RefreshCw,
  Loader2, AlertCircle, Activity, BarChart3,
  Shield, Zap, ArrowUpRight, ArrowDownRight,
  Sun, Cloud, CloudRain, AlertTriangle
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface MarketSnapshot {
  vix: number
  vixChange: number
  spy: { price: number; change: number; changePercent: number; trend: 'up' | 'down' | 'flat' }
  qqq: { price: number; change: number; changePercent: number }
  iwm: { price: number; change: number; changePercent: number }
  sectors: SectorData[]
  regime: MarketRegime
  generatedAt: string
}

interface SectorData {
  ticker: string
  name: string
  price: number
  changePercent: number
  ivEstimate: number
}

interface MarketRegime {
  label: string
  description: string
  vixLevel: 'low' | 'moderate' | 'elevated' | 'extreme'
  trend: 'bullish' | 'bearish' | 'neutral'
  recommendation: string
  colour: string
  icon: 'sun' | 'cloud' | 'rain' | 'storm'
}

// ── Market Regime Logic ────────────────────────────────────────────────────

function determineRegime(vix: number, spyChangePercent: number): MarketRegime {
  if (vix < 15) {
    return {
      label: 'Low Volatility — Complacency',
      description: 'VIX is very low. Options are cheap. Ideal for buying options and debit spreads. Be cautious selling premium — not enough edge.',
      vixLevel: 'low',
      trend: spyChangePercent >= 0 ? 'bullish' : 'neutral',
      recommendation: 'BUY OPTIONS — Low IV means cheap premiums. Use long calls, debit spreads, or LEAPS. Avoid selling iron condors — insufficient premium.',
      colour: 'text-primary',
      icon: 'sun',
    }
  } else if (vix < 20) {
    return {
      label: 'Normal Market Conditions',
      description: 'VIX is in the normal range. Balanced environment. Look at individual stock IV Rank to decide strategy.',
      vixLevel: 'moderate',
      trend: spyChangePercent >= 0 ? 'bullish' : 'neutral',
      recommendation: 'NEUTRAL — Check individual stock IV Rank. Stocks with IV Rank > 50 → sell premium. Stocks with IV Rank < 30 → buy options.',
      colour: 'text-yellow-400',
      icon: 'cloud',
    }
  } else if (vix < 30) {
    return {
      label: 'Elevated Volatility — Opportunity',
      description: 'VIX is elevated. Options premiums are rich. This is the sweet spot for selling premium strategies. Iron condors, cash-secured puts, and credit spreads have strong edge.',
      vixLevel: 'elevated',
      trend: spyChangePercent < -0.5 ? 'bearish' : 'neutral',
      recommendation: 'SELL PREMIUM — Elevated VIX means inflated premiums. Iron condors, cash-secured puts, bull put spreads. Widen strikes for safety.',
      colour: 'text-orange-400',
      icon: 'cloud',
    }
  } else {
    return {
      label: 'High Fear — Extreme Premium Selling Opportunity',
      description: 'VIX is very high. Extreme fear in the market. Options are massively overpriced. Best time to sell premium — but size down, use wider strikes, and manage risk carefully.',
      vixLevel: 'extreme',
      trend: 'bearish',
      recommendation: 'SELL PREMIUM AGGRESSIVELY — But reduce position size by 50%. Use wider-than-normal strikes. IV will crush back down — this is the edge professionals exploit.',
      colour: 'text-red-400',
      icon: 'rain',
    }
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function MarketPage() {
  const [data, setData] = useState<MarketSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/market')
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to load market data'); return }
      setData(json as MarketSnapshot)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const RegimeIcon = data ? {
    sun: Sun, cloud: Cloud, rain: CloudRain, storm: AlertTriangle
  }[data.regime.icon] : Activity

  return (
    <div className="min-h-screen bg-background text-foreground">

      <Nav />

      <main className="max-w-6xl mx-auto px-6 py-10">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Market Conditions</h1>
            <p className="text-muted-foreground">
              {data
                ? `Check this before analysing any ticker · Updated ${new Date(data.generatedAt).toLocaleTimeString('en-GB')}`
                : 'Loading live market data...'}
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 bg-card border border-border text-sm font-medium px-4 py-2 rounded-md hover:bg-secondary/50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-md p-4 mb-8">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={fetchData} className="text-xs text-destructive/70 hover:text-destructive underline mt-1">Try again</button>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-border mb-6">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
            <p className="text-foreground font-medium mb-2">Fetching live market data...</p>
            <p className="text-sm text-muted-foreground">VIX, SPY, sectors — takes a few seconds</p>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-5">

            {/* ── Market Regime Card ─────────────────────────────────── */}
            <div className={`border rounded-xl p-6 ${
              data.regime.vixLevel === 'low' ? 'bg-primary/5 border-primary/20' :
              data.regime.vixLevel === 'elevated' ? 'bg-orange-500/5 border-orange-500/20' :
              data.regime.vixLevel === 'extreme' ? 'bg-red-500/5 border-red-500/20' :
              'bg-card border-border'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full ${
                  data.regime.vixLevel === 'low' ? 'bg-primary/10' :
                  data.regime.vixLevel === 'elevated' ? 'bg-orange-500/10' :
                  data.regime.vixLevel === 'extreme' ? 'bg-red-500/10' :
                  'bg-secondary'
                }`}>
                  <RegimeIcon className={`h-6 w-6 ${data.regime.colour}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className={`text-lg font-bold ${data.regime.colour}`}>{data.regime.label}</h2>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded border ${
                      data.regime.vixLevel === 'low' ? 'bg-primary/10 text-primary border-primary/20' :
                      data.regime.vixLevel === 'elevated' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                      data.regime.vixLevel === 'extreme' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      'bg-muted text-muted-foreground border-border'
                    }`}>
                      VIX {data.vix.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{data.regime.description}</p>
                  <div className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md ${
                    data.regime.vixLevel === 'low' ? 'bg-primary/10 text-primary' :
                    data.regime.vixLevel === 'elevated' || data.regime.vixLevel === 'extreme' ? 'bg-orange-500/10 text-orange-400' :
                    'bg-secondary text-foreground'
                  }`}>
                    <Zap className="h-3.5 w-3.5" />
                    {data.regime.recommendation}
                  </div>
                </div>
              </div>
            </div>

            {/* ── VIX + Major Indices ────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* VIX */}
              <div className="bg-card border border-border rounded-lg p-5 col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">VIX — Fear Index</span>
                </div>
                <div className={`text-3xl font-bold mb-1 ${
                  data.vix < 15 ? 'text-primary' :
                  data.vix < 20 ? 'text-yellow-400' :
                  data.vix < 30 ? 'text-orange-400' :
                  'text-red-400'
                }`}>{data.vix.toFixed(1)}</div>
                <div className={`text-sm flex items-center gap-1 ${data.vixChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {data.vixChange >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {data.vixChange >= 0 ? '+' : ''}{data.vixChange.toFixed(2)} today
                </div>
                <div className="mt-3">
                  <VixBar vix={data.vix} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>10 — Calm</span>
                  <span>40 — Fear</span>
                </div>
              </div>

              {/* SPY */}
              <IndexCard
                label="SPY — S&P 500"
                price={data.spy.price}
                change={data.spy.change}
                changePercent={data.spy.changePercent}
                trend={data.spy.trend}
              />

              {/* QQQ */}
              <IndexCard
                label="QQQ — Nasdaq 100"
                price={data.qqq.price}
                change={data.qqq.change}
                changePercent={data.qqq.changePercent}
                trend={data.qqq.changePercent >= 0.1 ? 'up' : data.qqq.changePercent <= -0.1 ? 'down' : 'flat'}
              />

              {/* IWM */}
              <IndexCard
                label="IWM — Russell 2000"
                price={data.iwm.price}
                change={data.iwm.change}
                changePercent={data.iwm.changePercent}
                trend={data.iwm.changePercent >= 0.1 ? 'up' : data.iwm.changePercent <= -0.1 ? 'down' : 'flat'}
              />
            </div>

            {/* ── Sector Rotation ────────────────────────────────────── */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Sector Performance Today</span>
                <span className="text-xs text-muted-foreground ml-auto">Green = buying pressure · Red = selling pressure</span>
              </div>
              <div className="space-y-2">
                {[...data.sectors]
                  .sort((a, b) => b.changePercent - a.changePercent)
                  .map(sector => (
                    <SectorRow key={sector.ticker} sector={sector} />
                  ))
                }
              </div>
            </div>

            {/* ── Trading Checklist for Today ────────────────────────── */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary font-medium uppercase tracking-wider">Morning Checklist — Based on Current Conditions</span>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <CheckItem
                  ok={data.vix < 30}
                  title={data.vix < 30 ? 'VIX is manageable' : 'VIX is elevated — reduce size'}
                  detail={data.vix < 30
                    ? `VIX at ${data.vix.toFixed(1)} — normal conditions, standard position sizing`
                    : `VIX at ${data.vix.toFixed(1)} — reduce position size by 25-50%, widen iron condor strikes`}
                />
                <CheckItem
                  ok={Math.abs(data.spy.changePercent) < 1.5}
                  title={Math.abs(data.spy.changePercent) < 1.5 ? 'Market movement is normal' : 'Large market move today — be cautious'}
                  detail={Math.abs(data.spy.changePercent) < 1.5
                    ? `SPY ${data.spy.changePercent >= 0 ? '+' : ''}${data.spy.changePercent.toFixed(2)}% — within normal range`
                    : `SPY moved ${Math.abs(data.spy.changePercent).toFixed(2)}% today — avoid new entries until market settles`}
                />
                <CheckItem
                  ok={data.regime.vixLevel !== 'low'}
                  title={data.regime.vixLevel !== 'low' ? 'Premium selling has edge' : 'Options are cheap — consider buying'}
                  detail={data.regime.vixLevel !== 'low'
                    ? 'IV is elevated enough to give sellers a meaningful premium edge'
                    : 'Low VIX means thin premiums — debit spreads and long options have better edge today'}
                />
                <CheckItem
                  ok={true}
                  title="Use Market Scan to find best opportunities"
                  detail="Run Market Scan to see which individual stocks have the highest AI scores and unusual options activity today"
                  action={{ label: 'Open Market Scan →', href: '/scan' }}
                />
              </div>
            </div>

            {/* ── What to trade today ────────────────────────────────── */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary font-medium uppercase tracking-wider">What to focus on today</span>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <FocusCard
                  title="Best strategy type"
                  value={data.vix > 20 ? 'Sell Premium' : data.vix < 15 ? 'Buy Options' : 'Check IV Rank'}
                  detail={data.vix > 20
                    ? 'Iron condors, cash-secured puts, credit spreads — collect inflated premium'
                    : data.vix < 15
                    ? 'Long calls, debit spreads, LEAPS — options are cheap'
                    : 'Look at individual stock IV Rank before deciding direction'}
                  colour={data.vix > 20 ? 'text-orange-400' : data.vix < 15 ? 'text-primary' : 'text-yellow-400'}
                />
                <FocusCard
                  title="Sector strength"
                  value={data.sectors.filter(s => s.changePercent > 0).length > 5 ? 'Broad advance' : data.sectors.filter(s => s.changePercent < 0).length > 5 ? 'Broad decline' : 'Mixed rotation'}
                  detail={`${data.sectors.filter(s => s.changePercent > 0).length} of ${data.sectors.length} sectors positive today`}
                  colour={data.sectors.filter(s => s.changePercent > 0).length > 5 ? 'text-emerald-400' : data.sectors.filter(s => s.changePercent < 0).length > 5 ? 'text-red-400' : 'text-yellow-400'}
                />
                <FocusCard
                  title="Risk appetite"
                  value={data.vix < 15 ? 'High' : data.vix < 25 ? 'Moderate' : 'Low'}
                  detail={data.vix < 15
                    ? 'Market is calm. Normal position sizing. Good time to be active.'
                    : data.vix < 25
                    ? 'Some uncertainty. Standard position sizes. Be selective.'
                    : 'High fear. Reduce size. Wider strikes. Fewer trades.'}
                  colour={data.vix < 15 ? 'text-primary' : data.vix < 25 ? 'text-yellow-400' : 'text-red-400'}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Market data is delayed 15 minutes. VIX data sourced via VIXY ETF proxy.
              This is for educational purposes only and does not constitute financial advice.
            </p>

          </div>
        )}
      </main>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function VixBar({ vix }: { vix: number }) {
  const pct = Math.min(100, Math.max(0, ((vix - 10) / 30) * 100))
  const colour = vix < 15 ? 'bg-primary' : vix < 20 ? 'bg-yellow-400' : vix < 30 ? 'bg-orange-400' : 'bg-red-400'
  return (
    <div className="h-2 bg-border rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function IndexCard({ label, price, change, changePercent, trend }: {
  label: string; price: number; change: number; changePercent: number; trend: 'up' | 'down' | 'flat'
}) {
  const isUp = changePercent > 0
  const isFlat = Math.abs(changePercent) < 0.1
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-1.5 mb-1">
        {isFlat ? <Minus className="h-3.5 w-3.5 text-muted-foreground" /> : isUp ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold mb-0.5">${price.toFixed(2)}</div>
      <div className={`text-sm flex items-center gap-1 ${isFlat ? 'text-muted-foreground' : isUp ? 'text-emerald-400' : 'text-red-400'}`}>
        {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : isFlat ? <Minus className="h-3 w-3" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
      </div>
    </div>
  )
}

function SectorRow({ sector }: { sector: SectorData }) {
  const isUp = sector.changePercent >= 0
  const barWidth = Math.min(100, Math.abs(sector.changePercent) * 20)
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0">
        <div className="text-xs font-semibold">{sector.ticker}</div>
        <div className="text-xs text-muted-foreground truncate">{sector.name}</div>
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-5 bg-secondary/30 rounded overflow-hidden">
          <div
            className={`h-full rounded transition-all ${isUp ? 'bg-emerald-500/40' : 'bg-red-500/40'}`}
            style={{ width: `${Math.max(barWidth, 1)}%` }}
          />
        </div>
        <span className={`text-xs font-bold w-14 text-right ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{sector.changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="text-xs text-muted-foreground w-16 text-right font-mono">${sector.price.toFixed(2)}</div>
    </div>
  )
}

function CheckItem({ ok, title, detail, action }: {
  ok: boolean; title: string; detail: string; action?: { label: string; href: string }
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${ok ? 'bg-primary/5 border border-primary/10' : 'bg-orange-500/5 border border-orange-500/10'}`}>
      <span className={`text-sm shrink-0 mt-0.5 font-bold ${ok ? 'text-primary' : 'text-orange-400'}`}>{ok ? '✓' : '△'}</span>
      <div>
        <div className={`text-sm font-medium ${ok ? 'text-foreground' : 'text-orange-400'}`}>{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{detail}</div>
        {action && (
          <Link href={action.href} className="text-xs text-primary hover:underline mt-1 inline-block">{action.label}</Link>
        )}
      </div>
    </div>
  )
}

function FocusCard({ title, value, detail, colour }: {
  title: string; value: string; detail: string; colour: string
}) {
  return (
    <div className="bg-secondary/30 rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{title}</div>
      <div className={`text-lg font-bold mb-1 ${colour}`}>{value}</div>
      <div className="text-xs text-muted-foreground leading-relaxed">{detail}</div>
    </div>
  )
}