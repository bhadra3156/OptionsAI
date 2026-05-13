# OptionsAI — Phase 1 Setup Script
# Run this in PowerShell from: C:\Bhadra\Website Projects\OptionsAI
# Each section is numbered so you can see progress

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OptionsAI — Phase 1 Project Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── STEP 1: Create Next.js project ───────────────────────────────────────────
Write-Host "Step 1: Creating Next.js 14 project..." -ForegroundColor Yellow
Write-Host "NOTE: When prompted, answer:" -ForegroundColor White
Write-Host "  - TypeScript? YES" -ForegroundColor Green
Write-Host "  - ESLint? YES" -ForegroundColor Green
Write-Host "  - Tailwind CSS? YES" -ForegroundColor Green
Write-Host "  - src/ directory? NO" -ForegroundColor Red
Write-Host "  - App Router? YES" -ForegroundColor Green
Write-Host "  - Import alias? YES (keep default @/*)" -ForegroundColor Green
Write-Host ""
npx create-next-app@14 . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"

Write-Host ""
Write-Host "Step 1 complete!" -ForegroundColor Green
Write-Host ""

# ── STEP 2: Install all core dependencies ────────────────────────────────────
Write-Host "Step 2: Installing all project dependencies..." -ForegroundColor Yellow
Write-Host "This may take 2-3 minutes. Please wait..." -ForegroundColor White
Write-Host ""

npm install `
  @anthropic-ai/sdk `
  @clerk/nextjs `
  @supabase/supabase-js `
  @upstash/redis `
  @vercel/kv `
  axios `
  clsx `
  tailwind-merge `
  lucide-react `
  class-variance-authority `
  @radix-ui/react-slot `
  @radix-ui/react-dialog `
  @radix-ui/react-dropdown-menu `
  @radix-ui/react-tabs `
  @radix-ui/react-badge `
  @radix-ui/react-separator `
  next-themes

Write-Host ""
Write-Host "Step 2 complete!" -ForegroundColor Green
Write-Host ""

# ── STEP 3: Create folder structure ──────────────────────────────────────────
Write-Host "Step 3: Creating project folder structure..." -ForegroundColor Yellow

# App directories
New-Item -ItemType Directory -Force -Path "app\(auth)\sign-in\[[...sign-in]]" | Out-Null
New-Item -ItemType Directory -Force -Path "app\(auth)\sign-up\[[...sign-up]]" | Out-Null
New-Item -ItemType Directory -Force -Path "app\(dashboard)\dashboard" | Out-Null
New-Item -ItemType Directory -Force -Path "app\api\analyze" | Out-Null

# Component directories
New-Item -ItemType Directory -Force -Path "components\ui" | Out-Null
New-Item -ItemType Directory -Force -Path "components\strategy" | Out-Null
New-Item -ItemType Directory -Force -Path "components\layout" | Out-Null

# Library directories
New-Item -ItemType Directory -Force -Path "lib" | Out-Null

# Types directory
New-Item -ItemType Directory -Force -Path "types" | Out-Null

Write-Host "Folders created." -ForegroundColor Green
Write-Host ""

# ── STEP 4: Create .env.local from template ───────────────────────────────────
Write-Host "Step 4: Creating .env.local file..." -ForegroundColor Yellow

$envContent = @"
# OptionsAI — Environment Variables
# Fill in each value with your real API keys
# NEVER commit this file to GitHub

# ── CLERK AUTHENTICATION ──────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME
CLERK_SECRET_KEY=sk_test_REPLACE_ME
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# ── SUPABASE DATABASE ─────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://REPLACE_ME.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=REPLACE_ME
SUPABASE_SERVICE_ROLE_KEY=REPLACE_ME

# ── ANTHROPIC CLAUDE AI ───────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-REPLACE_ME

# ── POLYGON.IO MARKET DATA ────────────────────────────────────────────────────
POLYGON_API_KEY=REPLACE_ME

# ── VERCEL KV (REDIS CACHE) ───────────────────────────────────────────────────
KV_URL=redis://REPLACE_ME
KV_REST_API_URL=https://REPLACE_ME.upstash.io
KV_REST_API_TOKEN=REPLACE_ME
KV_REST_API_READ_ONLY_TOKEN=REPLACE_ME

# ── APP CONFIG ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
"@

Set-Content -Path ".env.local" -Value $envContent
Write-Host ".env.local created." -ForegroundColor Green
Write-Host ""

# ── STEP 5: Verify .gitignore has .env.local ──────────────────────────────────
Write-Host "Step 5: Checking .gitignore protects your API keys..." -ForegroundColor Yellow
$gitignore = Get-Content ".gitignore" -ErrorAction SilentlyContinue
if ($gitignore -match "\.env\.local") {
    Write-Host ".env.local is already protected in .gitignore. Good." -ForegroundColor Green
} else {
    Add-Content -Path ".gitignore" -Value "`n# Environment variables`n.env.local`n.env*.local"
    Write-Host ".env.local added to .gitignore." -ForegroundColor Green
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Phase 1 Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Place the downloaded .ts and .tsx files into their correct folders" -ForegroundColor White
Write-Host "  2. Fill in your API keys in .env.local" -ForegroundColor White
Write-Host "  3. Run: npm run dev" -ForegroundColor White
Write-Host "  4. Open: http://localhost:3000" -ForegroundColor White
