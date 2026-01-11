// =============================================================================
// Breadth Extremes Analysis
// =============================================================================

import type { BreadthSeries, BreadthEntry } from './compute'

// =============================================================================
// Types
// =============================================================================

export interface PeakResult {
  date: string
  value: number
  count: number
  countValid: number
  symbols: string[]
}

export interface WindowResult {
  windowStart: string
  windowEnd: string
  peakDate: string
  peakValue: number
  avgValue: number
  windowDays: number
  tradingDays: number
}

export interface BreadthExtremes {
  peak: PeakResult
  window: WindowResult
  series: BreadthEntry[]
}

// =============================================================================
// Find Peak Day
// =============================================================================

/**
 * Find the day with the highest breadth value for a given metric.
 *
 * @param series - The breadth series to analyze
 * @param metric - Which metric to find the peak for ('new_lows' | 'new_highs')
 * @returns The peak result with date, value, and contributing symbols
 */
export function findPeakDay(
  series: BreadthSeries,
  metric: 'new_lows' | 'new_highs' = 'new_lows'
): PeakResult | null {
  if (series.entries.length === 0) return null

  let peakEntry: BreadthEntry | null = null
  let peakValue = -Infinity

  for (const entry of series.entries) {
    const value = metric === 'new_lows' ? entry.pctNewLows : entry.pctNewHighs

    if (value > peakValue) {
      peakValue = value
      peakEntry = entry
    }
  }

  if (!peakEntry) return null

  return {
    date: peakEntry.date,
    value: peakValue,
    count: metric === 'new_lows' ? peakEntry.countNewLows : peakEntry.countNewHighs,
    countValid: peakEntry.countValid,
    symbols: metric === 'new_lows' ? peakEntry.newLowSymbols : peakEntry.newHighSymbols,
  }
}

// =============================================================================
// Find Window Around Peak
// =============================================================================

/**
 * Calculate a window of trading days centered around the peak day.
 * This helps identify the "worst stretch" for breadth.
 *
 * @param series - The breadth series
 * @param metric - Which metric to use
 * @param windowDays - Number of trading days for the window (default: 100)
 * @returns The window result with start/end dates and statistics
 */
export function findWindowAroundPeak(
  series: BreadthSeries,
  metric: 'new_lows' | 'new_highs' = 'new_lows',
  windowDays: number = 100
): WindowResult | null {
  const peak = findPeakDay(series, metric)
  if (!peak) return null

  // Find the peak index
  const peakIndex = series.entries.findIndex(e => e.date === peak.date)
  if (peakIndex === -1) return null

  // Calculate window centered on peak (or as close as possible)
  const halfWindow = Math.floor(windowDays / 2)
  let startIndex = Math.max(0, peakIndex - halfWindow)
  let endIndex = Math.min(series.entries.length - 1, peakIndex + halfWindow)

  // Adjust if we hit boundaries
  if (startIndex === 0) {
    endIndex = Math.min(series.entries.length - 1, windowDays - 1)
  }
  if (endIndex === series.entries.length - 1) {
    startIndex = Math.max(0, series.entries.length - windowDays)
  }

  const windowEntries = series.entries.slice(startIndex, endIndex + 1)

  // Calculate average value in window
  const sum = windowEntries.reduce((acc, e) => {
    return acc + (metric === 'new_lows' ? e.pctNewLows : e.pctNewHighs)
  }, 0)
  const avgValue = windowEntries.length > 0 ? sum / windowEntries.length : 0

  return {
    windowStart: series.entries[startIndex].date,
    windowEnd: series.entries[endIndex].date,
    peakDate: peak.date,
    peakValue: peak.value,
    avgValue,
    windowDays,
    tradingDays: windowEntries.length,
  }
}

// =============================================================================
// Find Multiple Peaks (for pattern detection)
// =============================================================================

/**
 * Find the top N peak days for a metric.
 *
 * @param series - The breadth series
 * @param metric - Which metric to analyze
 * @param topN - Number of peaks to find (default: 5)
 * @returns Array of peak results sorted by value descending
 */
export function findTopPeaks(
  series: BreadthSeries,
  metric: 'new_lows' | 'new_highs' = 'new_lows',
  topN: number = 5
): PeakResult[] {
  const peaks: PeakResult[] = series.entries.map(entry => ({
    date: entry.date,
    value: metric === 'new_lows' ? entry.pctNewLows : entry.pctNewHighs,
    count: metric === 'new_lows' ? entry.countNewLows : entry.countNewHighs,
    countValid: entry.countValid,
    symbols: metric === 'new_lows' ? entry.newLowSymbols : entry.newHighSymbols,
  }))

  // Sort by value descending
  peaks.sort((a, b) => b.value - a.value)

  return peaks.slice(0, topN)
}

// =============================================================================
// Analyze "Washed Out" Condition
// =============================================================================

export interface WashedOutAnalysis {
  isWashedOut: boolean
  threshold: number
  currentValue: number
  daysAboveThreshold: number
  peakValue: number
  peakDate: string
}

/**
 * Determine if breadth is "washed out" (many new lows indicating oversold).
 *
 * @param series - The breadth series
 * @param threshold - Percentage threshold to consider washed out (default: 20%)
 * @returns Analysis of washed out condition
 */
export function analyzeWashedOut(
  series: BreadthSeries,
  threshold: number = 20
): WashedOutAnalysis {
  if (series.entries.length === 0) {
    return {
      isWashedOut: false,
      threshold,
      currentValue: 0,
      daysAboveThreshold: 0,
      peakValue: 0,
      peakDate: '',
    }
  }

  const peak = findPeakDay(series, 'new_lows')
  const latestEntry = series.entries[series.entries.length - 1]
  const currentValue = latestEntry?.pctNewLows || 0

  // Count days above threshold
  const daysAboveThreshold = series.entries.filter(
    e => e.pctNewLows >= threshold
  ).length

  return {
    isWashedOut: currentValue >= threshold,
    threshold,
    currentValue,
    daysAboveThreshold,
    peakValue: peak?.value || 0,
    peakDate: peak?.date || '',
  }
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Perform complete breadth extremes analysis.
 *
 * @param series - The breadth series to analyze
 * @param metric - Which metric to analyze
 * @param windowDays - Window size around peak
 * @returns Complete extremes analysis
 */
export function analyzeBreadthExtremes(
  series: BreadthSeries,
  metric: 'new_lows' | 'new_highs' = 'new_lows',
  windowDays: number = 100
): BreadthExtremes | null {
  const peak = findPeakDay(series, metric)
  if (!peak) return null

  const window = findWindowAroundPeak(series, metric, windowDays)
  if (!window) return null

  return {
    peak,
    window,
    series: series.entries,
  }
}
