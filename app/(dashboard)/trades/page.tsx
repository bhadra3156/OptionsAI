// FILE: app/(dashboard)/trades/page.tsx
// P&L Trade Tracker — record, manage and analyse every options trade

'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import Nav from '@/components/layout/nav'
import {
  TrendingUp, Plus, X, Check, Trash2, ChevronDown,
  ChevronUp, BookOpen, BarChart3, Target, Clock,
  AlertTriangle, Loader2, RefreshCw, Edit3
} from 'lucide-react'
import type { Trade, TradeStats, CreateTradeInput, CloseTradeInput } from '@/types/trades'

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt$ = (n: number) => {
  const abs = Math.abs(n).toFixed(2)
  return n >= 0 ? `+$${abs}` : `-$${abs}`
}
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const daysAgo = (d: string) => Math.round((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86_400_000)
const daysUntil = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)

const EXIT_REASONS = [
  '50% profit target hit',
  '21 DTE — time exit',
  'Stop loss — 2x premium',
  'Expired worthless (full profit)',
  'Expired in-the-money (loss)',
  'Early close — earnings approaching',
  'Early close — market conditions changed',
  'Manual close — took profit',
  'Rolled to new expiry',
]

const STRATEGIES = [
  'Iron Condor', 'Cash-Secured Put', 'Covered Call',
  'Bull Put Spread', 'Bear Call Spread', 'Iron Butterfly',
  'Long Call', 'Long Put', 'Bull Call Spread', 'Bear Put Spread',
  'LEAPS', 'Strangle', 'Straddle',
]

// ── Main Component ─────────────────────────────────────────────────────────

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [stats, setStats] = useState<TradeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'closed' | 'journal'>('open')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchTrades = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trades')
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setTrades(data.trades)
      setStats(data.stats)
    } catch { setError('Failed to load trades') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTrades() }, [fetchTrades])

  const openTrades = trades.filter(t => t.status === 'open')
  const closedTrades = trades.filter(t => t.status !== 'open')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Trade Journal</h1>
            <p className="text-muted-foreground">Record every trade. Review every outcome. Improve every month.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchTrades} disabled={loading} className="flex items-center gap-2 bg-card border border-border text-sm px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-4 py-2 rounded-md hover:bg-primary/90 transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              Log New Trade
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4 mb-6 text-sm text-destructive">{error}</div>
        )}

        {/* Stats Cards */}
        {stats && <StatsRow stats={stats} />}

        {/* New Trade Form Modal */}
        {showNewForm && (
          <NewTradeForm
            onClose={() => setShowNewForm(false)}
            onSaved={() => { setShowNewForm(false); fetchTrades() }}
          />
        )}

        {/* Close Trade Modal */}
        {closingId && (
          <CloseTradeForm
            trade={trades.find(t => t.id === closingId)!}
            onClose={() => setClosingId(null)}
            onSaved={() => { setClosingId(null); fetchTrades() }}
          />
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border pb-4">
          {[
            { key: 'open', label: `Open Positions (${openTrades.length})`, icon: Target },
            { key: 'closed', label: `Closed Trades (${closedTrades.length})`, icon: BarChart3 },
            { key: 'journal', label: 'Performance Journal', icon: BookOpen },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">Loading your trades...</p>
          </div>
        ) : (
          <>
            {/* Open Positions */}
            {activeTab === 'open' && (
              <div>
                {openTrades.length === 0 ? (
                  <EmptyState
                    title="No open positions"
                    desc="Click 'Log New Trade' to record your first position."
                    icon={Target}
                  />
                ) : (
                  <div className="space-y-3">
                    {openTrades.map(trade => (
                      <OpenTradeCard
                        key={trade.id}
                        trade={trade}
                        expanded={expandedId === trade.id}
                        onToggle={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
                        onClose={() => setClosingId(trade.id)}
                        onDelete={() => deleteTrade(trade.id, fetchTrades)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Closed Trades */}
            {activeTab === 'closed' && (
              <div>
                {closedTrades.length === 0 ? (
                  <EmptyState
                    title="No closed trades yet"
                    desc="Close your open positions to see them here with full P&L analysis."
                    icon={BarChart3}
                  />
                ) : (
                  <div className="space-y-3">
                    {closedTrades.map(trade => (
                      <ClosedTradeCard
                        key={trade.id}
                        trade={trade}
                        expanded={expandedId === trade.id}
                        onToggle={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
                        onDelete={() => deleteTrade(trade.id, fetchTrades)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Performance Journal */}
            {activeTab === 'journal' && stats && (
              <PerformanceJournal trades={trades} stats={stats} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

async function deleteTrade(id: string, refresh: () => void) {
  if (!confirm('Delete this trade? This cannot be undone.')) return
  await fetch(`/api/trades/${id}`, { method: 'DELETE' })
  refresh()
}

// ── Stats Row ──────────────────────────────────────────────────────────────

function StatsRow({ stats }: { stats: TradeStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
      <StatCard label="Total P&L" value={fmt$(stats.totalPnl)} colour={stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      <StatCard label="Win Rate" value={stats.closedTrades > 0 ? `${stats.winRate}%` : '—'} colour={stats.winRate >= 60 ? 'text-emerald-400' : stats.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'} />
      <StatCard label="Avg P&L / Trade" value={stats.closedTrades > 0 ? fmt$(stats.avgPnlPerTrade) : '—'} colour={stats.avgPnlPerTrade >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      <StatCard label="Open Trades" value={stats.openTrades.toString()} colour="text-foreground" />
      <StatCard label="Closed Trades" value={stats.closedTrades.toString()} colour="text-muted-foreground" />
      <StatCard label="Avg Days Held" value={stats.closedTrades > 0 ? `${stats.avgDaysHeld}d` : '—'} colour="text-muted-foreground" />
    </div>
  )
}

function StatCard({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-bold ${colour}`}>{value}</div>
    </div>
  )
}

// ── Open Trade Card ────────────────────────────────────────────────────────

function OpenTradeCard({ trade, expanded, onToggle, onClose, onDelete }: {
  trade: Trade; expanded: boolean
  onToggle: () => void; onClose: () => void; onDelete: () => void
}) {
  const days = daysAgo(trade.entry_date)
  const dte = daysUntil(trade.expiry_date)
  const isExpiringSoon = dte <= 21
  const isExpired = dte < 0

  // Estimate unrealised P&L based on time decay (50% of premium at 50% of time elapsed)
  let unrealisedEstimate = null
  if (trade.premium_received && trade.dte_at_entry) {
    const pctTimeElapsed = days / trade.dte_at_entry
    const estimatedDecay = trade.premium_received * pctTimeElapsed * 0.5
    unrealisedEstimate = Math.round(estimatedDecay * trade.contracts * 100 * 100) / 100
  }

  return (
    <div className={`bg-card border rounded-lg overflow-hidden ${isExpiringSoon ? 'border-orange-500/30' : 'border-border'}`}>
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-secondary/20" onClick={onToggle}>
        {/* Ticker + strategy */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-lg">{trade.ticker}</span>
            <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">{trade.strategy_name}</span>
            {isExpired && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">EXPIRED</span>}
            {isExpiringSoon && !isExpired && <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">⚠ {dte}d to expiry</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            Entered {fmtDate(trade.entry_date)} · {days} days ago · Expires {fmtDate(trade.expiry_date)}
          </div>
        </div>

        {/* Premium */}
        <div className="text-right shrink-0">
          {trade.premium_received ? (
            <>
              <div className="text-sm font-semibold text-primary">+${(trade.premium_received * trade.contracts * 100).toFixed(0)} received</div>
              <div className="text-xs text-muted-foreground">${trade.premium_received}/contract</div>
            </>
          ) : trade.premium_paid ? (
            <>
              <div className="text-sm font-semibold text-orange-400">-${(trade.premium_paid * trade.contracts * 100).toFixed(0)} paid</div>
              <div className="text-xs text-muted-foreground">${trade.premium_paid}/contract</div>
            </>
          ) : null}
        </div>

        {/* Unrealised estimate */}
        {unrealisedEstimate !== null && (
          <div className="text-right shrink-0 hidden md:block">
            <div className={`text-sm font-semibold ${unrealisedEstimate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmt$(unrealisedEstimate)}
            </div>
            <div className="text-xs text-muted-foreground">est. decay</div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className="flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 transition-colors">
            <Check className="h-3.5 w-3.5" />Close
          </button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1.5 rounded transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-4 bg-secondary/10">
          <TradeDetails trade={trade} />
        </div>
      )}
    </div>
  )
}

// ── Closed Trade Card ──────────────────────────────────────────────────────

function ClosedTradeCard({ trade, expanded, onToggle, onDelete }: {
  trade: Trade; expanded: boolean; onToggle: () => void; onDelete: () => void
}) {
  const isWin = (trade.pnl ?? 0) >= 0

  return (
    <div className={`bg-card border rounded-lg overflow-hidden ${isWin ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-secondary/20" onClick={onToggle}>
        {/* Win/loss indicator */}
        <div className={`w-1.5 h-10 rounded-full shrink-0 ${isWin ? 'bg-emerald-400' : 'bg-red-400'}`} />

        {/* Ticker + strategy */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold">{trade.ticker}</span>
            <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">{trade.strategy_name}</span>
            {trade.exit_reason && <span className="text-xs text-muted-foreground hidden md:inline">{trade.exit_reason}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtDate(trade.entry_date)} → {trade.exit_date ? fmtDate(trade.exit_date) : '—'}
            {trade.exit_date && ` · ${Math.round((new Date(trade.exit_date + 'T00:00:00').getTime() - new Date(trade.entry_date + 'T00:00:00').getTime()) / 86_400_000)} days held`}
          </div>
        </div>

        {/* P&L */}
        <div className="text-right shrink-0">
          <div className={`text-lg font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt$(trade.pnl ?? 0)}
          </div>
          <div className={`text-xs ${isWin ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
            {fmtPct(trade.pnl_percent ?? 0)} return
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1.5 rounded transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-4 bg-secondary/10">
          <TradeDetails trade={trade} />
        </div>
      )}
    </div>
  )
}

// ── Trade Details (expanded) ───────────────────────────────────────────────

function TradeDetails({ trade }: { trade: Trade }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Trade Legs</p>
        <div className="space-y-1.5">
          {(trade.legs as Array<{ action: string; type: string; strike: number; expiry: string; quantity: number }>).map((leg, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono bg-secondary/30 rounded px-3 py-2">
              <span className={`font-bold uppercase ${leg.action === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>{leg.action}</span>
              <span>{leg.quantity} × ${leg.strike} {leg.type.toUpperCase()}</span>
              <span className="text-muted-foreground ml-auto">{leg.expiry}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {trade.max_profit !== undefined && <DetailTile label="Max profit" value={`$${trade.max_profit}`} />}
        {trade.max_loss !== undefined && <DetailTile label="Max loss" value={`$${trade.max_loss}`} />}
        {trade.iv_rank_at_entry !== undefined && <DetailTile label="IV Rank at entry" value={`${trade.iv_rank_at_entry}`} />}
        {trade.iv30_at_entry !== undefined && <DetailTile label="IV30 at entry" value={`${trade.iv30_at_entry}%`} />}
        {trade.contracts && <DetailTile label="Contracts" value={`${trade.contracts}`} />}
        {trade.dte_at_entry && <DetailTile label="DTE at entry" value={`${trade.dte_at_entry} days`} />}
      </div>
      {trade.notes && (
        <div className="md:col-span-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Notes</p>
          <p className="text-sm text-muted-foreground bg-secondary/20 rounded p-3 leading-relaxed">{trade.notes}</p>
        </div>
      )}
    </div>
  )
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/30 rounded p-2.5">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}

// ── Performance Journal ────────────────────────────────────────────────────

function PerformanceJournal({ trades, stats }: { trades: Trade[]; stats: TradeStats }) {
  const closed = trades.filter(t => t.status !== 'open')

  // Monthly P&L
  const monthlyPnl: Record<string, number> = {}
  closed.forEach(t => {
    if (!t.exit_date) return
    const month = t.exit_date.slice(0, 7)
    monthlyPnl[month] = (monthlyPnl[month] ?? 0) + (t.pnl ?? 0)
  })
  const months = Object.entries(monthlyPnl).sort(([a], [b]) => a.localeCompare(b))

  // Strategy breakdown
  const strategyStats: Record<string, { trades: number; wins: number; pnl: number }> = {}
  closed.forEach(t => {
    if (!strategyStats[t.strategy_name]) strategyStats[t.strategy_name] = { trades: 0, wins: 0, pnl: 0 }
    strategyStats[t.strategy_name].trades++
    if ((t.pnl ?? 0) > 0) strategyStats[t.strategy_name].wins++
    strategyStats[t.strategy_name].pnl += t.pnl ?? 0
  })

  if (closed.length === 0) {
    return <EmptyState title="No closed trades to analyse" desc="Close some trades to see your performance journal." icon={BookOpen} />
  }

  return (
    <div className="space-y-6">

      {/* Summary */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <p className="text-xs text-muted-foreground mb-1">Overall Performance</p>
          <div className={`text-3xl font-bold mb-1 ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt$(stats.totalPnl)}</div>
          <p className="text-sm text-muted-foreground">across {stats.closedTrades} closed trades</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
          <div className={`text-3xl font-bold mb-1 ${stats.winRate >= 60 ? 'text-emerald-400' : stats.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.winRate}%</div>
          <div className="w-full bg-border rounded-full h-2 mt-2">
            <div className={`h-2 rounded-full ${stats.winRate >= 60 ? 'bg-emerald-400' : stats.winRate >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${stats.winRate}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Target: 60%+</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <p className="text-xs text-muted-foreground mb-1">Best Strategy</p>
          <div className="text-lg font-bold mb-1 text-primary">{stats.bestStrategy || '—'}</div>
          <p className="text-sm text-muted-foreground">Avg {stats.avgDaysHeld} days held per trade</p>
        </div>
      </div>

      {/* Best / Worst trades */}
      {(stats.bestTrade || stats.worstTrade) && (
        <div className="grid md:grid-cols-2 gap-4">
          {stats.bestTrade && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-5">
              <p className="text-xs text-emerald-400/70 uppercase tracking-wider font-medium mb-2">Best Trade</p>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">{stats.bestTrade.ticker}</div>
                  <div className="text-xs text-muted-foreground">{stats.bestTrade.strategy_name}</div>
                </div>
                <div className="text-xl font-bold text-emerald-400">{fmt$(stats.bestTrade.pnl ?? 0)}</div>
              </div>
            </div>
          )}
          {stats.worstTrade && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-5">
              <p className="text-xs text-red-400/70 uppercase tracking-wider font-medium mb-2">Worst Trade</p>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">{stats.worstTrade.ticker}</div>
                  <div className="text-xs text-muted-foreground">{stats.worstTrade.strategy_name}</div>
                </div>
                <div className="text-xl font-bold text-red-400">{fmt$(stats.worstTrade.pnl ?? 0)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly P&L */}
      {months.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-4">Monthly P&L</p>
          <div className="space-y-2">
            {months.reverse().map(([month, pnl]) => {
              const maxAbs = Math.max(...months.map(([, p]) => Math.abs(p)))
              const barW = maxAbs > 0 ? Math.round((Math.abs(pnl) / maxAbs) * 100) : 0
              return (
                <div key={month} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{month}</span>
                  <div className="flex-1 h-6 bg-secondary/30 rounded overflow-hidden">
                    <div className={`h-full rounded ${pnl >= 0 ? 'bg-emerald-500/40' : 'bg-red-500/40'}`} style={{ width: `${Math.max(barW, 1)}%` }} />
                  </div>
                  <span className={`text-sm font-bold w-20 text-right ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt$(pnl)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Strategy breakdown */}
      {Object.keys(strategyStats).length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-4">Strategy Performance</p>
          <div className="space-y-3">
            {Object.entries(strategyStats)
              .sort(([, a], [, b]) => b.pnl - a.pnl)
              .map(([name, s]) => (
                <div key={name} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground">{s.trades} trades · {Math.round(s.wins / s.trades * 100)}% win rate</div>
                  </div>
                  <div className={`text-sm font-bold shrink-0 ${s.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt$(s.pnl)}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── New Trade Form ─────────────────────────────────────────────────────────

function NewTradeForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<CreateTradeInput>>({
    contracts: 1,
    entry_date: new Date().toISOString().split('T')[0],
  })

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, legs: [] }),
      })
      if (res.ok) onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-bold text-lg">Log New Trade</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <div className="grid grid-cols-2 gap-4">
            <Field label="Ticker *">
              <input required className={input} placeholder="AAPL" value={form.ticker ?? ''} onChange={e => set('ticker', e.target.value.toUpperCase())} />
            </Field>
            <Field label="Strategy *">
              <select required className={input} value={form.strategy_name ?? ''} onChange={e => set('strategy_name', e.target.value)}>
                <option value="">Select strategy...</option>
                {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Entry Date *">
              <input required type="date" className={input} value={form.entry_date ?? ''} onChange={e => set('entry_date', e.target.value)} />
            </Field>
            <Field label="Expiry Date *">
              <input required type="date" className={input} value={form.expiry_date ?? ''} onChange={e => set('expiry_date', e.target.value)} />
            </Field>
            <Field label="Contracts">
              <input type="number" min="1" className={input} value={form.contracts ?? 1} onChange={e => set('contracts', parseInt(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Premium Received (credit trades)" hint="Per contract, e.g. 2.50">
              <input type="number" step="0.01" className={input} placeholder="e.g. 2.50" value={form.premium_received ?? ''} onChange={e => set('premium_received', parseFloat(e.target.value))} />
            </Field>
            <Field label="Premium Paid (debit trades)" hint="Per contract, e.g. 3.50">
              <input type="number" step="0.01" className={input} placeholder="e.g. 3.50" value={form.premium_paid ?? ''} onChange={e => set('premium_paid', parseFloat(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Max Profit ($)" hint="Total for all contracts">
              <input type="number" step="0.01" className={input} placeholder="e.g. 250" value={form.max_profit ?? ''} onChange={e => set('max_profit', parseFloat(e.target.value))} />
            </Field>
            <Field label="Max Loss ($)" hint="Total for all contracts">
              <input type="number" step="0.01" className={input} placeholder="e.g. 750" value={form.max_loss ?? ''} onChange={e => set('max_loss', parseFloat(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="IV Rank at Entry">
              <input type="number" min="0" max="100" className={input} placeholder="e.g. 65" value={form.iv_rank_at_entry ?? ''} onChange={e => set('iv_rank_at_entry', parseInt(e.target.value))} />
            </Field>
            <Field label="IV30 at Entry (%)">
              <input type="number" step="0.1" className={input} placeholder="e.g. 42.5" value={form.iv30_at_entry ?? ''} onChange={e => set('iv30_at_entry', parseFloat(e.target.value))} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea className={`${input} h-20 resize-none`} placeholder="Why did you take this trade? What were the conditions?" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
          </Field>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-secondary text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Log Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Close Trade Form ───────────────────────────────────────────────────────

function CloseTradeForm({ trade, onClose, onSaved }: { trade: Trade; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<CloseTradeInput>>({
    exit_date: new Date().toISOString().split('T')[0],
  })
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  // Calculate P&L preview
  let pnlPreview = null
  if (form.exit_price !== undefined) {
    if (trade.premium_received) {
      const pnl = (trade.premium_received - form.exit_price) * trade.contracts * 100
      pnlPreview = { pnl, pct: (pnl / (trade.max_loss ?? trade.premium_received * 300)) * 100 }
    } else if (trade.premium_paid) {
      const pnl = (form.exit_price - trade.premium_paid) * trade.contracts * 100
      pnlPreview = { pnl, pct: (pnl / (trade.premium_paid * trade.contracts * 100)) * 100 }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-lg">Close Trade</h2>
            <p className="text-sm text-muted-foreground">{trade.ticker} — {trade.strategy_name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          <div className="bg-secondary/30 rounded-lg p-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {trade.premium_received && <div><span className="text-muted-foreground">Premium received: </span><span className="font-medium text-primary">${trade.premium_received}/contract</span></div>}
              {trade.premium_paid && <div><span className="text-muted-foreground">Premium paid: </span><span className="font-medium">${trade.premium_paid}/contract</span></div>}
              <div><span className="text-muted-foreground">Contracts: </span><span className="font-medium">{trade.contracts}</span></div>
              {trade.max_profit && <div><span className="text-muted-foreground">Max profit: </span><span className="font-medium text-emerald-400">${trade.max_profit}</span></div>}
            </div>
          </div>

          <Field label="Exit Date *">
            <input required type="date" className={input} value={form.exit_date ?? ''} onChange={e => set('exit_date', e.target.value)} />
          </Field>

          <Field label="Exit Price (per contract) *" hint={trade.premium_received ? "What did you pay to buy it back? (0 = expired worthless)" : "What did you sell it for?"}>
            <input required type="number" step="0.01" min="0" className={input} placeholder="e.g. 1.25" value={form.exit_price ?? ''} onChange={e => set('exit_price', parseFloat(e.target.value))} />
          </Field>

          {pnlPreview !== null && (
            <div className={`rounded-lg p-4 text-center ${pnlPreview.pnl >= 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
              <div className={`text-2xl font-bold ${pnlPreview.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt$(pnlPreview.pnl)}</div>
              <div className={`text-sm ${pnlPreview.pnl >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>{fmtPct(pnlPreview.pct)} return</div>
              <div className="text-xs text-muted-foreground mt-1">{pnlPreview.pnl >= 0 ? '✓ Winning trade' : '✗ Losing trade'}</div>
            </div>
          )}

          <Field label="Exit Reason *">
            <select required className={input} value={form.exit_reason ?? ''} onChange={e => set('exit_reason', e.target.value)}>
              <option value="">Select reason...</option>
              {EXIT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <Field label="Notes">
            <textarea className={`${input} h-16 resize-none`} placeholder="What happened? What did you learn?" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
          </Field>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-secondary text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-secondary/80">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Close Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────

const input = "w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {hint && <p className="text-xs text-muted-foreground mb-1">{hint}</p>}
      {children}
    </div>
  )
}

function EmptyState({ title, desc, icon: Icon }: { title: string; desc: string; icon: React.ElementType }) {
  return (
    <div className="text-center py-16 bg-card border border-border rounded-lg">
      <Icon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  )
}