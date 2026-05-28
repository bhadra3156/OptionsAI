# OptionsAI `/signals` — Phase A Plan

> Last updated: 28 May 2026
> Status: Phase A complete. Phase B (Supabase + types wiring) begins next session.

---

## 1. What `/signals` is

`/signals` is a **manual-execution signal generator** that sits on top of `/scan`. It re-qualifies the top opportunities from `/scan` using deeper Claude reasoning, then alerts the user via Telegram to approve or reject each one. Approved signals show a ready-to-paste IBKR order ticket — the user places the trade themselves in IBKR.

It is intentionally **not** an auto-trader. We're deferring that until paper-trading proves the signals are worth executing.

---

## 2. What `/signals` is NOT

To prevent scope creep, here is what we are explicitly NOT building:

| Not building | Reason |
|---|---|
| Auto-execution to IBKR | Requires persistent server (~$5/mo) + IBKR market data sub (~$4.50/mo). Deferred until signal performance is proven. |
| Polygon.io or paid market data | We're staying on Yahoo Finance (free). Accept the 15-min delay and estimated Greeks. |
| GROQ as a second AI vendor | Claude-only keeps the stack simple. Sonnet 4.6 is fast enough for our volume. |
| Python microservices | Whole stack stays TypeScript/Next.js. |
| Auto-close at profit target / stop loss | Without auto-execution, "auto-close" is impossible. We send Telegram alerts when conditions are met; the user closes manually. |
| Real-time position monitoring | Vercel Cron runs every 30 min during market hours, not continuously. We accept ~30-min lag on position alerts. |
| A duplicate trade journal | The existing `/trades` table stays the source of truth for executed trades. `/signals` feeds into it, doesn't replace it. |

---

## 3. The data flow (end-to-end)

```
┌─────────────────────────────────────────────────────────┐
│  TRIGGER: Vercel Cron OR manual "Rescan" button         │
│  Schedule: every 30 min during US market hours          │
│  (2:30 PM – 9:00 PM UK time, Mon-Fri)                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 1: REUSE existing /api/scan endpoint              │
│  → 30 tickers, AI scored 1-100 by Claude Sonnet 4.6     │
│  → Returns sorted list, top-scored first                │
│  → ~5-10 seconds total                                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼ Top N candidates (default: top 5)
┌─────────────────────────────────────────────────────────┐
│  STAGE 2: PRE-FILTER (no AI, pure rules)                │
│  Hard rejects (skip Claude entirely):                   │
│  ✗ AI score < 75                                        │
│  ✗ Earnings within 7 days                               │
│  ✗ Total OI < 500 (illiquid)                            │
│  ✗ IV Rank 30-50 (no clear edge either direction)       │
│  ✗ Same ticker has open signal in last 24h              │
└────────────────────────┬────────────────────────────────┘
                         │ Survivors (typically 0-3 tickers)
                         ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 3: DEEP QUALIFICATION (Claude Opus 4.7)           │
│  For each survivor:                                      │
│  → Fetch full market data via lib/yahoo.ts              │
│  → Send to Claude Opus 4.7 with strict system prompt    │
│  → Claude returns: qualify (yes/no), confidence,        │
│    full strategy, entry credit/debit, profit target,    │
│    stop loss, IBKR order ticket text                    │
│  → Only signals with confidence >= 80 are qualified     │
└────────────────────────┬────────────────────────────────┘
                         │ Qualified signals
                         ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 4: PERSIST + ALERT                               │
│  → INSERT into `signals` table (status: 'pending')      │
│  → For each: send Telegram message with YES/NO buttons  │
│  → INSERT into `telegram_approvals` (status: 'sent')    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 5: USER RESPONDS (within 15 min)                 │
│  Telegram → POST /api/telegram/webhook                  │
│  → YES: signal.status = 'approved', show IBKR ticket    │
│  → NO:  signal.status = 'rejected'                      │
│  → No response in 15 min: signal.status = 'expired'     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼ User has placed the trade manually
┌─────────────────────────────────────────────────────────┐
│  STAGE 6: USER REPORTS FILL (manual, on /signals page)  │
│  → Button on signal card: "I placed this trade"          │
│  → Form: actual fill price, contracts, notes            │
│  → INSERT into existing `trades` table                  │
│  → signal.status = 'executed', link to trade.id         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Design decisions & rationale

### 4.1 Why two separate tables (`signals` + `telegram_approvals`)?

**Decision:** Keep them separate. `signals` is the trading record; `telegram_approvals` is the messaging audit trail.

**Rationale:** A single signal could (theoretically) be re-sent if the first message fails to deliver. Status fields conflate two concerns. Separation makes it easier to debug "did Telegram even get my message?" vs "is the signal still pending?".

If you'd prefer one table with status enum, say so and I'll merge them.

### 4.2 Why Claude Opus 4.7 for Stage 3 (not Sonnet 4.6)?

**Decision:** Use Opus 4.7 for the final qualification step only.

**Rationale:** Stage 3 runs on ~0-3 tickers at most, ~2-4 times per day = maybe 10-20 Opus calls per day max. Cost: roughly £0.50-£2 per day. Quality of qualification reasoning at this gate matters far more than speed. Stage 1 (the bulk scan) stays on Sonnet 4.6 because cost matters there (30 tickers × multiple scans/day).

### 4.3 Why pre-filter before Claude?

**Decision:** Apply hard rule filters before calling Claude Opus.

**Rationale:** Some rejections need no AI reasoning (e.g. "earnings in 3 days = no premium-buying strategy" is a rule, not a judgement). Pre-filtering cuts AI costs and avoids wasting Opus calls on obvious nopes.

### 4.4 Why 15-min Telegram expiry?

**Decision:** 15 minutes from message send to expiry.

**Rationale:** Options prices drift. After 15 min, the credit Claude calculated might not be achievable. Long enough you can step away briefly; short enough that fill price won't materially differ from analysis.

### 4.5 Why manual fill reporting?

**Decision:** User clicks "I placed this trade" and enters fill price.

**Rationale:** Without IBKR auto-execution, we have no way to know what you actually filled at (or if you filled at all). This honest manual step also serves as a discipline check — if you can't be bothered to report fills, you can't measure performance, which is the whole point of paper-trading first.

### 4.6 Why feed into existing `trades` table?

**Decision:** Executed signals create rows in the existing `trades` table.

**Rationale:** You already have a working P&L tracker. Building a parallel one is duplicate work. The link is one-way: `signals.executed_trade_id` → `trades.id`. `/trades` page doesn't need to know about signals at all.

---

## 5. The qualification criteria (Stage 3 system prompt logic)

Claude Opus must answer ONE question: **Is this trade worth me, the user, actually placing?**

Hard requirements for qualification (all must pass):
1. Confidence score (Claude's self-assessed) >= 80
2. Strategy matches IV Rank regime (sell if IVR > 50, buy if IVR < 30)
3. Defined risk only (no naked options) — risk rating 1, 2, or 3 from the existing schema
4. Bid/ask spread on chosen legs < 10% of mid (liquidity check)
5. Max loss <= 5% of assumed portfolio NAV (default assumption: $10,000 NAV, so max loss <= $500)
6. No earnings within DTE window
7. Probability of profit >= 65%

If any fail, return `{ qualify: false, reason: "..." }` and the signal is logged for diagnostics but not sent to Telegram.

---

## 6. Vercel Cron schedule

| Time (UK) | Time (US ET) | What runs |
|---|---|---|
| 14:35 | 09:35 | First scan, 5 min after US market open |
| 15:00 | 10:00 | Scan |
| 16:00 | 11:00 | Scan |
| 17:00 | 12:00 | Scan |
| 18:00 | 13:00 | Scan |
| 19:00 | 14:00 | Scan |
| 20:00 | 15:00 | Scan |
| 20:45 | 15:45 | Final scan, 15 min before US close |

8 scheduled scans per trading day. Plus the user can hit "Rescan" manually any time.

**Trade-off accepted:** Vercel's free Hobby plan allows daily-only cron. Free Pro plan: unlimited cron schedules. **You'll need to be on Vercel Hobby's "daily cron" tier or upgrade to Pro (£20/mo).** For Phase A this is a deferred decision — we'll build the cron endpoint, then decide schedule tier when you actually want to start running it.

**If you stay on Hobby tier:** we run cron once per day at market open, and you hit "Rescan" manually the other times.

---

## 7. Page wireframe

```
┌──────────────────────────────────────────────────────────┐
│  Signals                                    [Rescan]      │
│  AI-qualified trade opportunities                         │
│  Last scan: 14:35 UK · Next: 15:00                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ⚠ PENDING APPROVAL (1)                  ⏱ 11:42 left   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ AMD · Bull Put Spread · Confidence 87/100        │   │
│  │ IV Rank 66 · DTE 32 · POP 72%                    │   │
│  │ SELL 1× AMD 28 Jun $500 Put                      │   │
│  │ BUY  1× AMD 28 Jun $490 Put                      │   │
│  │ Credit: $2.10 · Max profit $210 · Max loss $790  │   │
│  │ Sent to Telegram at 14:36                        │   │
│  │ Status: waiting for YES/NO                       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ✅ APPROVED — READY TO PLACE (1)                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │ INTC · Iron Condor · Confidence 91/100           │   │
│  │ [📋 IBKR Order Ticket]  [✅ I placed this trade]  │   │
│  │ ┌──────────────────────────────────────────────┐ │   │
│  │ │ SELL 1 INTC 27 Jun 24 PUT                    │ │   │
│  │ │ BUY  1 INTC 27 Jun 23 PUT                    │ │   │
│  │ │ SELL 1 INTC 27 Jun 26 CALL                   │ │   │
│  │ │ BUY  1 INTC 27 Jun 27 CALL                   │ │   │
│  │ │ Limit: $0.42 credit                          │ │   │
│  │ └──────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  📜 TODAY'S HISTORY                                       │
│  ✓ INTC Iron Condor — approved 14:32 · executed @ $0.41 │
│  ✗ COIN Bull Put Spread — rejected 13:15                 │
│  ⏱ MSTR Iron Condor — expired 12:00 (no response)        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  This analysis is for educational purposes only.          │
│  Not financial advice. Options trading involves risk.    │
└──────────────────────────────────────────────────────────┘
```

---

## 8. Files we'll create in Phases B–F

This is the full inventory so you know what's coming. Order matters.

### Phase B — Foundation wiring
- `types/signals.ts` (in Phase A — done now)
- `docs/supabase-signals-migration.sql` (in Phase A — done now)
- `lib/signals/pre-filter.ts` — Stage 2 hard rules
- `lib/signals/qualify.ts` — Stage 3 Claude Opus call
- `lib/signals/ibkr-ticket.ts` — converts a signal to copy-paste IBKR text

### Phase C — API routes
- `app/api/signals/scan/route.ts` — manual or cron-triggered full pipeline
- `app/api/signals/list/route.ts` — GET pending + approved + history
- `app/api/signals/[id]/approve/route.ts` — mark approved (used by Telegram webhook)
- `app/api/signals/[id]/reject/route.ts` — mark rejected
- `app/api/signals/[id]/execute/route.ts` — user reports fill, creates trade row
- `app/api/cron/scan-signals/route.ts` — Vercel Cron endpoint (auth via CRON_SECRET)

### Phase D — Telegram
- `lib/telegram/send.ts` — sends formatted message with YES/NO buttons
- `app/api/telegram/webhook/route.ts` — receives YES/NO from user
- Telegram bot setup (you do this via @BotFather, I give instructions)

### Phase E — UI
- `app/(dashboard)/signals/page.tsx` — the page itself
- `components/signals/SignalCard.tsx`
- `components/signals/PendingCard.tsx`
- `components/signals/ApprovedCard.tsx`
- `components/signals/HistoryItem.tsx`
- Nav link added in `components/layout/nav.tsx`

### Phase F — Polish + cron
- Add cron schedule to `vercel.json`
- Add `CRON_SECRET` to Vercel env vars
- Connect "I placed this trade" button to existing `trades` table
- Paper-trade for 2-4 weeks
- Build performance dashboard (win rate, avg P&L per signal, etc.)

Total estimated new files: ~16. Estimated total lines of new code: ~1500-2000.

---

## 9. Risks & honest limitations

These are things this design CANNOT do well, listed honestly so we don't oversell what we're building:

1. **Data is 15 min delayed.** Yahoo Finance lag means our analysis is on data 15+ min old. By the time you place the trade in IBKR, prices may have moved. We mitigate this by setting limit orders at mid-price, but be aware fills will sometimes differ from Claude's calculated credit.

2. **Greeks are estimated, not real.** We compute delta/theta/gamma client-side via Black-Scholes approximation. Real Greeks (from IBKR) would be more accurate. This affects strike selection precision (the "0.16 delta short strike" might actually be 0.13 or 0.19).

3. **IV Rank is estimated, not true.** True IV Rank requires 52 weeks of historical IV data. Our estimate uses `(iv30 - 10) / 90 * 100`. Roughly correct, not precisely correct. Cross-check Market Chameleon before placing real-money trades.

4. **No real-time position monitoring.** If a position hits 50% profit at 11:00 and our cron next runs at 12:00, the alert is 60 min late. For 30-45 DTE positions this is fine. For 0DTE/weekly plays this would be unacceptable — we don't recommend those strategies anyway.

5. **Manual fill reporting can be skipped/lied to.** If you don't honestly report fills, win-rate stats become garbage. The whole system relies on the user's discipline here.

6. **Telegram bot tokens are sensitive.** If yours leaks, anyone could spam your chat. Store carefully in Vercel env vars, never in code.

---

## 10. Decision log (what we agreed)

- ✅ Manual execution only (no IBKR auto-trade)
- ✅ Claude-only AI (no GROQ)
- ✅ Yahoo Finance data (no Polygon)
- ✅ Vercel hosting only (no Render, no VPS)
- ✅ Paper-trade for 2-4 weeks before live money
- ✅ Sonnet 4.6 for bulk scan, Opus 4.7 for final qualification
- ✅ Two-table design (signals + telegram_approvals)
- ✅ Executed signals feed into existing `trades` table
- ✅ 15-min Telegram approval window
- ✅ Defer `/dashboard` → `/analyse` rename until we add `/signals` nav link

---

## 11. Open questions to resolve before Phase B

1. **Telegram setup**: have you created the bot via @BotFather yet? Do you have `TELEGRAM_BOT_TOKEN` and your personal `TELEGRAM_CHAT_ID`? If not, this is your homework for between Phase A and Phase B.
2. **Cron schedule**: Vercel Hobby (1× per day) or Pro (£20/mo, unlimited)? Affects Phase F only — not blocking Phases B-E.
3. **Initial NAV assumption for position sizing**: I've set the default to $10,000 (so max loss per trade = $500). Tell me your real number and I'll bake it in. This is a user setting; we can make it editable later.