// FILE: app/layout.tsx
// This is the ROOT layout — it wraps every single page in the app.
// ClerkProvider enables authentication on every page.
// The dark class on <html> enables dark mode globally.

import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OptionsAI — Institutional-Grade Options Strategy',
  description: 'AI-powered options trading strategy analysis. Enter any ticker and receive a professional options strategy in seconds.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={inter.className}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
