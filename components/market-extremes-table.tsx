'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { DailyBar } from '@/lib/massive-api'
import { getHeatStyle } from '@/lib/heat/colors'
import { HeatLegend } from './heat-legend'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface MarketExtremesTableProps {
  rawBars: Record<string, DailyBar[]>
  lookback?: number
}

interface ExtremesData {
  symbol: string
  daysSinceHighBasis: number
  daysSinceCloseBasis: number
  highValue: number
  closeValue: number
  rollingHighBasis: number
  rollingCloseBasis: number
}

// Symbol display mapping
const SYMBOL_DISPLAY: Record<string, string> = {
  DJI: 'Dow30',
  SPX: 'SP500',
  IXIC: 'Nasdaq',
  NDX: 'NDX100',
  RUT: 'Russ2K',
  SOX: 'Semis',
  VIX: 'VIX',
  NYA: 'NYSE',
}

// -----------------------------------------------------------------------------
// Calculation Logic
// -----------------------------------------------------------------------------

function calculateDaysSinceHigh(bars: DailyBar[], lookback: number, basis: 'high' | 'close'): number {
  if (bars.length < 2) return lookback

  // Get the most recent lookback bars
  const recentBars = bars.slice(-lookback)
  if (recentBars.length === 0) return lookback

  // Find rolling high based on basis
  const values = recentBars.map((b) => (basis === 'high' ? b.high : b.close))
  const rollingHigh = Math.max(...values)
  const currentValue = values[values.length - 1]

  // If at new high, return 0
  if (currentValue >= rollingHigh * 0.9999) return 0

  // Count days since high
  let daysSince = 0
  for (let i = values.length - 2; i >= 0; i--) {
    daysSince++
    if (values[i] >= rollingHigh * 0.9999) break
  }

  return Math.min(daysSince, lookback)
}

function calculateExtremesData(
  rawBars: Record<string, DailyBar[]>,
  lookback: number
): ExtremesData[] {
  const symbols = Object.keys(rawBars)

  return symbols.map((symbol) => {
    const bars = rawBars[symbol] || []
    const recentBars = bars.slice(-lookback)

    const daysSinceHighBasis = calculateDaysSinceHigh(bars, lookback, 'high')
    const daysSinceCloseBasis = calculateDaysSinceHigh(bars, lookback, 'close')

    const latestBar = bars[bars.length - 1]
    const highValues = recentBars.map((b) => b.high)
    const closeValues = recentBars.map((b) => b.close)

    return {
      symbol,
      daysSinceHighBasis,
      daysSinceCloseBasis,
      highValue: latestBar?.high ?? 0,
      closeValue: latestBar?.close ?? 0,
      rollingHighBasis: highValues.length > 0 ? Math.max(...highValues) : 0,
      rollingCloseBasis: closeValues.length > 0 ? Math.max(...closeValues) : 0,
    }
  })
}

// -----------------------------------------------------------------------------
// Heatmap Styling (using shared color system)
// -----------------------------------------------------------------------------

function getCellHeatStyle(days: number, lookback: number) {
  return getHeatStyle({ metric: 'daysSinceHigh', value: days, lookback })
}

// -----------------------------------------------------------------------------
// Live Pulse Indicator
// -----------------------------------------------------------------------------

function LivePulse() {
  return (
    <div className="relative flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-wider">Live</span>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export function MarketExtremesTable({ rawBars, lookback = 63 }: MarketExtremesTableProps) {
  const extremesData = useMemo(
    () => calculateExtremesData(rawBars, lookback),
    [rawBars, lookback]
  )

  if (extremesData.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No data available
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded border border-border">
      {/* Live Indicator */}
      <div className="absolute top-2 right-2 z-10">
        <LivePulse />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {/* Grouped Headers */}
          <thead>
            {/* Row 1: Group Headers */}
            <tr className="bg-muted/80">
              <th
                className="border-b border-r border-border px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground"
                rowSpan={2}
              >
                Metric
              </th>
              <th
                className="border-b border-r border-border px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-amber-600"
                colSpan={extremesData.length}
              >
                Based on HIGH Prices
              </th>
              <th
                className="border-b border-border px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-blue-600"
                colSpan={extremesData.length}
              >
                Based on CLOSE Prices
              </th>
            </tr>

            {/* Row 2: Symbol Headers */}
            <tr className="bg-muted/50">
              {/* HIGH Prices Symbols */}
              {extremesData.map((data, idx) => (
                <th
                  key={`high-${data.symbol}`}
                  className={cn(
                    'border-b border-border px-3 py-2 text-center text-xs font-semibold',
                    idx === extremesData.length - 1 ? 'border-r' : ''
                  )}
                >
                  <span className="text-foreground">
                    {SYMBOL_DISPLAY[data.symbol] || data.symbol}
                  </span>
                </th>
              ))}
              {/* CLOSE Prices Symbols */}
              {extremesData.map((data) => (
                <th
                  key={`close-${data.symbol}`}
                  className="border-b border-border px-3 py-2 text-center text-xs font-semibold"
                >
                  <span className="text-foreground">
                    {SYMBOL_DISPLAY[data.symbol] || data.symbol}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Days Since High Row */}
            <tr className="hover:bg-muted/30 transition-colors">
              <td className="border-r border-border px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                Days Since {lookback}d High
              </td>
              {/* HIGH Basis Values */}
              {extremesData.map((data, idx) => {
                const style = getCellHeatStyle(data.daysSinceHighBasis, lookback)
                return (
                  <td
                    key={`high-val-${data.symbol}`}
                    className={cn(
                      'px-3 py-3 text-center font-mono text-sm tabular-nums',
                      style.intensity > 0.5 ? 'font-semibold' : '',
                      idx === extremesData.length - 1 ? 'border-r border-border' : ''
                    )}
                    style={{
                      backgroundColor: style.bg,
                      color: style.fg,
                      transition: 'background-color 0.3s ease, color 0.3s ease',
                    }}
                  >
                    {data.daysSinceHighBasis}
                  </td>
                )
              })}
              {/* CLOSE Basis Values */}
              {extremesData.map((data) => {
                const style = getCellHeatStyle(data.daysSinceCloseBasis, lookback)
                return (
                  <td
                    key={`close-val-${data.symbol}`}
                    className={cn(
                      'px-3 py-3 text-center font-mono text-sm tabular-nums',
                      style.intensity > 0.5 ? 'font-semibold' : ''
                    )}
                    style={{
                      backgroundColor: style.bg,
                      color: style.fg,
                      transition: 'background-color 0.3s ease, color 0.3s ease',
                    }}
                  >
                    {data.daysSinceCloseBasis}
                  </td>
                )
              })}
            </tr>

            {/* Current Value Row */}
            <tr className="hover:bg-muted/30 transition-colors border-t border-border/50">
              <td className="border-r border-border px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                Current Value
              </td>
              {/* HIGH Values */}
              {extremesData.map((data, idx) => (
                <td
                  key={`curr-high-${data.symbol}`}
                  className={cn(
                    'px-3 py-2.5 text-center font-mono text-xs tabular-nums text-muted-foreground',
                    idx === extremesData.length - 1 ? 'border-r border-border' : ''
                  )}
                >
                  {data.highValue.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </td>
              ))}
              {/* CLOSE Values */}
              {extremesData.map((data) => (
                <td
                  key={`curr-close-${data.symbol}`}
                  className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {data.closeValue.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </td>
              ))}
            </tr>

            {/* Rolling High Row */}
            <tr className="hover:bg-muted/30 transition-colors border-t border-border/50">
              <td className="border-r border-border px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                {lookback}d Rolling High
              </td>
              {/* HIGH Rolling */}
              {extremesData.map((data, idx) => (
                <td
                  key={`roll-high-${data.symbol}`}
                  className={cn(
                    'px-3 py-2.5 text-center font-mono text-xs tabular-nums text-emerald-600/80',
                    idx === extremesData.length - 1 ? 'border-r border-border' : ''
                  )}
                >
                  {data.rollingHighBasis.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </td>
              ))}
              {/* CLOSE Rolling */}
              {extremesData.map((data) => (
                <td
                  key={`roll-close-${data.symbol}`}
                  className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-emerald-600/80"
                >
                  {data.rollingCloseBasis.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </td>
              ))}
            </tr>

            {/* % From High Row */}
            <tr className="hover:bg-muted/30 transition-colors border-t border-border/50">
              <td className="border-r border-border px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                % From High
              </td>
              {/* HIGH % */}
              {extremesData.map((data, idx) => {
                const pct =
                  data.rollingHighBasis > 0
                    ? ((data.rollingHighBasis - data.highValue) / data.rollingHighBasis) * 100
                    : 0
                return (
                  <td
                    key={`pct-high-${data.symbol}`}
                    className={cn(
                      'px-3 py-2.5 text-center font-mono text-xs tabular-nums',
                      pct <= 1 ? 'text-emerald-500' : pct >= 5 ? 'text-red-500' : 'text-muted-foreground',
                      idx === extremesData.length - 1 ? 'border-r border-border' : ''
                    )}
                  >
                    {pct.toFixed(2)}%
                  </td>
                )
              })}
              {/* CLOSE % */}
              {extremesData.map((data) => {
                const pct =
                  data.rollingCloseBasis > 0
                    ? ((data.rollingCloseBasis - data.closeValue) / data.rollingCloseBasis) * 100
                    : 0
                return (
                  <td
                    key={`pct-close-${data.symbol}`}
                    className={cn(
                      'px-3 py-2.5 text-center font-mono text-xs tabular-nums',
                      pct <= 1 ? 'text-emerald-500' : pct >= 5 ? 'text-red-500' : 'text-muted-foreground'
                    )}
                  >
                    {pct.toFixed(2)}%
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <HeatLegend metricType="high" />
    </div>
  )
}
