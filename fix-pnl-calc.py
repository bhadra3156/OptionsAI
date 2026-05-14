# Run from project root: python fix-pnl-calc.py
# Fixes P&L curve showing wrong value at current price
# Root cause: buy leg premiums were being estimated incorrectly

filepath = "app/(dashboard)/dashboard/page.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Verify the file loaded
print(f"File loaded: {len(content)} chars")
print(f"Has PnLCurveCard: {'PnLCurveCard' in content}")

# Find the calculation section by unique markers
start_marker = "  // Parse max profit/loss for premium estimates"
end_marker = "  // Chart dimensions"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"ERROR: markers not found. start={start_idx}, end={end_idx}")
    # Show what's near the parseAmount function
    idx = content.find("parseAmount(maxProfit)")
    if idx > 0:
        print("Context around parseAmount:")
        print(repr(content[idx-200:idx+100]))
else:
    new_calc = """  // Parse dollar amounts from strategy metrics strings like "$41" or "$1,200"
  const parseAmount = (s: string): number => {
    const match = s.replace(/,/g, '').match(/[\\d.]+/)
    return match ? parseFloat(match[0]) : 100
  }

  const totalCredit = parseAmount(maxProfit)    // net credit received (e.g. 41)
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

    content = content[:start_idx] + new_calc + content[end_idx:]
    print("P&L calculation section replaced")

    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

    print("File saved successfully")
    print("Run: npm run build")
