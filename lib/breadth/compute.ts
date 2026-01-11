// =============================================================================
// Breadth Computation Engine
// =============================================================================

import type { DailyBar } from '@/lib/massive-api'

// =============================================================================
// Types
// =============================================================================

export interface BreadthEntry {
  date: string
  pctNewLows: number
  pctNewHighs: number
  countNewLows: number
  countNewHighs: number
  countValid: number
  newLowSymbols: string[]
  newHighSymbols: string[]
}

export interface BreadthSeries {
  entries: BreadthEntry[]
  lookbackDays: number
  totalSymbols: number
  symbolsCovered: number
}

// =============================================================================
// Breadth Computation
// =============================================================================

/**
 * Compute a rolling breadth series from aligned bars.
 *
 * For each date t:
 * - isNewLow: close(t) <= min(close over lookback days ending at t)
 * - isNewHigh: close(t) >= max(close over lookback days ending at t)
 *
 * @param barsBySymbol - Object mapping symbol -> array of DailyBar (must be date-aligned)
 * @param dates - Array of dates in ascending order
 * @param lookbackDays - Number of trading days for rolling window (default: 100)
 */
export function computeBreadthSeries(
  barsBySymbol: Record<string, (DailyBar | null)[]>,
  dates: string[],
  lookbackDays: number = 100
): BreadthSeries {
  const symbols = Object.keys(barsBySymbol)
  const entries: BreadthEntry[] = []

  // We need at least lookbackDays of data before we can compute
  const startIndex = lookbackDays

  for (let i = startIndex; i < dates.length; i++) {
    const date = dates[i]
    let countNewLows = 0
    let countNewHighs = 0
    let countValid = 0
    const newLowSymbols: string[] = []
    const newHighSymbols: string[] = []

    for (const symbol of symbols) {
      const bars = barsBySymbol[symbol]
      const currentBar = bars[i]

      // Skip if no data for this date
      if (!currentBar) continue

      // Get lookback window closes
      const windowCloses: number[] = []
      for (let j = i - lookbackDays; j < i; j++) {
        const bar = bars[j]
        if (bar) {
          windowCloses.push(bar.close)
        }
      }

      // Need sufficient history for this symbol on this date
      if (windowCloses.length < lookbackDays * 0.5) continue

      countValid++

      const currentClose = currentBar.close
      const minClose = Math.min(...windowCloses)
      const maxClose = Math.max(...windowCloses)

      // New low: current close <= minimum of lookback window
      if (currentClose <= minClose) {
        countNewLows++
        newLowSymbols.push(symbol)
      }

      // New high: current close >= maximum of lookback window
      if (currentClose >= maxClose) {
        countNewHighs++
        newHighSymbols.push(symbol)
      }
    }

    // Calculate percentages
    const pctNewLows = countValid > 0 ? (countNewLows / countValid) * 100 : 0
    const pctNewHighs = countValid > 0 ? (countNewHighs / countValid) * 100 : 0

    entries.push({
      date,
      pctNewLows,
      pctNewHighs,
      countNewLows,
      countNewHighs,
      countValid,
      newLowSymbols,
      newHighSymbols,
    })
  }

  return {
    entries,
    lookbackDays,
    totalSymbols: symbols.length,
    symbolsCovered: symbols.length,
  }
}

// =============================================================================
// Simplified computation without alignment (for pre-aligned data)
// =============================================================================

export function computeBreadthFromAlignedBars(
  alignedBars: Record<string, (DailyBar | null)[]>,
  dates: string[],
  lookbackDays: number = 100
): BreadthSeries {
  return computeBreadthSeries(alignedBars, dates, lookbackDays)
}

// =============================================================================
// Utility: Get symbols at new lows/highs on a specific date
// =============================================================================

export function getSymbolsAtExtreme(
  series: BreadthSeries,
  date: string,
  metric: 'new_lows' | 'new_highs'
): string[] {
  const entry = series.entries.find(e => e.date === date)
  if (!entry) return []
  return metric === 'new_lows' ? entry.newLowSymbols : entry.newHighSymbols
}

// =============================================================================
// Utility: Get breadth on specific date
// =============================================================================

export function getBreadthOnDate(
  series: BreadthSeries,
  date: string
): BreadthEntry | null {
  return series.entries.find(e => e.date === date) || null
}

// =============================================================================
// Utility: Calculate average breadth over a period
// =============================================================================

export function calculateAverageBreadth(
  series: BreadthSeries,
  startDate: string,
  endDate: string,
  metric: 'new_lows' | 'new_highs'
): number {
  const filtered = series.entries.filter(
    e => e.date >= startDate && e.date <= endDate
  )

  if (filtered.length === 0) return 0

  const sum = filtered.reduce((acc, e) => {
    return acc + (metric === 'new_lows' ? e.pctNewLows : e.pctNewHighs)
  }, 0)

  return sum / filtered.length
}
