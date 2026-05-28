// FILE: lib/signals/ibkr-ticket.ts
// =============================================================================
// IBKR order ticket formatter
// =============================================================================
// Converts a qualified signal's legs into a copy-paste-ready text block the
// user pastes (or transcribes) into IBKR's order entry screen.
//
// Why text and not API:
//   We chose manual execution over auto-trading (see signals-plan.md sec 2).
//   This formatter exists so the user has zero ambiguity about what to place.
//   No mental math, no guessing the leg order, no risk of typos.
//
// Format goals:
//   - Each leg on its own line
//   - Action (BUY/SELL) and quantity prominent
//   - Strike + type + expiry in IBKR-friendly format
//   - Limit price as a single net credit (for credit spreads) or debit
//   - Plain ASCII — no fancy unicode that copy-paste might mangle
// =============================================================================

import type { SignalLeg, SignalMetrics } from '@/types/signals'

// Input is the minimum we need to produce a useful ticket
export interface IbkrTicketInput {
  ticker: string
  strategyName: string             // e.g. "Iron Condor", "Bull Put Spread"
  legs: SignalLeg[]
  metrics: SignalMetrics           // for the net price line
  netPrice?: number                // optional override; otherwise estimated from metrics
  netPriceType?: 'credit' | 'debit'
}

// -----------------------------------------------------------------------------
// MAIN ENTRY POINT
// -----------------------------------------------------------------------------

export function buildIbkrTicket(input: IbkrTicketInput): string {
  const { ticker, strategyName, legs, metrics } = input

  const lines: string[] = []

  // Header
  lines.push(`=== ${ticker} ${strategyName.toUpperCase()} ===`)
  lines.push(``)

  // Each leg, ordered: sells first (the income-generating side), then buys (the protective wings)
  // This mirrors how a credit spread reads naturally to a desk trader
  const sortedLegs = [...legs].sort((a, b) => {
    if (a.action !== b.action) return a.action === 'sell' ? -1 : 1
    return a.strike - b.strike
  })

  for (const leg of sortedLegs) {
    lines.push(formatLeg(ticker, leg))
  }

  lines.push(``)

  // Net price line
  const { price, type } = resolveNetPrice(input)
  if (price !== null) {
    const verb = type === 'credit' ? 'CREDIT' : 'DEBIT'
    lines.push(`Order type: LIMIT @ $${price.toFixed(2)} ${verb}`)
  } else {
    lines.push(`Order type: LIMIT — see Max Profit / Max Loss above to derive net price`)
  }

  // Risk reminder
  lines.push(``)
  lines.push(`Max profit: ${metrics.maxProfit}`)
  lines.push(`Max loss:   ${metrics.maxLoss}`)
  lines.push(`POP:        ${metrics.probabilityOfProfit}`)

  // Footer note
  lines.push(``)
  lines.push(`IMPORTANT: Verify the option chain in IBKR before submitting.`)
  lines.push(`Prices may have shifted since this signal was generated.`)

  return lines.join('\n')
}

// -----------------------------------------------------------------------------
// FORMAT ONE LEG
// -----------------------------------------------------------------------------
// Standardised one-line format. Example:
//   SELL  1 AAPL  27 Jun 2026  $230.00 PUT
//   BUY   1 AAPL  27 Jun 2026  $225.00 PUT

function formatLeg(ticker: string, leg: SignalLeg): string {
  const action = leg.action.toUpperCase().padEnd(4)
  const qty = leg.quantity.toString().padStart(2)
  const expiry = formatExpiry(leg.expiry)
  const strike = `$${leg.strike.toFixed(2)}`.padStart(8)
  const type = leg.type.toUpperCase()
  return `${action} ${qty} ${ticker}  ${expiry}  ${strike} ${type}`
}

// -----------------------------------------------------------------------------
// FORMAT EXPIRY DATE
// -----------------------------------------------------------------------------
// IBKR accepts a lot of formats but "27 Jun 2026" is unambiguous and easy
// for humans to read quickly. Input is always YYYY-MM-DD from Claude.

function formatExpiry(yyyymmdd: string): string {
  const [year, month, day] = yyyymmdd.split('-').map(Number)
  if (!year || !month || !day) return yyyymmdd  // fallback: return raw

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${day.toString().padStart(2, '0')} ${months[month - 1]} ${year}`
}

// -----------------------------------------------------------------------------
// RESOLVE NET PRICE
// -----------------------------------------------------------------------------
// Try to extract a clean dollar amount from input. Priority order:
//   1. Explicit netPrice + netPriceType from caller (most accurate)
//   2. Parse from metrics.maxProfit (e.g. "$210" for a credit spread = $2.10 credit per contract)
//   3. Return null and let the ticket say "see metrics"

function resolveNetPrice(
  input: IbkrTicketInput
): { price: number | null; type: 'credit' | 'debit' } {
  if (input.netPrice !== undefined && input.netPriceType) {
    return { price: input.netPrice, type: input.netPriceType }
  }

  // Heuristic: for credit strategies (selling), maxProfit = total credit collected
  // For debit strategies (buying), maxLoss = total premium paid
  // The dollar amount divided by 100 (per share -> per contract math) and by quantity
  const sellingSide = input.legs.some(l => l.action === 'sell')
  const totalContracts = input.legs.reduce((sum, l) => sum + l.quantity, 0) || 1

  if (sellingSide) {
    // Credit-style strategy: maxProfit ≈ credit received
    const dollars = extractDollarAmount(input.metrics.maxProfit)
    if (dollars !== null) {
      return { price: dollars / 100 / totalContracts, type: 'credit' }
    }
  } else {
    // Debit-style strategy: maxLoss ≈ debit paid
    const dollars = extractDollarAmount(input.metrics.maxLoss)
    if (dollars !== null) {
      return { price: dollars / 100 / totalContracts, type: 'debit' }
    }
  }

  return { price: null, type: 'debit' }
}

// Pulls a number out of a string like "$210", "$1,200", "$3.50"
function extractDollarAmount(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}