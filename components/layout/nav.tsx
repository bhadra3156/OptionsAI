// FILE: components/layout/nav.tsx
// Shared navigation component used by ALL dashboard pages
// Update this ONE file to change nav across the entire app

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { TrendingUp } from 'lucide-react'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/market', label: 'Market' },
  { href: '/scan', label: 'Market Scan' },
  { href: '/trades', label: 'Trade Journal' },
  { href: '/strategies', label: 'Strategies' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="border-b border-border px-6 py-4 sticky top-0 bg-background/95 backdrop-blur z-10">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold tracking-tight">OptionsAI</span>
        </Link>
        <div className="flex items-center gap-5">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${
                pathname === link.href
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </nav>
  )
}