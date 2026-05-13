// FILE: lib/utils.ts
// Shared helper functions used across the app.

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merges Tailwind classes safely — use this instead of template literals
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

// Basic validation — Polygon/Yahoo will reject invalid tickers anyway
export function isValidTicker(ticker: string): boolean {
  return /^[A-Za-z]{1,5}$/.test(ticker.trim())
}

export function getRiskLabel(rating: number): string {
  const labels: Record<number, string> = {
    1: 'Very Low',
    2: 'Low',
    3: 'Moderate',
    4: 'High',
    5: 'Very High',
  }
  return labels[rating] ?? 'Unknown'
}

export function getRiskColour(rating: number): string {
  if (rating <= 1) return 'text-emerald-400'
  if (rating <= 2) return 'text-green-400'
  if (rating <= 3) return 'text-yellow-400'
  if (rating <= 4) return 'text-orange-400'
  return 'text-red-400'
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
