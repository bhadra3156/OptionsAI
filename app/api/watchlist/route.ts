// FILE: app/api/watchlist/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ tickers: data ?? [] })
  } catch (err) {
    console.error('GET /api/watchlist error:', err)
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { ticker } = await request.json() as { ticker: string }
    if (!ticker) return NextResponse.json({ error: 'Ticker required' }, { status: 400 })

    const t = ticker.toUpperCase().trim()

    // Check if already exists
    const { data: existing } = await supabaseAdmin
      .from('watchlist')
      .select('id')
      .eq('user_id', userId)
      .eq('ticker', t)
      .single()

    if (existing) {
      return NextResponse.json({ message: 'Already in watchlist' })
    }

    const { data, error } = await supabaseAdmin
      .from('watchlist')
      .insert({ user_id: userId, ticker: t })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ticker: data })
  } catch (err) {
    console.error('POST /api/watchlist error:', err)
    return NextResponse.json({ error: 'Failed to add ticker' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { ticker } = await request.json() as { ticker: string }
    const t = ticker.toUpperCase().trim()

    const { error } = await supabaseAdmin
      .from('watchlist')
      .delete()
      .eq('user_id', userId)
      .eq('ticker', t)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/watchlist error:', err)
    return NextResponse.json({ error: 'Failed to remove ticker' }, { status: 500 })
  }
}