// FILE: types/strategy.ts
// TypeScript type definitions for the AI strategy output.
// These types match the JSON schema exactly (strategy-output-schema.json).
// TypeScript uses these to catch errors — if the AI returns the wrong shape,
// our code will warn us before it crashes.

export type MarketOutlook = 'bullish' | 'bearish' | 'neutral' | 'high-volatility'

export type OptionAction = 'buy' | 'sell'
export type OptionType = 'call' | 'put'

// One leg of a trade (simple strategies have 1 leg, iron condors have 4)
export interface StrategyLeg {
  action: OptionAction
  type: OptionType
  strike: number
  expiry: string        // Format: YYYY-MM-DD
  quantity: number
}

// Risk/reward numbers for the trade
export interface StrategyMetrics {
  maxProfit: string           // e.g. "$450" or "Unlimited"
  maxLoss: string             // e.g. "$550"
  probabilityOfProfit: string // e.g. "68%"
  breakeven: string[]         // e.g. ["$187.50", "$210.00"]
  riskRating: 1 | 2 | 3 | 4 | 5
}

// When to enter and exit the trade
export interface StrategyTiming {
  idealEntryDTE: number       // Days to expiry when entering
  closeAtDTE: number          // Exit at this DTE regardless
  closeProfitTarget: string   // e.g. "50% of max profit"
  stopLoss: string            // e.g. "Close if loss reaches 2x premium"
}

// The complete strategy object returned by Claude
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

// The request body sent to our /api/analyze endpoint
export interface AnalyzeRequest {
  ticker: string
}

// The full response from our /api/analyze endpoint
export interface AnalyzeResponse {
  strategy: OptionsStrategy
  marketData: MarketDataSummary
  generatedAt: string   // ISO timestamp
}

// Summary of market conditions (shown alongside the strategy)
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
