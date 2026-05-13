// FILE: app/page.tsx
// The landing page — the first thing anyone sees at optionsai.com
// It's a server component (no "use client") — renders fast on the server.
// The SignedIn/SignedOut blocks from Clerk show different content
// depending on whether the user is logged in.

import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs'
import { ArrowRight, BarChart3, Shield, Zap, TrendingUp } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">OptionsAI</span>
          </div>
          <div className="flex items-center gap-4">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Sign in
                </button>
              </SignInButton>
              <Link
                href="/sign-up"
                className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
              >
                Get Started
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm text-primary mb-8">
          <Zap className="h-3.5 w-3.5" />
          Powered by Claude AI + Live Market Data
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6">
          Institutional Options
          <span className="block text-primary">Strategy in Seconds</span>
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Enter any ticker. Receive a professional-grade options strategy backed by
          live IV data, Greeks analysis, and the same probability framework used by
          hedge fund options desks.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <SignedOut>
            <Link
              href="/sign-up"
              className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-md hover:bg-primary/90 transition-colors text-base"
            >
              Start Analysing Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-md hover:bg-primary/90 transition-colors text-base"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </SignedIn>
        </div>
      </section>

      {/* ── Feature Grid ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">

          <div className="bg-card border border-border rounded-lg p-6">
            <BarChart3 className="h-8 w-8 text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">Live IV Analysis</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              IV Rank, 30-day implied vol, historical volatility premium —
              the exact inputs a professional uses to decide which strategy has edge.
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <Shield className="h-8 w-8 text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">Probability-First</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Every strategy comes with max profit, max loss, probability of profit,
              and exact breakeven levels. No guesswork.
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <Zap className="h-8 w-8 text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">8 Core Strategies</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              From covered calls to iron condors — the AI selects the single best strategy
              for current market conditions, not a generic template.
            </p>
          </div>

        </div>
      </section>

      {/* ── Legal Disclaimer ─────────────────────────────────────────────── */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            This analysis is for educational and informational purposes only. It does not constitute
            financial advice. Options trading involves significant risk and is not suitable for all investors.
            You may lose more than your initial investment.
          </p>
        </div>
      </footer>

    </div>
  )
}
