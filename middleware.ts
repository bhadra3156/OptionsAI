// FILE: middleware.ts  ← ROOT of project (same level as package.json)
// Protects all routes — redirects to /sign-in if not logged in.
// Public routes (landing, sign-in, sign-up, telegram webhook, cron) are
// explicitly exempted.
//
// PHASE D UPDATE: added /api/telegram/webhook and /api/cron/* to the public
// list. Both endpoints authenticate via their own secret tokens, not Clerk.
// Without these exemptions, Telegram and Vercel Cron would be redirected to
// /sign-in and the integrations would fail silently.

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/telegram/webhook(.*)',     // Telegram POSTs here, no Clerk session
  '/api/cron/(.*)',                // Vercel Cron hits here, no Clerk session
])

export default clerkMiddleware((auth, request) => {
  if (!isPublicRoute(request)) {
    auth().protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
