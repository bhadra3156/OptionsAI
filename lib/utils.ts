// FILE: lib/utils.ts
// Shared utility functions used throughout the app.
// cn() is the most important one — it merges Tailwind class names safely,
// handling conditional classes and deduplication.

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merges Tailwind CSS classes. Use this instead of template literals.
// Example: cn("px-4", isActive && "bg-green-500", "text-white")
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formats a number as USD currency
// Example: formatCurrency(1234.5) → "$1,234.50"
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

// Formats a number as a percentage
// Example: formatPercent(32.5) → "32.5%"
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

// Validates that a ticker symbol is plausible (1–5 uppercase letters)
// This is a basic check — Polygon.io will return an error for invalid tickers
export function isValidTicker(ticker: string): boolean {
  return /^[A-Za-z]{1,5}$/.test(ticker.trim())
}

// Returns a human-readable risk label from a risk rating number
export function getRiskLabel(rating: 1 | 2 | 3 | 4 | 5): string {
  const labels: Record<number, string> = {
    1: 'Very Low',
    2: 'Low',
    3: 'Moderate',
    4: 'High',
    5: 'Very High',
  }
  return labels[rating] ?? 'Unknown'
}

// Returns a colour class for the risk rating (used in the UI)
export function getRiskColour(rating: number): string {
  if (rating <= 1) return 'text-emerald-400'
  if (rating <= 2) return 'text-green-400'
  if (rating <= 3) return 'text-yellow-400'
  if (rating <= 4) return 'text-orange-400'
  return 'text-red-400'
}

// Formats a date string (YYYY-MM-DD) to a readable format
// Example: "2025-07-18" → "Jul 18, 2025"
export function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
