'use client'

import type {
  MarketSignalConfig,
  MarketSignalIndexConfig,
  MarketSignalIndexPoint,
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
const TROUGH_CLASS = 'bg-[#15803D] text-white font-bold'
const COUNT_ACTIVE_CLASS = 'bg-[#C6EFCE] text-[#006100]'
const COUNT_NEW_CLASS = 'bg-[#FFFF00] text-black'

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

function countClass(point: MarketSignalIndexPoint | null, previous: MarketSignalIndexPoint | null | undefined): string {
  const count = point?.bigMoves10d
  if (count == null || count < 1) return ''
  // Yellow marks the day the count first leaves zero, as in the workbook.
  if (previous?.bigMoves10d === 0) return COUNT_NEW_CLASS
  return COUNT_ACTIVE_CLASS
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
  const troughLabel = `${Math.round(config.troughDepth * 100)}%`
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
            <th colSpan={indexes.length} className={groupHead} title={`Days with a move of ${thresholdLabel} or more, up or down, in the last ${windowDays} trading days (workbook columns "10d net")`}>
              {windowDays}d moves ≥ {thresholdLabel}
            </th>
            <th colSpan={indexes.length} className={groupHead} title={`Trading days since the highest close since ${config.peakStartDate}`}>Days since high</th>
            <th colSpan={indexes.length} className={groupHead} title={`Close at least ${troughLabel} below the highest close since ${config.peakStartDate}`}>{troughLabel} trough</th>
            <th colSpan={indexes.length} className={groupHead} title={`Days up ${thresholdLabel} or more in the last ${windowDays} trading days`}>
              {windowDays}d +{thresholdLabel} days
            </th>
          </tr>
          <tr className="border-b border-border bg-muted/40">
            {indexes.flatMap((index) => [
              <th key={`${index.key}-close`} className={cn(subHead, 'border-l border-border')}>Close</th>,
              <th key={`${index.key}-roc`} className={subHead}>ROC</th>,
            ])}
            {['moves', 'high', 'trough', 'positive'].flatMap((group) => indexes.map((index, position) => (
              <th key={`${group}-${index.key}`} className={cn(subHead, position === 0 && 'border-l border-border')}>{index.label}</th>
            )))}
          </tr>
        </thead>
        <tbody>
          {display.map(({ row, previous }) => (
            <tr key={row.date} className="border-b border-border/50 hover:bg-muted/30">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 text-xs font-medium tabular-nums">{row.date}</td>
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
                  <td key={`${index.key}-moves`} className={cn(cell, 'text-center', countClass(point, previous?.indexes[index.key]))}>
                    {point?.bigMoves10d ?? ''}
                  </td>
                )
              })}
              {indexes.map((index) => (
                <td key={`${index.key}-high`} className={cn(cell, 'text-center')}>{row.indexes[index.key]?.daysSinceHigh ?? ''}</td>
              ))}
              {indexes.map((index) => {
                const trough = row.indexes[index.key]?.trough
                return <td key={`${index.key}-trough`} className={cn(cell, 'text-center', trough && TROUGH_CLASS)}>{trough ? 'TROUGH' : ''}</td>
              })}
              {indexes.map((index) => (
                <td key={`${index.key}-positive`} className={cn(cell, 'text-center')}>{row.indexes[index.key]?.positiveMoves10d ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
