// FILE: types/trades.ts
// TypeScript types for the P&L trade tracker

export interface TradeLeg {
  action: 'buy' | 'sell'
  type: 'call' | 'put'
  strike: number
  expiry: string
  quantity: number
}

export interface Trade {
  id: string
  user_id: string
  ticker: string
  strategy_name: string
  market_outlook?: string
  entry_date: string
  expiry_date: string
  dte_at_entry?: number
  contracts: number
  legs: TradeLeg[]
  premium_received?: number
  premium_paid?: number
  max_profit?: number
  max_loss?: number
  exit_date?: string
  exit_price?: number
  pnl?: number
  pnl_percent?: number
  status: 'open' | 'closed' | 'expired'
  exit_reason?: string
  notes?: string
  iv_rank_at_entry?: number
  iv30_at_entry?: number
  created_at: string
  updated_at: string
}

export interface TradeStats {
  totalTrades: number
  openTrades: number
  closedTrades: number
  winRate: number
  totalPnl: number
  avgPnlPerTrade: number
  avgPnlPercent: number
  bestTrade: Trade | null
  worstTrade: Trade | null
  bestStrategy: string
  avgDaysHeld: number
  totalPremiumCollected: number
}

export interface CreateTradeInput {
  ticker: string
  strategy_name: string
  market_outlook?: string
  entry_date: string
  expiry_date: string
  dte_at_entry?: number
  contracts: number
  legs: TradeLeg[]
  premium_received?: number
  premium_paid?: number
  max_profit?: number
  max_loss?: number
  notes?: string
  iv_rank_at_entry?: number
  iv30_at_entry?: number
}

export interface CloseTradeInput {
  exit_date: string
  exit_price: number
  exit_reason: string
  notes?: string
}