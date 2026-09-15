import Link from 'next/link'
import { Home } from 'lucide-react'

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Link
        href="/"
        aria-label="Back to Today"
        className="fixed bottom-4 left-4 z-[70] inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition-transform hover:-translate-y-0.5 hover:bg-muted sm:bottom-5 sm:left-5"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Today</span>
      </Link>
    </>
  )
}
