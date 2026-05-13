// FILE: types/market.ts
// TypeScript type definitions for all data coming from Polygon.io.
// Having these types means if Polygon changes their API response, TypeScript
// will immediately tell us where our code needs to be updated.

// One individual options contract from Polygon.io
export interface OptionsContract {
  strike: number
  expiry: string              // YYYY-MM-DD
  type: 'call' | 'put'
  bid: number
  ask: number
  delta: number               // 0 to 1 for calls, -1 to 0 for puts
  gamma: number
  theta: number               // Negative — daily decay cost
  vega: number
  openInterest: number
  volume: number
  impliedVolatility: number   // e.g. 0.35 = 35% IV
  dte: number                 // Days to expiration
}

// The complete market data package fetched for one ticker
export interface MarketData {
  ticker: string
  currentPrice: number
  ivRank: number              // 0–100 scale
  iv30: number                // 30-day implied vol (e.g. 32.5 = 32.5%)
  historicalVol30: number     // 30-day realised vol
  ivPremium: number           // iv30 minus historicalVol30
  daysToEarnings: number      // -1 if unknown
  putCallRatio: number        // > 1.2 bearish, < 0.8 bullish
  topContracts: OptionsContract[]
  vix: number
}

// Raw snapshot response from Polygon.io /v3/snapshot/options/{ticker}
// We only type the fields we actually use
export interface PolygonOptionSnapshot {
  results: PolygonOptionResult[]
  status: string
  request_id: string
  next_url?: string
}

export interface PolygonOptionResult {
  break_even_price?: number
  day?: {
    open: number
    high: number
    low: number
    close: number
    volume: number
    vwap: number
  }
  details?: {
    contract_type: 'call' | 'put'
    exercise_style: string
    expiration_date: string
    shares_per_contract: number
    strike_price: number
    ticker: string
  }
  greeks?: {
    delta: number
    gamma: number
    theta: number
    vega: number
  }
  implied_volatility?: number
  open_interest?: number
  last_quote?: {
    ask: number
    bid: number
    ask_size: number
    bid_size: number
  }
}

// Raw ticker details from Polygon.io /v2/aggs/ticker/{ticker}/prev
export interface PolygonTickerPrice {
  results: Array<{
    c: number   // close price
    o: number   // open price
    h: number   // high
    l: number   // low
    v: number   // volume
  }>
  status: string
  ticker: string
}
