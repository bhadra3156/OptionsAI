// FILE: app/(dashboard)/strategies/page.tsx

import Link from 'next/link'
import { BookOpen, ArrowUpRight, ArrowDownRight, Minus, Clock, ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react'
import Nav from '@/components/layout/nav'

export default function StrategiesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">

      <Nav />
      <main className="max-w-5xl mx-auto px-6 py-12">

        <div className="mb-12">
          <div className="flex items-center gap-2 text-primary text-sm font-medium mb-3">
            <BookOpen className="h-4 w-4" />
            Professional Framework
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">The Options Trading Playbook</h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Professional options traders follow a strict framework built on probability, volatility analysis,
            and disciplined risk management. This is exactly what the AI uses to generate every strategy.
          </p>
        </div>

        {/* Core Philosophy */}
        <section className="mb-12">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              The Core Philosophy
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Professional options traders are overwhelmingly <span className="text-foreground font-medium">sellers</span>, not buyers.
              Roughly 68-72% of options expire worthless — meaning the person who sold the option keeps
              the premium as pure profit. Time decay (theta) works for sellers and against buyers every single day.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { stat: '68-72%', label: 'of options expire worthless' },
                { stat: 'Theta', label: 'earns sellers money daily' },
                { stat: '50%', label: 'profit target — then exit' },
              ].map(s => (
                <div key={s.label} className="bg-card border border-border rounded-md p-4 text-center">
                  <div className="text-2xl font-bold mb-1 text-primary">{s.stat}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* IV Rank */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-2">IV Rank — The Most Important Input</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Before picking any strategy, a professional asks one question: are options cheap or expensive right now?
            This is measured by IV Rank — where today's implied volatility sits compared to the past 52 weeks.
          </p>

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {[
              {
                range: '0 - 30',
                label: 'Options are CHEAP',
                action: 'BUY options',
                desc: "You're getting a discount on premium. Long calls, debit spreads, and LEAPS have the best edge here.",
                border: 'border-primary/30 bg-primary/5',
                badge: 'bg-primary/10 text-primary',
                Icon: ArrowUpRight,
              },
              {
                range: '30 - 50',
                label: 'Options are FAIR',
                action: 'Use directional bias',
                desc: 'Look at put/call ratio and price trend to decide. Neither strongly buying nor selling has clear edge.',
                border: 'border-border bg-card',
                badge: 'bg-muted text-muted-foreground',
                Icon: Minus,
              },
              {
                range: '50 - 100',
                label: 'Options are EXPENSIVE',
                action: 'SELL options',
                desc: 'Collect inflated premium. Iron condors, cash-secured puts, and credit spreads have the best edge.',
                border: 'border-orange-500/30 bg-orange-500/5',
                badge: 'bg-orange-500/10 text-orange-400',
                Icon: ArrowDownRight,
              },
            ].map(item => (
              <div key={item.range} className={`border rounded-lg p-5 ${item.border}`}>
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded mb-3 ${item.badge}`}>
                  <item.Icon className="h-3 w-3" />
                  IV Rank {item.range}
                </div>
                <div className="font-bold mb-1">{item.label}</div>
                <div className="text-sm text-primary font-medium mb-2">{item.action}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-md p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-500/80 leading-relaxed">
                <span className="font-medium">The #1 amateur mistake:</span> Buying options regardless of whether they are cheap or expensive.
                Most retail traders lose money because they buy high-IV options and immediately suffer from IV crush.
                The AI enforces this rule on every single recommendation.
              </p>
            </div>
          </div>
        </section>

        {/* 8 Strategies */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-2">The 8 Core Strategies</h2>
          <p className="text-muted-foreground mb-6">The AI selects from these based on IV Rank, earnings risk, and directional bias.</p>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3">
                Selling Strategies — IV Rank above 50
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { name: 'Covered Call', risk: 1, setup: 'Own 100 shares + sell 1 call above current price', outlook: 'Neutral to mildly bullish', bestWhen: 'IV Rank > 30, stock you are willing to hold', maxProfit: 'Premium + (strike minus purchase price)', maxLoss: 'Stock goes to $0 minus premium', dte: '30-45 days', close: 'At 50% profit or expiration' },
                { name: 'Cash-Secured Put', risk: 2, setup: 'Sell a put below current price, hold cash to buy stock if assigned', outlook: 'Neutral to bullish', bestWhen: 'IV Rank > 40, stock you would be happy to own', maxProfit: 'Premium received', maxLoss: '(Strike minus premium) x 100 if stock goes to $0', dte: '30-45 days', close: 'At 50% profit or 21 DTE' },
                { name: 'Iron Condor', risk: 2, setup: 'Sell OTM call spread + sell OTM put spread simultaneously', outlook: 'Neutral — profit if stock stays in a range', bestWhen: 'IV Rank > 50, stock in consolidation, no major events', maxProfit: 'Total premium from both spreads', maxLoss: 'Width of widest spread minus premium', dte: '30-45 days', close: 'At 50% profit or 21 DTE' },
                { name: 'Iron Butterfly', risk: 2, setup: 'Sell ATM call + sell ATM put + buy OTM wings', outlook: 'Neutral — profit if stock stays near current price', bestWhen: 'IV Rank > 60, very low expected movement', maxProfit: 'Higher than iron condor (narrower zone)', maxLoss: 'Spread width minus premium', dte: '21-30 days', close: 'At 25-50% profit' },
                { name: 'Bull Put Spread', risk: 3, setup: 'Sell higher strike put + buy lower strike put', outlook: 'Bullish — profit if stock stays above short put', bestWhen: 'IV Rank > 40, bullish bias', maxProfit: 'Premium received', maxLoss: 'Spread width minus premium', dte: '30-45 days', close: 'At 50% profit or 21 DTE' },
                { name: 'Bear Call Spread', risk: 3, setup: 'Sell lower strike call + buy higher strike call', outlook: 'Bearish — profit if stock stays below short call', bestWhen: 'IV Rank > 40, bearish bias', maxProfit: 'Premium received', maxLoss: 'Spread width minus premium', dte: '30-45 days', close: 'At 50% profit or 21 DTE' },
              ].map(s => <StrategyCard key={s.name} {...s} />)}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3">
                Buying Strategies — IV Rank below 30
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { name: 'Long Call / Long Put', risk: 4, setup: 'Buy a call (bullish) or put (bearish)', outlook: 'Strongly directional', bestWhen: 'IV Rank < 30, strong catalyst expected', maxProfit: 'Unlimited (call) / Stock to $0 (put)', maxLoss: 'Premium paid — 100% of investment', dte: '60-90 days', close: 'At 50% profit or when thesis invalidated' },
                { name: 'LEAPS', risk: 4, setup: 'Buy deep in-the-money call with 12-24 month expiry', outlook: 'Long-term bullish', bestWhen: 'IV Rank < 25, high conviction on direction', maxProfit: 'Unlimited upside', maxLoss: 'Premium paid', dte: '365-730 days', close: 'When thesis plays out or at 50% profit' },
              ].map(s => <StrategyCard key={s.name} {...s} buying />)}
            </div>
          </div>
        </section>

        {/* Timing Rules */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            The Timing Rules
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { title: 'Enter selling strategies at 30-45 DTE', desc: 'The theta decay sweet spot. Time decay accelerates here — you earn the most decay per day without excessive gamma risk in the final weeks.' },
              { title: 'Enter buying strategies at 60-90 DTE', desc: 'Long options need time to be right. Buying at 60-90 DTE gives your directional thesis time to develop without excessive time premium cost.' },
              { title: 'Close at 50% of max profit', desc: 'Professional rule #1. If you sold for £200 premium, close when you have made £100. The final 50% requires the highest risk period. Not worth it.' },
              { title: 'Close at 21 DTE regardless', desc: 'In the final 3 weeks before expiry, gamma risk explodes. A small stock move can cause huge P&L swings. Professionals always exit before this zone.' },
              { title: 'Stop loss at 2x premium received', desc: 'If you collected £200, close if the position is down £400. Capital preservation is job #1. One bad trade can wipe out months of gains.' },
              { title: 'Never hold through earnings', desc: 'After earnings, IV drops 40-60% instantly. Long option holders can lose 50% of their position even if the stock moves in the right direction.' },
            ].map(rule => (
              <div key={rule.title} className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-start gap-3">
                  <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-1" />
                  <div>
                    <div className="font-semibold text-sm mb-1">{rule.title}</div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{rule.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Wheel Strategy */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-2">The Wheel Strategy</h2>
          <p className="text-muted-foreground mb-6">The most beginner-friendly professional strategy. A repeating income cycle.</p>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="grid md:grid-cols-4 gap-3 mb-6">
              {[
                { step: '1', title: 'Sell Cash-Secured Put', desc: 'Below current price — collect premium', colour: 'bg-primary/10 text-primary border-primary/20' },
                { step: '2', title: 'If Assigned', desc: 'Own 100 shares at a discount', colour: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
                { step: '3', title: 'Sell Covered Call', desc: 'Above cost basis — collect more premium', colour: 'bg-primary/10 text-primary border-primary/20' },
                { step: '4', title: 'If Called Away', desc: 'Premium + price gain — repeat cycle', colour: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
              ].map(item => (
                <div key={item.step} className={`border rounded-lg p-4 text-center ${item.colour}`}>
                  <div className="text-lg font-bold mb-1">{item.step}</div>
                  <div className="font-semibold text-sm mb-1">{item.title}</div>
                  <div className="text-xs opacity-80">{item.desc}</div>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-border">
              <div className="text-center">
                <div className="text-lg font-bold text-primary">68-72%</div>
                <div className="text-xs text-muted-foreground">Reported win rate</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-primary">15-25%</div>
                <div className="text-xs text-muted-foreground">Typical annual return</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-primary">Key rule</div>
                <div className="text-xs text-muted-foreground">Only on stocks you want to own</div>
              </div>
            </div>
          </div>
        </section>

        <div className="text-center border-t border-border pt-12">
          <p className="text-muted-foreground mb-4">Ready to apply this framework to a live stock?</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-md hover:bg-primary/90 transition-colors"
          >
            Go to Strategy Analysis
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

      </main>
    </div>
  )
}

function StrategyCard({ name, risk, setup, outlook, bestWhen, maxProfit, maxLoss, dte, close, buying = false }: {
  name: string; risk: number; setup: string; outlook: string; bestWhen: string
  maxProfit: string; maxLoss: string; dte: string; close: string; buying?: boolean
}) {
  const riskColours = ['', 'text-emerald-400', 'text-green-400', 'text-yellow-400', 'text-orange-400', 'text-red-400']
  const riskLabels = ['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High']
  return (
    <div className={`bg-card border rounded-lg p-5 ${buying ? 'border-orange-500/20' : 'border-border'}`}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-base">{name}</h3>
        <div className={`text-xs font-semibold shrink-0 ml-4 ${riskColours[risk]}`}>
          Risk {risk}/5 — {riskLabels[risk]}
        </div>
      </div>
      <div className="space-y-1.5 text-sm">
        {[
          { label: 'Setup', value: setup },
          { label: 'Outlook', value: outlook },
          { label: 'Best when', value: bestWhen },
          { label: 'Max profit', value: maxProfit, positive: true },
          { label: 'Max loss', value: maxLoss, negative: true },
          { label: 'Ideal DTE', value: dte },
          { label: 'Close rule', value: close },
        ].map(row => (
          <div key={row.label} className="flex gap-2">
            <span className="text-muted-foreground shrink-0 w-20 text-xs pt-0.5">{row.label}</span>
            <span className={`leading-snug text-xs ${row.positive ? 'text-emerald-400' : row.negative ? 'text-red-400' : 'text-muted-foreground'}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}