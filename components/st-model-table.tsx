'use client'

import type { STModelResult, STSignalPoint } from '@/lib/st-model'
import { cn } from '@/lib/utils'

function signalClass(value: string) {
  if (value === 'EB') return 'bg-emerald-600 text-white font-bold'
  if (value === 'B') return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 font-semibold'
  return ''
}

function regimeClass(value: string) {
  if (value === 'Bull') return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
  if (value === 'Bear') return 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
  return 'text-muted-foreground'
}

function SignalCell({ point, field }: { point?: STSignalPoint; field: 'std' | 'alt' | 'bull' }) {
  const value = point?.[field] || ''
  const title = point
    ? `RSI ${point.rsi?.toFixed(1) ?? 'n/a'} | Fall ${point.pctFall == null ? 'n/a' : (point.pctFall * 100).toFixed(1) + '%'} | Rise ${point.pctRise == null ? 'n/a' : (point.pctRise * 100).toFixed(1) + '%'}`
    : ''
  return (
    <td title={title} className={cn('h-8 min-w-12 border-r border-border/40 px-2 text-center text-xs', signalClass(value))}>
      {value}
    </td>
  )
}

export function STModelTable({ model }: { model: STModelResult }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border">
            <th rowSpan={2} className="sticky left-0 z-20 min-w-28 bg-card px-3 py-2 text-left text-xs font-semibold">Date</th>
            {model.symbols.map((symbol) => (
              <th key={symbol} colSpan={3} className="border-l border-border px-2 py-1 text-center text-xs font-semibold">
                {symbol}
              </th>
            ))}
            <th colSpan={4} className="border-l border-border px-2 py-1 text-center text-xs font-semibold">Bear Catchers</th>
          </tr>
          <tr className="border-b border-border bg-muted/40">
            {model.symbols.flatMap((symbol) => [
              <th key={`${symbol}-std`} className="min-w-12 px-2 py-1 text-xs font-medium">Std</th>,
              <th key={`${symbol}-alt`} className="min-w-12 px-2 py-1 text-xs font-medium">Alt</th>,
              <th key={`${symbol}-bull`} className="min-w-12 px-2 py-1 text-xs font-medium">Bull</th>,
            ])}
            <th className="min-w-16 px-2 py-1 text-xs font-medium">SMA</th>
            <th className="min-w-16 px-2 py-1 text-xs font-medium">NH/NL</th>
            <th className="min-w-16 px-2 py-1 text-xs font-medium">DBE</th>
            <th className="min-w-24 px-2 py-1 text-xs font-medium">PY</th>
          </tr>
        </thead>
        <tbody>
          {model.dates.map((date) => {
            const datePoints = model.byDate[date] || {}
            const representative = datePoints.SOXL
            return (
              <tr key={date} className="border-b border-border/50 hover:bg-muted/30">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 text-xs font-medium">{date}</td>
                {model.symbols.flatMap((symbol) => {
                  const point = datePoints[symbol]
                  return [
                    <SignalCell key={`${date}-${symbol}-std`} point={point} field="std" />,
                    <SignalCell key={`${date}-${symbol}-alt`} point={point} field="alt" />,
                    <SignalCell key={`${date}-${symbol}-bull`} point={point} field="bull" />,
                  ]
                })}
                <td className={cn('px-2 text-center text-xs', regimeClass(representative?.regimes.sma || 'Unavailable'))}>{representative?.regimes.sma || '—'}</td>
                <td className={cn('px-2 text-center text-xs', regimeClass(representative?.regimes.nhnl || 'Unavailable'))}>{representative?.regimes.nhnl === 'Unavailable' ? '—' : representative?.regimes.nhnl}</td>
                <td className={cn('px-2 text-center text-xs', regimeClass(representative?.regimes.dbe || 'Unavailable'))}>{representative?.regimes.dbe || '—'}</td>
                <td className={cn('px-2 text-center text-xs', representative?.pyImpact === 'PY_Danger' && 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200')}>{representative?.pyImpact || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
