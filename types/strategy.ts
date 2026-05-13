// FILE: types/strategy.ts
// TypeScript types for the AI strategy output and API responses.

export type MarketOutlook = 'bullish' | 'bearish' | 'neutral' | 'high-volatility'

export interface StrategyLeg {
  action: 'buy' | 'sell'
  type: 'call' | 'put'
  strike: number
  expiry: string
  quantity: number
}

export interface StrategyMetrics {
  maxProfit: string
  maxLoss: string
  probabilityOfProfit: string
  breakeven: string[]
  riskRating: 1 | 2 | 3 | 4 | 5
}

export interface StrategyTiming {
  idealEntryDTE: number
  closeAtDTE: number
  closeProfitTarget: string
  stopLoss: string
}

export interface OptionsStrategy {
  strategyName: string
  marketOutlook: MarketOutlook
  legs: StrategyLeg[]
  metrics: StrategyMetrics
  timing: StrategyTiming
  rationale: string
  warnings: string[]
  disclaimer: string
}

export interface MarketDataSummary {
  ticker: string
  currentPrice: number
  ivRank: number
  iv30: number
  historicalVol30: number
  ivPremium: number
  daysToEarnings: number
  putCallRatio: number
  vix: number
}

export interface AnalyzeResponse {
  strategy: OptionsStrategy
  marketData: MarketDataSummary
  generatedAt: string
}
