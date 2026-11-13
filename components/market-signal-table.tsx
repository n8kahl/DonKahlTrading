'use client'

import type {
  MarketSignalConfig,
  MarketSignalIndexConfig,
  MarketSignalRow,
  MarketSignalValue,
} from '@/lib/market-signal'
import { cn } from '@/lib/utils'

// Fill colours are the workbook's own conditional-format colours.
export const SIGNAL_CLASS: Record<MarketSignalValue, string> = {
  RECOVERY: 'bg-[#15803D] text-white font-bold',
  WARNING: 'bg-[#B91C1C] text-white font-bold',
  WATCH: 'bg-[#D97706] text-white font-bold',
}
const UP_MOVE_CLASS = 'bg-[#16A34A] text-white'
const DOWN_MOVE_CLASS = 'bg-[#DC2626] text-white'
export const BELOW_HIGH_CLASS = 'bg-[#15803D] text-white font-bold'
const NET_POSITIVE_CLASS = 'bg-[#C6EFCE] text-[#006100]'
const NET_NEW_CLASS = 'bg-[#FFFF00] text-black'
// Not a workbook colour: marks a confirmed trough date.
export const TROUGH_DATE_CLASS = 'bg-amber-200 text-black'

const closeFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatClose(value: number | null | undefined): string {
  return value == null ? '' : closeFormat.format(value)
}

export function formatRoc(value: number | null | undefined): string {
  return value == null ? '' : `${(value * 100).toFixed(2)}%`
}

export function rocClass(roc: number | null | undefined, threshold: number): string {
  if (roc == null) return ''
  if (roc >= threshold) return UP_MOVE_CLASS
  if (roc <= -threshold) return DOWN_MOVE_CLASS
  return ''
}

export function formatNet(value: number | null | undefined): string {
  if (value == null) return ''
  return value > 0 ? `+${value}` : String(value)
}

export function netClass(net: number | null | undefined, previousNet?: number | null): string {
  if (net == null || net === 0) return ''
  if (net < 0) return DOWN_MOVE_CLASS
  // Yellow marks the day the net count turns positive from zero, as in the workbook.
  if (previousNet === 0) return NET_NEW_CLASS
  return NET_POSITIVE_CLASS
}

const cell = 'h-8 border-r border-border/40 px-2 text-right text-xs tabular-nums whitespace-nowrap'
const groupHead = 'border-l border-border px-2 py-1 text-center text-xs font-semibold'
const subHead = 'px-2 py-1 text-xs font-medium whitespace-nowrap'

export function MarketSignalTable({
  rows,
  indexes,
  config,
  hasLeadingContextRow = false,
}: {
  /** Ascending by date. */
  rows: MarketSignalRow[]
  indexes: MarketSignalIndexConfig[]
  config: MarketSignalConfig
  /** When true, the first row is only the previous trading day for the first displayed row and is not rendered. */
  hasLeadingContextRow?: boolean
}) {
  const windowDays = config.windowTradingDays
  const thresholdLabel = `${(config.moveThreshold * 100).toFixed(1)}%`
  const belowLabel = `${Math.round(config.belowHighDepth * 100)}%`
  const swingLabel = `${Math.round(config.troughSwing * 100)}%`
  const labelOf = (key: string) => indexes.find((index) => index.key === key)?.label ?? key
  // Newest first; each row keeps a reference to the previous trading row for the yellow highlight.
  const display = rows
    .map((row, index) => ({ row, previous: rows[index - 1] }))
    .slice(hasLeadingContextRow ? 1 : 0)
    .reverse()

  return (
    <div className="max-h-[70vh] overflow-auto rounded-md border border-border bg-card">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20 bg-card">
          <tr className="border-b border-border">
            <th rowSpan={2} className="sticky left-0 z-30 min-w-24 bg-card px-3 py-2 text-left text-xs font-semibold">Date</th>
            <th rowSpan={2} className={cn(groupHead, 'min-w-24')}>Signal</th>
            {indexes.map((index) => (
              <th key={index.key} colSpan={2} className={groupHead} title={`${index.name} (${index.providerSymbol})`}>{index.label}</th>
            ))}
            <th colSpan={indexes.length} className={groupHead} title={`Days up ${thresholdLabel} or more minus days down ${thresholdLabel} or more, over the last ${windowDays} trading days`}>
              {windowDays}d net
            </th>
            <th colSpan={indexes.length} className={groupHead} title={`Trading days since the highest close since ${config.peakStartDate}`}>Days since high</th>
            <th colSpan={indexes.length} className={groupHead} title={`Close ${belowLabel} or more below the highest close since ${config.peakStartDate}`}>{belowLabel} below high</th>
            <th colSpan={indexes.length} className={groupHead} title={`Days up ${thresholdLabel} or more in the last ${windowDays} trading days, before netting against down days (for reference)`}>
              {windowDays}d +{thresholdLabel} days
            </th>
          </tr>
          <tr className="border-b border-border bg-muted/40">
            {indexes.flatMap((index) => [
              <th key={`${index.key}-close`} className={cn(subHead, 'border-l border-border')}>Close</th>,
              <th key={`${index.key}-roc`} className={subHead}>ROC</th>,
            ])}
            {['net', 'high', 'below', 'up'].flatMap((group) => indexes.map((index, position) => (
              <th key={`${group}-${index.key}`} className={cn(subHead, position === 0 && 'border-l border-border')}>{index.label}</th>
            )))}
          </tr>
        </thead>
        <tbody>
          {display.map(({ row, previous }) => {
            const troughLabels = config.troughIndexes.filter((key) => row.indexes[key]?.troughDate).map(labelOf)
            return (
            <tr key={row.date} className="border-b border-border/50 hover:bg-muted/30">
              <td
                className={cn('sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 text-xs font-medium tabular-nums', troughLabels.length ? TROUGH_DATE_CLASS : 'bg-card')}
                title={troughLabels.length ? `${troughLabels.join(', ')} trough: lowest close of a ${swingLabel} decline, confirmed later by a ${swingLabel} rebound` : undefined}
                data-trough={troughLabels.length ? 'true' : undefined}
              >
                {row.date}
              </td>
              <td className={cn(cell, 'text-center', row.signal && SIGNAL_CLASS[row.signal])} data-signal={row.signal ?? ''}>{row.signal ?? ''}</td>
              {indexes.flatMap((index) => {
                const point = row.indexes[index.key]
                return [
                  <td key={`${index.key}-close`} className={cell}>{formatClose(point?.close)}</td>,
                  <td key={`${index.key}-roc`} className={cn(cell, rocClass(point?.roc, config.moveThreshold))}>{formatRoc(point?.roc)}</td>,
                ]
              })}
              {indexes.map((index) => {
                const point = row.indexes[index.key]
                return (
                  <td key={`${index.key}-net`} className={cn(cell, 'text-center', netClass(point?.netMoves10d, previous?.indexes[index.key]?.netMoves10d))}>
                    {formatNet(point?.netMoves10d)}
                  </td>
                )
              })}
              {indexes.map((index) => (
                <td key={`${index.key}-high`} className={cn(cell, 'text-center')}>{row.indexes[index.key]?.daysSinceHigh ?? ''}</td>
              ))}
              {indexes.map((index) => {
                const below = row.indexes[index.key]?.belowHigh
                return <td key={`${index.key}-below`} className={cn(cell, 'text-center', below && BELOW_HIGH_CLASS)}>{below ? 'BELOW' : ''}</td>
              })}
              {indexes.map((index) => (
                <td key={`${index.key}-up`} className={cn(cell, 'text-center text-muted-foreground')}>{row.indexes[index.key]?.upDays10d ?? ''}</td>
              ))}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
