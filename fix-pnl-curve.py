# Run from project root: python fix-pnl-curve.py
# Adds P&L Curve component to dashboard page

filepath = "app/(dashboard)/dashboard/page.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add the PnLCurveCard call after PositionSizingCard and before Trade Legs
old_placement = '            {/* Trade Legs */}\n            <div className="bg-card border border-border rounded-lg p-6">'
new_placement = '''            {/* P&L Curve */}
            <PnLCurveCard
              legs={result.strategy.legs}
              price={result.marketData.currentPrice}
              iv30={result.marketData.iv30}
              ticker={result.marketData.ticker}
              maxProfit={result.strategy.metrics.maxProfit}
              maxLoss={result.strategy.metrics.maxLoss}
            />

            {/* Trade Legs */}
            <div className="bg-card border border-border rounded-lg p-6">'''

content = content.replace(old_placement, new_placement)

# 2. Add the PnLCurveCard component before the OutlookBadge function
pnl_component = '''
// ── P&L Curve Calculator ───────────────────────────────────────────────────
// Calculates profit/loss at every stock price at expiry.
// This is the same chart used by ThinkorSwim, Tastytrade, and IBKR.
// Pure maths — no API needed.

function calcOptionValue(
  spotPrice: number,
  strike: number,
  type: 'call' | 'put',
  action: 'buy' | 'sell',
  quantity: number,
  premiumEstimate: number
): number {
  let intrinsicValue = 0
  if (type === 'call') {
    intrinsicValue = Math.max(0, spotPrice - strike)
  } else {
    intrinsicValue = Math.max(0, strike - spotPrice)
  }
  // P&L = (value at expiry - premium paid/received) × contracts × 100
  if (action === 'buy') {
    return (intrinsicValue - premiumEstimate) * quantity * 100
  } else {
    return (premiumEstimate - intrinsicValue) * quantity * 100
  }
}

function PnLCurveCard({
  legs,
  price,
  iv30,
  ticker,
  maxProfit,
  maxLoss,
}: {
  legs: AnalyzeResponse['strategy']['legs']
  price: number
  iv30: number
  ticker: string
  maxProfit: string
  maxLoss: string
}) {
  // Calculate price range: ±40% from current price
  const rangePct = 0.40
  const minPrice = price * (1 - rangePct)
  const maxPrice = price * (1 + rangePct)
  const steps = 80
  const stepSize = (maxPrice - minPrice) / steps

  // Parse max profit/loss for premium estimates
  const parseAmount = (s: string): number => {
    const match = s.replace(/,/g, '').match(/[\d.]+/)
    return match ? parseFloat(match[0]) : 100
  }

  const totalCredit = parseAmount(maxProfit)
  const totalDebit = parseAmount(maxLoss)

  // Estimate per-leg premium from total credit/debit
  const sellLegs = legs.filter(l => l.action === 'sell')
  const buyLegs = legs.filter(l => l.action === 'buy')
  const perLegPremium = legs.length > 0
    ? (totalCredit / Math.max(sellLegs.length, 1)) / 100
    : 1.0

  // Generate P&L curve data points
  const dataPoints: Array<{ spotPrice: number; pnl: number }> = []

  for (let i = 0; i <= steps; i++) {
    const spotPrice = minPrice + i * stepSize
    let totalPnl = 0
    legs.forEach(leg => {
      // Estimate individual leg premium
      const isSell = leg.action === 'sell'
      const legPremium = isSell
        ? (totalCredit / Math.max(sellLegs.length, 1)) / 100
        : (totalDebit / Math.max(buyLegs.length, 1)) / 100
      totalPnl += calcOptionValue(spotPrice, leg.strike, leg.type, leg.action, leg.quantity, legPremium)
    })
    dataPoints.push({ spotPrice, pnl: Math.round(totalPnl * 100) / 100 })
  }

  // Chart dimensions
  const chartWidth = 580
  const chartHeight = 200
  const paddingLeft = 55
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 35
  const plotWidth = chartWidth - paddingLeft - paddingRight
  const plotHeight = chartHeight - paddingTop - paddingBottom

  // Scale functions
  const allPnls = dataPoints.map(d => d.pnl)
  const minPnl = Math.min(...allPnls) * 1.15
  const maxPnlVal = Math.max(...allPnls) * 1.15

  const xScale = (sp: number) =>
    paddingLeft + ((sp - minPrice) / (maxPrice - minPrice)) * plotWidth
  const yScale = (pnl: number) =>
    paddingTop + plotHeight - ((pnl - minPnl) / (maxPnlVal - minPnl)) * plotHeight

  // Zero line y position
  const zeroY = yScale(0)

  // Build SVG path
  const pathD = dataPoints
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.spotPrice).toFixed(1)} ${yScale(d.pnl).toFixed(1)}`)
    .join(' ')

  // Profit fill path (above zero)
  const profitFillD = dataPoints
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.spotPrice).toFixed(1)} ${Math.min(yScale(d.pnl), zeroY).toFixed(1)}`)
    .join(' ') +
    ` L ${xScale(dataPoints[dataPoints.length-1].spotPrice).toFixed(1)} ${zeroY.toFixed(1)} L ${xScale(dataPoints[0].spotPrice).toFixed(1)} ${zeroY.toFixed(1)} Z`

  // Loss fill path (below zero)
  const lossFillD = dataPoints
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.spotPrice).toFixed(1)} ${Math.max(yScale(d.pnl), zeroY).toFixed(1)}`)
    .join(' ') +
    ` L ${xScale(dataPoints[dataPoints.length-1].spotPrice).toFixed(1)} ${zeroY.toFixed(1)} L ${xScale(dataPoints[0].spotPrice).toFixed(1)} ${zeroY.toFixed(1)} Z`

  // Key price labels for x-axis
  const xLabels = [0.7, 0.85, 1.0, 1.15, 1.3].map(mult => ({
    price: price * mult,
    x: xScale(price * mult),
  }))

  // Y-axis labels
  const yRange = maxPnlVal - minPnl
  const yStep = yRange > 1000 ? 500 : yRange > 500 ? 200 : yRange > 200 ? 100 : 50
  const yLabels: Array<{ val: number; y: number }> = []
  for (let v = Math.ceil(minPnl / yStep) * yStep; v <= maxPnlVal; v += yStep) {
    yLabels.push({ val: v, y: yScale(v) })
  }

  // Current price marker
  const currentX = xScale(price)

  // Short strike markers
  const shortStrikes = legs
    .filter(l => l.action === 'sell')
    .map(l => ({ strike: l.strike, x: xScale(l.strike), type: l.type }))

  // Breakeven points (where P&L crosses zero)
  const breakevenPoints: Array<{ price: number; x: number }> = []
  for (let i = 1; i < dataPoints.length; i++) {
    const prev = dataPoints[i-1]
    const curr = dataPoints[i]
    if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl < 0)) {
      const bPrice = prev.spotPrice + (curr.spotPrice - prev.spotPrice) * (-prev.pnl / (curr.pnl - prev.pnl))
      breakevenPoints.push({ price: bPrice, x: xScale(bPrice) })
    }
  }

  // P&L at current price
  const currentPnl = dataPoints[Math.round(steps / 2)]?.pnl ?? 0

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <SectionLabel icon={BarChart2}>P&L Curve at Expiry</SectionLabel>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-3 text-center">
          <p className="text-xs text-muted-foreground mb-0.5">Max Profit</p>
          <p className="text-base font-bold text-emerald-400">+${parseAmount(maxProfit).toFixed(0)}</p>
        </div>
        <div className="bg-secondary/30 rounded-md p-3 text-center">
          <p className="text-xs text-muted-foreground mb-0.5">At Current Price</p>
          <p className={`text-base font-bold ${currentPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(0)}
          </p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 text-center">
          <p className="text-xs text-muted-foreground mb-0.5">Max Loss</p>
          <p className="text-base font-bold text-red-400">-${parseAmount(maxLoss).toFixed(0)}</p>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full"
          style={{ minWidth: '320px' }}
        >
          {/* Grid lines */}
          {yLabels.map(({ val, y }) => (
            <g key={val}>
              <line
                x1={paddingLeft} y1={y.toFixed(1)}
                x2={chartWidth - paddingRight} y2={y.toFixed(1)}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1"
              />
              <text
                x={(paddingLeft - 5).toFixed(1)} y={y.toFixed(1)}
                textAnchor="end" dominantBaseline="middle"
                fill="rgba(255,255,255,0.4)" fontSize="9"
              >
                {val >= 0 ? `+$${val}` : `-$${Math.abs(val)}`}
              </text>
            </g>
          ))}

          {/* Loss fill (red zone below zero) */}
          <path d={lossFillD} fill="rgba(239,68,68,0.15)" />

          {/* Profit fill (green zone above zero) */}
          <path d={profitFillD} fill="rgba(34,197,94,0.15)" />

          {/* Zero line */}
          <line
            x1={paddingLeft} y1={zeroY.toFixed(1)}
            x2={chartWidth - paddingRight} y2={zeroY.toFixed(1)}
            stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="4,3"
          />
          <text
            x={(paddingLeft - 5).toFixed(1)} y={zeroY.toFixed(1)}
            textAnchor="end" dominantBaseline="middle"
            fill="rgba(255,255,255,0.4)" fontSize="9"
          >$0</text>

          {/* P&L curve line */}
          <path
            d={pathD}
            fill="none"
            stroke="rgb(34,197,94)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Short strike markers */}
          {shortStrikes.map((s, i) => (
            <g key={i}>
              <line
                x1={s.x.toFixed(1)} y1={paddingTop.toString()}
                x2={s.x.toFixed(1)} y2={(chartHeight - paddingBottom).toString()}
                stroke="rgba(251,146,60,0.6)" strokeWidth="1.5" strokeDasharray="3,2"
              />
              <text
                x={s.x.toFixed(1)} y={(paddingTop - 6).toString()}
                textAnchor="middle" fill="rgba(251,146,60,0.8)" fontSize="8"
              >${s.strike}</text>
            </g>
          ))}

          {/* Breakeven markers */}
          {breakevenPoints.map((bp, i) => (
            <g key={i}>
              <circle
                cx={bp.x.toFixed(1)} cy={zeroY.toFixed(1)}
                r="4" fill="rgb(250,204,21)" stroke="rgb(17,24,39)" strokeWidth="1.5"
              />
              <text
                x={bp.x.toFixed(1)} y={(zeroY + 14).toString()}
                textAnchor="middle" fill="rgb(250,204,21)" fontSize="8" fontWeight="bold"
              >${bp.price.toFixed(1)}</text>
            </g>
          ))}

          {/* Current price marker */}
          <line
            x1={currentX.toFixed(1)} y1={paddingTop.toString()}
            x2={currentX.toFixed(1)} y2={(chartHeight - paddingBottom).toString()}
            stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"
          />
          <text
            x={currentX.toFixed(1)} y={(chartHeight - paddingBottom + 14).toString()}
            textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontWeight="bold"
          >${price.toFixed(0)}</text>

          {/* X-axis price labels */}
          {xLabels.map(({ price: lp, x }) => (
            lp !== price && (
              <text key={lp}
                x={x.toFixed(1)} y={(chartHeight - paddingBottom + 14).toString()}
                textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8"
              >${lp.toFixed(0)}</text>
            )
          ))}

          {/* Chart border */}
          <rect
            x={paddingLeft} y={paddingTop}
            width={plotWidth} height={plotHeight}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1"
          />
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-white/40" style={{borderTop: '1px dashed'}} />
          <span className="text-xs text-muted-foreground">Current price (${price.toFixed(2)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-orange-400/60" style={{borderTop: '1px dashed'}} />
          <span className="text-xs text-muted-foreground">Short strikes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="text-xs text-muted-foreground">Breakeven point(s)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 bg-emerald-500/30 rounded" />
          <span className="text-xs text-muted-foreground">Profit zone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 bg-red-500/30 rounded" />
          <span className="text-xs text-muted-foreground">Loss zone</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        P&L shown at expiry for 1 contract. Premiums are estimated from the AI strategy output.
        Actual values depend on execution prices — verify on your broker platform.
      </p>
    </div>
  )
}

'''

# Insert before OutlookBadge function
insert_before = '\nfunction OutlookBadge'
if insert_before in content:
    content = content.replace(insert_before, pnl_component + '\nfunction OutlookBadge', 1)
    print("PnL component inserted")
else:
    print("ERROR: OutlookBadge not found")

# Add BarChart2 to imports
if 'BarChart2' not in content:
    content = content.replace(
        "  Move, Target, Activity, Calculator, Bookmark, BookmarkCheck, Star, X",
        "  Move, Target, Activity, Calculator, Bookmark, BookmarkCheck, Star, X, BarChart2"
    )
    print("BarChart2 import added")

with open(filepath, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

print("Done - run: npm run build")
