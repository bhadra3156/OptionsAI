// FILE: lib/telegram/send.ts
// =============================================================================
// Telegram Bot API client
// =============================================================================
// Thin wrapper around the Telegram Bot HTTP API. Keeps the network details
// out of the pipeline and webhook code.
//
// Env vars used:
//   TELEGRAM_BOT_TOKEN — from @BotFather, e.g. "8123456789:AAH..."
//   TELEGRAM_CHAT_ID   — your numeric chat ID from @userinfobot
//
// Errors:
//   All public functions throw on non-2xx responses with a clear message.
//   Callers wrap in try/catch and decide whether to retry or log-and-continue.
//   For pipeline use: a Telegram failure should NOT roll back the DB insert —
//   we'd rather have an orphan signal we can manually resend than lose the
//   qualification entirely.
// =============================================================================

import type { Signal } from '@/types/signals'
import {
  formatSignalMessage,
  formatPostResponseText,
  formatExpiredText,
} from '@/lib/telegram/format'

const API_BASE = 'https://api.telegram.org'

// -----------------------------------------------------------------------------
// PUBLIC API
// -----------------------------------------------------------------------------

export interface SendResult {
  messageId: number                    // Telegram's message_id, save in DB
  chatId: string                       // the chat we sent to
}

/**
 * Send a freshly-qualified signal to the configured Telegram chat.
 * Returns the message_id so the caller can save it to telegram_approvals.
 */
export async function sendSignalToTelegram(signal: Signal): Promise<SendResult> {
  const { token, chatId } = readTelegramConfig()
  const payload = formatSignalMessage(signal)

  const response = await callTelegram<{ message_id: number }>(token, 'sendMessage', {
    chat_id: chatId,
    text: payload.text,
    parse_mode: payload.parse_mode,
    reply_markup: payload.reply_markup,
  })

  return { messageId: response.message_id, chatId }
}

/**
 * Edit a previously-sent signal message to show the user's response
 * (and remove the YES/NO buttons so they can't tap again).
 */
export async function editSignalMessageAfterResponse(
  messageId: number,
  originalText: string,
  response: 'yes' | 'no'
): Promise<void> {
  const { token, chatId } = readTelegramConfig()
  const newText = formatPostResponseText(originalText, response)

  await callTelegram(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: newText,
    parse_mode: 'HTML',
    // reply_markup omitted -> removes the inline keyboard buttons
  })
}

/**
 * Edit a previously-sent signal message to show it expired (15 min passed
 * with no response). Removes the buttons.
 */
export async function editSignalMessageAfterExpiry(
  messageId: number,
  originalText: string
): Promise<void> {
  const { token, chatId } = readTelegramConfig()
  const newText = formatExpiredText(originalText)

  await callTelegram(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: newText,
    parse_mode: 'HTML',
  })
}

/**
 * Acknowledge a callback query (the user tapping a button). Required by
 * the Telegram API — without it, the user's Telegram client shows a
 * spinning loading state on the button forever.
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  const { token } = readTelegramConfig()

  await callTelegram(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text ?? '',
    show_alert: false,
  })
}

// -----------------------------------------------------------------------------
// INTERNAL — config + raw HTTP call
// -----------------------------------------------------------------------------

function readTelegramConfig(): { token: string; chatId: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured')
  }
  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID not configured')
  }

  return { token, chatId }
}

interface TelegramResponse<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

async function callTelegram<T>(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${API_BASE}/bot${token}/${method}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Telegram is usually fast, but cap waits at 10s defensively
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    throw new Error(`Telegram fetch failed (${method}): ${msg}`)
  }

  const data = (await response.json()) as TelegramResponse<T>

  if (!data.ok || data.result === undefined) {
    throw new Error(
      `Telegram API error (${method}): ${data.description ?? 'unknown'} [code ${data.error_code ?? 'n/a'}]`
    )
  }

  return data.result
}
