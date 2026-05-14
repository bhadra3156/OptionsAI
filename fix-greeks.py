# Run from project root: python fix-greeks.py
import re

filepath = "app/(dashboard)/dashboard/page.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Find the estimateGreeks function and replace it
start_marker = "function estimateGreeks("
end_marker = "\nfunction GreeksExplainerCard"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"ERROR: markers not found. start={start_idx}, end={end_idx}")
else:
    new_func = '''function estimateGreeks(
  strike: number,
  price: number,
  iv30Percent: number,
  dte: number,
  action: 'buy' | 'sell',
  type: 'call' | 'put'
) {
  const iv = iv30Percent / 100
  const t = Math.max(dte, 1) / 365
  const sqrtT = Math.sqrt(t)
  const moneyness = (price - strike) / (price * iv * sqrtT)
  let rawDelta: number
  if (type === 'call') {
    rawDelta = Math.max(0.02, Math.min(0.98, 0.5 + moneyness * 0.2))
  } else {
    rawDelta = Math.max(-0.98, Math.min(-0.02, -0.5 + moneyness * 0.2))
  }
  const gamma = Math.max(0.0001, 0.4 * Math.exp(-0.5 * moneyness * moneyness) / (price * iv * sqrtT))
  const thetaPerDay = (price * iv * 0.4) / (2 * Math.sqrt(365 / Math.max(dte, 1))) / 100
  const vega = (price * sqrtT * 0.4) / 100
  if (action === 'sell') {
    return {
      delta: Math.round(-rawDelta * 1000) / 1000,
      gamma: Math.round(-gamma * 10000) / 10000,
      theta: Math.round(thetaPerDay * 100) / 100,
      vega: Math.round(-vega * 100) / 100,
    }
  } else {
    return {
      delta: Math.round(rawDelta * 1000) / 1000,
      gamma: Math.round(gamma * 10000) / 10000,
      theta: Math.round(-thetaPerDay * 100) / 100,
      vega: Math.round(vega * 100) / 100,
    }
  }
}
'''
    content = content[:start_idx] + new_func + content[end_idx:]
    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("Greeks function replaced successfully")

    # Verify theta is no longer 0
    with open(filepath, "r") as f:
        check = f.read()
    print("Has thetaPerDay formula:", "thetaPerDay" in check)
