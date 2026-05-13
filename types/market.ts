// FILE: types/market.ts
// TypeScript types for market data fetched from Yahoo Finance.

export interface OptionsContract {
  strike: number
  expiry: string
  type: 'call' | 'put'
  bid: number
  ask: number
  delta: number | null
  gamma: number | null
  theta: number | null
  vega: number | null
  openInterest: number
  volume: number
  impliedVolatility: number
  dte: number
}

export interface MarketData {
  ticker: string
  currentPrice: number
  ivRank: number
  iv30: number
  historicalVol30: number
  ivPremium: number
  daysToEarnings: number
  putCallRatio: number
  topContracts: OptionsContract[]
  vix: number
}
