# OptionsAI — Tech Stack Decisions (Final)

> Last updated: 28 May 2026 — cleanup session aligning with shipped reality.
> These decisions are locked. Do not suggest alternatives unless the user explicitly asks to reconsider a choice.

---

## Framework: Next.js 14 with App Router
- **Chosen over:** Remix, plain React, Vite
- **Why:** Industry standard for full-stack React apps. App Router gives us server components (faster), built-in API routes (no separate backend needed), and zero-config Vercel deployment.
- **Critical:** Always use the App Router (`app/` directory). Never use the Pages Router (`pages/` directory). They are two different systems and cannot be mixed.

## Language: TypeScript
- **Chosen over:** Plain JavaScript
- **Why:** TypeScript catches type errors before they crash in production. Especially important when parsing complex JSON from Claude API and Yahoo Finance. Every file uses `.ts` or `.tsx` extension.

## Styling: Tailwind CSS + custom HSL design tokens
- **Chosen over:** Material UI, Chakra UI, styled-components, plain CSS, shadcn/ui as a package
- **Why:** Tailwind is utility-first — you write CSS as class names directly in JSX. Custom HSL CSS variables (defined in `app/globals.css`) give us a clean Bloomberg/trading-terminal dark theme with a vivid green primary colour. We chose NOT to install shadcn as a package — components are hand-rolled to keep dependencies minimal and the design tightly controlled. We use `clsx` and `tailwind-merge` for class composition.
- **Theme:** Forced dark only. There is no `.dark` class variant — the dark theme IS the only theme.

## Database: Supabase (PostgreSQL)
- **Chosen over:** Firebase, PlanetScale, MongoDB, Neon
- **Why:** Open source, built on PostgreSQL (the gold standard relational database), generous free tier, great TypeScript SDK, EU data residency (important for UK GDPR compliance), built-in Row Level Security.
- **Note:** We use Supabase for data storage only. Authentication is handled by Clerk (see below).

## Authentication: Clerk
- **Chosen over:** NextAuth, Auth.js, Supabase Auth, Firebase Auth
- **Why:** Simplest way to add auth to a Next.js app. Pre-built sign-in/sign-up UI components, works perfectly with Next.js App Router middleware, clean dashboard, direct Stripe integration for syncing subscription status (for future use). Free for up to 10,000 monthly active users.
- **Implementation:** `middleware.ts` at project root uses `clerkMiddleware` with `createRouteMatcher` to protect everything except `/`, `/sign-in(.*)`, `/sign-up(.*)`.

## Market Data: Yahoo Finance (free)
- **Chosen over:** Polygon.io ($29/mo), Tradier (US brokerage account required), Alpha Vantage (limited options data)
- **Reason for change from original plan:** Originally specced as Polygon. The shipped reality is Yahoo Finance, accessed via a cookie+crumb session flow. Costs nothing.
- **Tradeoffs we accept by using Yahoo:**
  - Data is delayed approximately 15 minutes
  - No Greeks returned — we estimate delta/gamma/theta/vega client-side with a Black-Scholes-style approximation
  - No official API contract — Yahoo can change response shapes; every fetch path has defensive error handling
- **When we might reconsider:** If we need real-time data for execution timing (e.g. for the `/signals` page if it ever upgrades to true IBKR auto-execution), at that point we'd add a paid IBKR market data subscription (~$4.50/mo for OPRA Top of Book).

## AI: Anthropic Claude API
- **Default model:** `claude-sonnet-4-6` — used for standard scans, single-ticker analysis, and most calls. Best balance of cost and quality.
- **Premium model:** `claude-opus-4-7` — reserved for the highest-stakes calls only. Specifically: the final qualification stage of `/signals` where reasoning quality justifies the cost premium.
- **Why these models:**
  - Sonnet 4.6 (Feb 2026) is the current recommended production default
  - Opus 4.7 (Apr 2026) is the current flagship — used sparingly where it matters
- **Pinned snapshots:** Model strings are version-pinned, not auto-updating. When new generations ship, we'll review and bump deliberately.
- **Never hardcode the API key** — always use `ANTHROPIC_API_KEY` environment variable.

## Hosting: Vercel
- **Chosen over:** AWS, Railway, Render, Netlify
- **Why:** Made by the creators of Next.js. Zero-config deployment — push to GitHub and it deploys automatically. Generous free tier. Built-in edge caching, analytics, environment variable management, and Vercel Cron for scheduled jobs.

## Version Control: GitHub
- **Why:** Industry standard. Direct integration with Vercel (push to main → auto-deploy). Free for public and private repositories.

## Notifications (Future, for /signals): Telegram Bot
- **Chosen over:** Email, SMS, Discord, push notifications
- **Why:** Free, instant, supports inline buttons for YES/NO approval flows, easy to set up via @BotFather, webhook integrates cleanly with Next.js API routes.

## Payments: Stripe (future, post-public-launch)
- **Not currently wired up.** Will be added if/when the platform opens to other paying users.

---

## Things We Explicitly Considered and REJECTED

- **GROQ as a second AI vendor** — considered adding a fast GROQ stage-1 filter before Claude. Rejected to keep the stack single-vendor on the AI side. Claude Sonnet 4.6 with low max_tokens is fast enough for stage 1.
- **Polygon.io** — rejected on cost grounds. Yahoo Finance covers our needs at $0.
- **Python IBKR microservice + VPS** — rejected on cost grounds. The `/signals` page is a manual-execution signal generator, not an auto-executor. We may revisit this if signal performance proves itself over a paper-trading period.
- **shadcn/ui as an installed package** — rejected to keep bundle size minimal and design under tight control.
- **A separate Pages Router** — never. App Router only.

---

## Coding Standards (enforce in every response)

1. Always use TypeScript — never plain JavaScript
2. Always use Next.js App Router (`app/` directory) — never Pages Router
3. Always put API keys in environment variables — NEVER hardcode them
4. Always add error handling AND loading states to every component
5. Always add the financial disclaimer to any page showing strategy output
6. Keep components small and single-purpose — one file, one job
7. Use server components by default — only add `"use client"` when truly needed (event handlers, useState, useEffect)
8. All external API calls go in `app/api/` routes — never call external APIs directly from the frontend
9. Always validate user input before sending to any API (e.g. `isValidTicker()` for tickers)
10. Comment complex logic so the builder (non-developer) can understand it

---

## Environment Variables Reference

All required environment variables. Never expose these in code or commit them to GitHub.

```
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === To be added when /signals page is built ===
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=
# CRON_SECRET=             # to protect /api/cron endpoints from public calls
```

Variables starting with `NEXT_PUBLIC_` are visible in the browser. All others are server-side only. Never put secret keys in `NEXT_PUBLIC_` variables.

---

## What is NOT in the stack (and why)

- ❌ **Polygon.io** — too expensive for our current scope
- ❌ **GROQ** — single AI vendor is simpler
- ❌ **Python services** — entire stack is TypeScript/Next.js
- ❌ **IBKR auto-execution** — `/signals` is manual-execution only for now
- ❌ **Stripe** — not until public launch
- ❌ **Pages Router** — App Router only, always
- ❌ **shadcn/ui as installed package** — hand-rolled components instead
