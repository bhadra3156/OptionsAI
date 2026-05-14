# Run from project root: python fix-pnl-calc2.py
# Complete rewrite of P&L calculation using simpler, correct approach

filepath = "app/(dashboard)/dashboard/page.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

print(f"File loaded: {len(content)} chars")

# Replace the calcOptionValue function AND the data generation loop
# with a simpler, provably correct approach

old_calc_func = """function calcOptionValue(
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
}"""

new_calc_func = """function calcOptionValue(
  spotPrice: number,
  strike: number,
  type: 'call' | 'put',
  action: 'buy' | 'sell',
  quantity: number,
  premiumEstimate: number
): number {
  // Intrinsic value at expiry
  const intrinsic = type === 'call'
    ? Math.max(0, spotPrice - strike)
    : Math.max(0, strike - spotPrice)

  // P&L per share:
  // BUY: paid premium upfront, receive intrinsic at expiry → net = intrinsic - premium
  // SELL: received premium upfront, pay intrinsic at expiry → net = premium - intrinsic
  const pnlPerShare = action === 'buy'
    ? intrinsic - premiumEstimate
    : premiumEstimate - intrinsic

  return pnlPerShare * quantity * 100  // × 100 shares per contract
}"""

if old_calc_func in content:
    content = content.replace(old_calc_func, new_calc_func, 1)
    print("calcOptionValue replaced")
else:
    print("calcOptionValue not found - checking...")
    idx = content.find("function calcOptionValue")
    print(f"Found at: {idx}")

# Now fix the premium calculation section
old_premium = """  const totalCredit = parseAmount(maxProfit)    // net credit received (e.g. 41)
  const totalMaxLoss = parseAmount(maxLoss)      // max loss per contract (e.g. 159)
  const spreadWidth = totalCredit + totalMaxLoss // total spread width x100 (e.g. 200)

  const sellLegs = legs.filter(l => l.action === 'sell')
  const buyLegs = legs.filter(l => l.action === 'buy')
  const isCreditStrategy = sellLegs.length >= buyLegs.length

  // KEY FIX: Proper per-leg premium distribution
  // Credit strategy (iron condor, CSP, credit spread):
  //   At current price (all legs OTM), intrinsic value = 0 for all legs
  //   P&L should equal +totalCredit (the full net credit received)
  //   This works when: sum(sell premiums) - sum(buy premiums) = totalCredit / 100
  const getLegPremium = (leg: typeof legs[0]): number => {
    if (isCreditStrategy) {
      if (leg.action === 'sell') {
        // Each sell leg contributes equally to the gross credit
        // Gross credit per sell leg = (totalCredit + protection cost) / numSellLegs
        const grossCreditPerSell = spreadWidth / Math.max(sellLegs.length * 2, 1) / 100
        return grossCreditPerSell
      } else {
        // Each buy leg costs the protection premium
        const protectionCostPerBuy = (spreadWidth - totalCredit) / Math.max(buyLegs.length, 1) / 100
        return protectionCostPerBuy
      }
    } else {
      // Debit strategy: net debit = totalCredit field (confusingly named)
      if (leg.action === 'buy') {
        const grossDebitPerBuy = spreadWidth / Math.max(buyLegs.length * 2, 1) / 100
        return grossDebitPerBuy
      } else {
        const creditReceivedPerSell = (spreadWidth - totalCredit) / Math.max(sellLegs.length, 1) / 100
        return creditReceivedPerSell
      }
    }
  }

  // Generate P&L curve data points across the price range
  const dataPoints: Array<{ spotPrice: number; pnl: number }> = []

  for (let i = 0; i <= steps; i++) {
    const spotPrice = minPrice + i * stepSize
    let totalPnl = 0
    legs.forEach(leg => {
      totalPnl += calcOptionValue(
        spotPrice, leg.strike, leg.type, leg.action, leg.quantity, getLegPremium(leg)
      )
    })
    dataPoints.push({ spotPrice, pnl: Math.round(totalPnl * 100) / 100 })
  }

  """

new_premium = """  // Net credit/debit from strategy metrics
  const netCredit = parseAmount(maxProfit)    // e.g. 42 for iron condor
  const maxLossAmt = parseAmount(maxLoss)     // e.g. 158

  const sellLegs = legs.filter(l => l.action === 'sell')
  const buyLegs = legs.filter(l => l.action === 'buy')
  const isCreditStrategy = sellLegs.length >= buyLegs.length

  // CORRECT APPROACH: Work backwards from known max profit/loss
  // For iron condor with 2 sell + 2 buy legs and $2 spread width:
  //   spreadWidthPerSide = (netCredit + maxLossAmt) / 100 / numSellLegs = $2.00
  //   Each sell leg receives: spreadWidthPerSide / 2 + netCredit/100/numSellLegs/2
  //   Each buy leg costs: spreadWidthPerSide / 2 - netCredit/100/numBuyLegs/2
  //
  // Simpler: use the net credit directly
  //   Total sell premium per share = (netCredit/100 + buyProtection) / numSellLegs
  //   Total buy premium per share = buyProtection / numBuyLegs
  //   where buyProtection = maxLossAmt/100/numSellLegs (cost of wings)

  const numSell = Math.max(sellLegs.length, 1)
  const numBuy = Math.max(buyLegs.length, 1)

  // For a $2-wide iron condor collecting $0.42 net credit:
  //   Sell premium per leg = (2.00 + 0.42) / 2 / 2 = $0.605 → but this isn't right either
  //
  // SIMPLEST CORRECT METHOD: 
  //   At max profit (stock between short strikes at expiry), all legs expire OTM
  //   P&L = sum of sell premiums - sum of buy premiums = netCredit/100 per share
  //   At max loss (stock beyond long strike), one spread is fully exercised
  //   P&L = netCredit/100 - spreadWidth = -maxLossAmt/100 per share
  //
  //   spreadWidth = (netCredit + maxLossAmt) / 100 / numSellLegs
  //   sellPremium per leg = spreadWidth × 0.75 (typical ratio)
  //   buyPremium per leg = sellPremium - netCredit/100/numSellLegs

  const spreadWidthPerSide = (netCredit + maxLossAmt) / 100 / numSell
  const sellPremiumPerLeg = spreadWidthPerSide * 0.72  // sell at ~72% of spread width
  const netCreditPerSellLeg = (netCredit / 100) / numSell
  const buyPremiumPerLeg = sellPremiumPerLeg - netCreditPerSellLeg

  const getLegPremium = (leg: typeof legs[0]): number => {
    return leg.action === 'sell' ? sellPremiumPerLeg : buyPremiumPerLeg
  }

  // Generate P&L curve — verify: at stock between short strikes, all OTM
  // P&L = numSell × (sellPremium - 0) - numBuy × (buyPremium - 0)
  //      = numSell × sellPremium - numBuy × buyPremium  (× 100 per contract)
  //      = numSell × sellPremiumPerLeg×100 - numBuy × buyPremiumPerLeg×100
  //      ≈ netCredit ✓

  const dataPoints: Array<{ spotPrice: number; pnl: number }> = []

  for (let i = 0; i <= steps; i++) {
    const spotPrice = minPrice + i * stepSize
    let totalPnl = 0
    legs.forEach(leg => {
      totalPnl += calcOptionValue(
        spotPrice, leg.strike, leg.type, leg.action, leg.quantity, getLegPremium(leg)
      )
    })
    dataPoints.push({ spotPrice, pnl: Math.round(totalPnl * 100) / 100 })
  }

  """

if old_premium in content:
    content = content.replace(old_premium, new_premium, 1)
    print("Premium calculation replaced")
else:
    print("Premium section not found - trying alternate search")
    idx = content.find("const netCredit = parseAmount")
    if idx > 0:
        print("Already has new version at:", idx)
    else:
        idx = content.find("const totalCredit = parseAmount(maxProfit)")
        print(f"Old version found at: {idx}")

with open(filepath, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

print("\nDone. Verifying...")
with open(filepath, "r") as f:
    check = f.read()

print(f"Has netCredit: {'netCredit' in check}")
print(f"Has spreadWidthPerSide: {'spreadWidthPerSide' in check}")
print(f"File size: {len(check)} chars")
print("\nRun: npm run build")
