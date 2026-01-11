'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, Pin, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CardProps, MarketDashboardData, PinConfig } from './types'

interface ComparisonChartProps extends CardProps {
  data: MarketDashboardData
}

export function ComparisonChart({ data, onPin, className }: ComparisonChartProps) {
  const handlePin = () => {
    if (!onPin) return
    const config: PinConfig = {
      type: 'market_dashboard',
      title: `${data.lookback}d Comparison`,
      config: { lookback: data.lookback, symbols: data.symbols.map((s) => s.symbol) },
      pinnedAt: new Date().toISOString(),
    }
    onPin(config)
  }

  // Sort by days since high (most extended first)
  const sorted = [...data.symbols].sort((a, b) => {
    const aVal = a.daysSinceHigh ?? 999
    const bVal = b.daysSinceHigh ?? 999
    return bVal - aVal
  })

  return (
    <div
      className={cn(
        'rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-white">{data.lookback}d Rolling Extremes</span>
        </div>
        {onPin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePin}
            className="h-6 w-6 p-0 text-white/50 hover:text-white hover:bg-white/10"
          >
            <Pin className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/50 border-b border-white/5">
              <th className="text-left px-3 py-2 font-medium">Symbol</th>
              <th className="text-right px-3 py-2 font-medium">Close</th>
              <th className="text-right px-3 py-2 font-medium">Days High</th>
              <th className="text-right px-3 py-2 font-medium">% From High</th>
              <th className="text-right px-3 py-2 font-medium">Days Low</th>
              <th className="text-right px-3 py-2 font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const signal = getSignal(item.daysSinceHigh, item.pctFromHigh)
              return (
                <tr
                  key={item.symbol}
                  className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                >
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold text-white">{item.symbol}</span>
                  </td>
                  <td className="text-right px-3 py-2 font-mono text-white/80">
                    {item.close?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '—'}
                  </td>
                  <td className="text-right px-3 py-2">
                    <DaysBadge days={item.daysSinceHigh} lookback={data.lookback} />
                  </td>
                  <td className="text-right px-3 py-2">
                    <PctBadge pct={item.pctFromHigh} />
                  </td>
                  <td className="text-right px-3 py-2 font-mono text-white/60">
                    {item.daysSinceLow ?? '—'}
                  </td>
                  <td className="text-right px-3 py-2">
                    <SignalBadge signal={signal} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-white/5 bg-white/5">
        <p className="text-[10px] text-white/40 font-mono">
          {sorted.length} symbols | Sorted by extension from {data.lookback}d high
        </p>
      </div>
    </div>
  )
}

function DaysBadge({ days, lookback }: { days: number | null; lookback: number }) {
  if (days === null) return <span className="text-white/30">—</span>

  const intensity = Math.min(days / lookback, 1)
  const bgColor =
    intensity < 0.1
      ? 'bg-emerald-500/20 text-emerald-400'
      : intensity < 0.3
        ? 'bg-yellow-500/20 text-yellow-400'
        : intensity < 0.6
          ? 'bg-orange-500/20 text-orange-400'
          : 'bg-red-500/20 text-red-400'

  return (
    <span className={cn('px-1.5 py-0.5 rounded font-mono text-[10px]', bgColor)}>
      {days}d
    </span>
  )
}

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-white/30">—</span>

  const isNear = pct < 2
  const isFar = pct > 10

  return (
    <span
      className={cn(
        'font-mono',
        isNear ? 'text-emerald-400' : isFar ? 'text-red-400' : 'text-white/80'
      )}
    >
      -{pct.toFixed(1)}%
    </span>
  )
}

function getSignal(
  daysSinceHigh: number | null,
  pctFromHigh: number | null
): 'bullish' | 'bearish' | 'neutral' {
  if (daysSinceHigh === null || pctFromHigh === null) return 'neutral'
  if (daysSinceHigh <= 3 && pctFromHigh < 2) return 'bullish'
  if (daysSinceHigh >= 20 && pctFromHigh > 8) return 'bearish'
  return 'neutral'
}

function SignalBadge({ signal }: { signal: 'bullish' | 'bearish' | 'neutral' }) {
  const config = {
    bullish: { icon: ArrowUpRight, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    bearish: { icon: ArrowDownRight, color: 'text-red-400', bg: 'bg-red-500/10' },
    neutral: { icon: Minus, color: 'text-white/40', bg: 'bg-white/5' },
  }

  const { icon: Icon, color, bg } = config[signal]

  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded', bg)}>
      <Icon className={cn('w-3 h-3', color)} />
    </span>
  )
}
