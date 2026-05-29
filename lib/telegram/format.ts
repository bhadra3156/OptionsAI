// FILE: lib/telegram/format.ts
// =============================================================================
// Telegram message formatter — pure functions, no I/O
// =============================================================================
// Takes a Signal record and returns the payload to send to Telegram's
// sendMessage endpoint: { text, parse_mode, reply_markup }.
//
// We use HTML formatting (parse_mode=HTML) because:
//   - MarkdownV2 requires escaping a long list of special chars including
//     "$" "." "(" ")" "-" "!" which are all over options trades. Fragile.
//   - HTML only needs to escape three: & < >
//   - Both render the same way visually on every Telegram client.
//
// IMPORTANT: any text from the database or AI that ends up in the message
// MUST be passed through escapeHtml() first. Telegram's parser is strict —
// an unescaped "<" anywhere will break the whole message.
// =============================================================================

import type { Signal, SignalLeg, SignalMetrics } from '@/types/signals'

// -----------------------------------------------------------------------------
// PUBLIC API
// -----------------------------------------------------------------------------

export interface TelegramMessagePayload {
  text: string                         // HTML-formatted message body
  parse_mode: 'HTML'
  reply_markup: {
    inline_keyboard: TelegramInlineButton[][]
  }
}

export interface TelegramInlineButton {
  text: string
  callback_data: string                // we put "approve:<uuid>" or "reject:<uuid>"
}

/**
 * Format a signal for Telegram. Returns the exact JSON body to POST to
 * https://api.telegram.org/bot<TOKEN>/sendMessage
 */
export function formatSignalMessage(signal: Signal): TelegramMessagePayload {
  const lines: string[] = []

  // Header
  lines.push(`🎯 <b>OptionsAI Signal</b> — Confidence ${signal.confidence}/100`)
  lines.push('')

  // Ticker + strategy
  lines.push(`<b>${esc(signal.ticker)}</b> — ${esc(signal.strategy_name)}`)

  // Quick stats line
  const dte = computeDte(signal.legs_json)
  const stats: string[] = []
  stats.push(`IV Rank ${signal.iv_rank}`)
  if (dte !== null) stats.push(`DTE ${dte}`)
  stats.push(`POP ${esc(signal.metrics_json.probabilityOfProfit)}`)
  lines.push(stats.join(' · '))
  lines.push('')

  // Legs in a <pre> block (monospace, easy to read)
  lines.push('<b>Legs:</b>')
  lines.push('<pre>')
  for (const leg of sortLegsForDisplay(signal.legs_json)) {
    lines.push(esc(formatLeg(signal.ticker, leg)))
  }
  lines.push('</pre>')

  // Metrics line
  lines.push(formatMetricsLine(signal.metrics_json))
  lines.push('')

  // Rationale (truncate if very long — Telegram has 4096 char limit on message body)
  const rationaleSafe = truncate(signal.rationale, 400)
  lines.push(`<b>Rationale:</b> ${esc(rationaleSafe)}`)

  // Warnings
  if (signal.warnings && signal.warnings.length > 0) {
    lines.push('')
    lines.push(`<b>⚠ Risks:</b>`)
    for (const w of signal.warnings.slice(0, 3)) {
      lines.push(`• ${esc(truncate(w, 200))}`)
    }
  }

  // Footer
  lines.push('')
  lines.push(`⏱ 15 min to respond`)

  const text = lines.join('\n')

  return {
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ YES — Approve', callback_data: `approve:${signal.id}` },
        { text: '❌ NO — Reject',   callback_data: `reject:${signal.id}` },
      ]],
    },
  }
}

/**
 * Used by the webhook to edit the message after a user responds.
 * "Approved" or "Rejected" is appended, buttons removed.
 */
export function formatPostResponseText(
  originalText: string,
  response: 'yes' | 'no'
): string {
  const verdict = response === 'yes'
    ? '\n\n<b>✅ APPROVED</b> — paste the ticket above into IBKR.'
    : '\n\n<b>❌ REJECTED</b>'
  return originalText + verdict
}

/**
 * Used by the expire job to edit the message after the 15-min window closes.
 */
export function formatExpiredText(originalText: string): string {
  return originalText + '\n\n<b>⏱ EXPIRED</b> — no response within 15 min.'
}

// -----------------------------------------------------------------------------
// INTERNAL HELPERS
// -----------------------------------------------------------------------------

// Telegram HTML mode requires escaping these three characters in text content
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

// Compute days-to-expiry from the latest leg expiry
function computeDte(legs: SignalLeg[]): number | null {
  if (!legs || legs.length === 0) return null
  const latest = legs.map(l => l.expiry).sort().reverse()[0]
  if (!latest) return null
  const expiryMs = new Date(latest).getTime()
  if (!Number.isFinite(expiryMs)) return null
  return Math.max(0, Math.round((expiryMs - Date.now()) / 86_400_000))
}

// Sort: sells first (income side), then buys (protection), ascending strike within each
function sortLegsForDisplay(legs: SignalLeg[]): SignalLeg[] {
  return [...legs].sort((a, b) => {
    if (a.action !== b.action) return a.action === 'sell' ? -1 : 1
    return a.strike - b.strike
  })
}

// Format one leg as a fixed-width row (looks tidy in <pre>)
// Example: "SELL  1 AMD  27 Jun 2026  $500.00 PUT"
function formatLeg(ticker: string, leg: SignalLeg): string {
  const action = leg.action.toUpperCase().padEnd(4)
  const qty = leg.quantity.toString().padStart(2)
  const expiry = formatExpiry(leg.expiry)
  const strike = `$${leg.strike.toFixed(2)}`.padStart(8)
  return `${action} ${qty} ${ticker}  ${expiry}  ${strike} ${leg.type.toUpperCase()}`
}

function formatExpiry(yyyymmdd: string): string {
  const [year, month, day] = yyyymmdd.split('-').map(Number)
  if (!year || !month || !day) return yyyymmdd
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${day.toString().padStart(2,'0')} ${months[month - 1]} ${year}`
}

function formatMetricsLine(m: SignalMetrics): string {
  return [
    `<b>Max profit</b> ${esc(m.maxProfit)}`,
    `<b>Max loss</b> ${esc(m.maxLoss)}`,
  ].join(' · ')
}
