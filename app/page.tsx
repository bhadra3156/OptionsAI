// FILE: app/page.tsx

import Link from 'next/link'
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'
import { ArrowRight, BarChart3, Shield, Zap, TrendingUp, CheckCircle, Activity } from 'lucide-react'
import Nav from '@/components/layout/nav'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* Show full nav for logged-in users, simple nav for logged-out */}
      <SignedIn>
        <Nav />
      </SignedIn>

      <SignedOut>
        <nav className="border-b border-border px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold tracking-tight">OptionsAI</span>
            </div>
            <div className="flex items-center gap-4">
              <SignInButton mode="modal">
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Sign in
                </button>
              </SignInButton>
              <Link
                href="/sign-up"
                className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
              >
                Get started free
              </Link>
            </div>
          </div>
        </nav>
      </SignedOut>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-28 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm text-primary mb-8">
          <Zap className="h-3.5 w-3.5" />
          Powered by Claude AI + Live Market Data
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6">
          Institutional Options Strategy
          <span className="block text-primary mt-2">In Seconds</span>
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Enter any US stock ticker. Receive a professional-grade options strategy built on
          live IV data, Greeks analysis, and the same probability framework used by hedge fund options desks.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <SignedOut>
            <Link
              href="/sign-up"
              className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-3.5 rounded-md hover:bg-primary/90 transition-colors text-base"
            >
              Start analysing free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/scan"
              className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-3.5 rounded-md hover:bg-primary/90 transition-colors text-base"
            >
              Open Market Scan
              <Activity className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 bg-card border border-border text-foreground font-semibold px-8 py-3.5 rounded-md hover:bg-secondary/50 transition-colors text-base"
            >
              Analyse a Ticker
              <ArrowRight className="h-4 w-4" />
            </Link>
          </SignedIn>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
          {[
            { value: '8', label: 'Strategy types' },
            { value: '68%', label: 'Avg probability of profit' },
            { value: '30', label: 'Tickers scanned' },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-primary">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border">
        <h2 className="text-2xl font-bold text-center mb-12">Five tools. One platform.</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Activity,
              title: 'Market Scan',
              desc: 'Scan 30 of the most liquid options markets simultaneously. AI scores every ticker and tells you where the best opportunities are right now.',
              href: '/scan',
            },
            {
              icon: BarChart3,
              title: 'Strategy Analysis',
              desc: 'Enter any ticker and receive a complete institutional-grade strategy with expected move, Greeks, position sizing, and pre-trade checklist.',
              href: '/dashboard',
            },
            {
              icon: Shield,
              title: 'Trade Journal',
              desc: 'Record every trade. Track P&L, win rate, and performance by strategy. The discipline that separates profitable traders from the rest.',
              href: '/trades',
            },
          ].map(f => (
            <div key={f.title} className="bg-card border border-border rounded-lg p-6 flex flex-col">
              <f.icon className="h-7 w-7 text-primary mb-4" />
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">{f.desc}</p>
              <SignedIn>
                <Link href={f.href} className="mt-4 text-sm text-primary font-medium hover:underline flex items-center gap-1">
                  Open {f.title} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </SignedIn>
            </div>
          ))}
        </div>
      </section>

      {/* 8 Strategies */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border">
        <h2 className="text-2xl font-bold text-center mb-4">8 Professional Strategies</h2>
        <p className="text-center text-muted-foreground mb-10">
          The AI selects the right one based on IV Rank, earnings risk, and directional bias
        </p>
        <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {[
            { name: 'Covered Call', risk: '1/5', when: 'IV Rank > 30, neutral outlook' },
            { name: 'Cash-Secured Put', risk: '2/5', when: 'IV Rank > 40, bullish bias' },
            { name: 'Iron Condor', risk: '2/5', when: 'IV Rank > 50, range-bound stock' },
            { name: 'Iron Butterfly', risk: '2/5', when: 'IV Rank > 60, very low movement' },
            { name: 'Bull Put Spread', risk: '3/5', when: 'IV Rank > 40, bullish bias' },
            { name: 'Bear Call Spread', risk: '3/5', when: 'IV Rank > 40, bearish bias' },
            { name: 'Long Call / Put', risk: '4/5', when: 'IV Rank < 30, strong catalyst' },
            { name: 'LEAPS', risk: '4/5', when: 'IV Rank < 25, long-term conviction' },
          ].map(s => (
            <div key={s.name} className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3">
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{s.name}</span>
                <span className="text-muted-foreground text-xs ml-2">Risk {s.risk}</span>
              </div>
              <span className="text-xs text-muted-foreground hidden md:block">{s.when}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-8">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            This analysis is for educational and informational purposes only. It does not constitute
            financial advice. Options trading involves significant risk and is not suitable for all investors.
            You may lose more than your initial investment.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            © 2025 OptionsAI. Built with Next.js, Claude AI, and Yahoo Finance.
          </p>
        </div>
      </footer>

    </div>
  )
}