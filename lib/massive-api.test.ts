import { describe, it, expect } from 'vitest'
import { computeHeatmap, computeEnhancedMetrics, type DailyBar } from './massive-api'

/**
 * Synthetic dataset for testing rolling window calculations
 *
 * Creates bars with predictable patterns:
 * - Bars are in chronological order (oldest first)
 * - Close prices form a simple pattern for easy verification
 * - High prices are always close + 1 for predictable intraday basis
 */
function createSyntheticBars(count: number): DailyBar[] {
  const bars: DailyBar[] = []
  const baseDate = new Date('2024-01-01')

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + i)

    // Pattern: prices rise for 5 days, then drop, creating predictable highs
    const cycle = i % 10
    const close = 100 + (cycle < 5 ? cycle * 2 : (9 - cycle) * 2)

    bars.push({
      date: date.toISOString().split('T')[0],
      open: close - 0.5,
      high: close + 1, // Intraday high is always close + 1
      low: close - 1,
      close,
      volume: 1000000 + i * 1000,
    })
  }

  return bars
}

/**
 * Creates bars with a single peak at a specific index
 */
function createBarsWithPeak(count: number, peakIndex: number, peakValue: number = 150): DailyBar[] {
  const bars: DailyBar[] = []
  const baseDate = new Date('2024-01-01')

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + i)

    const close = i === peakIndex ? peakValue : 100

    bars.push({
      date: date.toISOString().split('T')[0],
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000000,
    })
  }

  return bars
}

describe('computeHeatmap', () => {
  it('returns array of same length as input', () => {
    const bars = createSyntheticBars(30)
    const result = computeHeatmap(bars, 10, 'close')
    expect(result).toHaveLength(30)
  })

  it('returns lookback-filled array when bars < lookback', () => {
    const bars = createSyntheticBars(5)
    const result = computeHeatmap(bars, 10, 'close')
    expect(result).toHaveLength(5)
    expect(result.every(v => v === 10)).toBe(true)
  })

  it('returns 0 when current bar is at the rolling high (close basis)', () => {
    // Create bars where the last bar is at an all-time high
    const bars = createBarsWithPeak(20, 19) // Peak at the end
    const result = computeHeatmap(bars, 10, 'close')
    expect(result[19]).toBe(0) // Last bar should be 0 days since high
  })

  it('correctly counts days since rolling high', () => {
    // Peak at index 10, bars 11-19 are flat at 100
    const bars = createBarsWithPeak(20, 10)
    const result = computeHeatmap(bars, 10, 'close')

    // At index 19, peak was at index 10, so 9 days since high
    expect(result[19]).toBe(9)

    // At index 15, peak was at index 10, so 5 days since high
    expect(result[15]).toBe(5)

    // At index 10, we're at the peak, so 0 days
    expect(result[10]).toBe(0)
  })

  it('uses high prices when basis is intraday', () => {
    const bars: DailyBar[] = [
      { date: '2024-01-01', open: 100, high: 110, low: 95, close: 100, volume: 1000 },
      { date: '2024-01-02', open: 100, high: 105, low: 95, close: 100, volume: 1000 },
      { date: '2024-01-03', open: 100, high: 102, low: 95, close: 100, volume: 1000 },
    ]

    const closeResult = computeHeatmap(bars, 3, 'close')
    const intradayResult = computeHeatmap(bars, 3, 'intraday')

    // All closes are same (100), so close basis should show 0 for all
    expect(closeResult).toEqual([0, 0, 0])

    // Intraday: first bar has highest high (110), subsequent bars are below
    // Day 0 (index 0): high 110 is the max, 0 days since
    // Day 1 (index 1): high 105 < 110, 1 day since
    // Day 2 (index 2): high 102 < 110, 2 days since
    expect(intradayResult).toEqual([0, 1, 2])
  })

  it('respects lookback window (ignores old peaks)', () => {
    // Create 20 bars with a peak at index 5
    const bars = createBarsWithPeak(20, 5)

    // With lookback of 5, the peak at index 5 should be forgotten after 5 bars
    const result = computeHeatmap(bars, 5, 'close')

    // At index 10, the peak at 5 is outside the 5-day window
    // So index 10 should be 0 (it's its own high in the window)
    expect(result[10]).toBe(0)
  })
})

describe('computeEnhancedMetrics', () => {
  it('returns array of same length as input', () => {
    const bars = createSyntheticBars(30)
    const result = computeEnhancedMetrics(bars, 10, 'close')
    expect(result).toHaveLength(30)
  })

  it('returns metrics with expected properties', () => {
    const bars = createSyntheticBars(30)
    const result = computeEnhancedMetrics(bars, 10, 'close')

    expect(result[0]).toHaveProperty('daysSinceHigh')
    expect(result[0]).toHaveProperty('pctFromHigh')
    expect(result[0]).toHaveProperty('rollingHigh')
  })

  it('pctFromHigh reflects distance from rolling high', () => {
    // Note: rollingHigh is always computed from bar.high
    // When basis='close', currentValue is bar.close
    // pctFromHigh = ((rollingHigh - currentValue) / rollingHigh) * 100
    // daysSinceHigh counts backwards for a bar where close >= rollingHigh
    const bars = createBarsWithPeak(20, 19) // Peak at the end
    const result = computeEnhancedMetrics(bars, 10, 'close')

    // Peak bar: close=150, high=151, rollingHigh=151
    // pctFromHigh = ((151 - 150) / 151) * 100 = 0.66%
    expect(result[19].pctFromHigh).toBeCloseTo(0.66, 1)

    // daysSinceHigh looks for bar where close >= rollingHigh (151)
    // No bar has close >= 151, so it counts all the way back in the window
    expect(result[19].daysSinceHigh).toBe(9) // lookback-1 days since no bar reached the high
  })

  it('pctFromHigh calculates correct percentage', () => {
    // Note: rollingHigh is computed from bar.high, not bar.close
    // pctFromHigh = ((rollingHigh - currentValue) / rollingHigh) * 100
    // When basis='close', currentValue = bar.close
    // Use lookback=3 to avoid early return (bars.length must be >= lookback)
    const bars: DailyBar[] = [
      { date: '2024-01-01', open: 100, high: 110, low: 90, close: 100, volume: 1000 },
      { date: '2024-01-02', open: 100, high: 105, low: 90, close: 95, volume: 1000 },
      { date: '2024-01-03', open: 95, high: 100, low: 85, close: 90, volume: 1000 },
    ]

    const result = computeEnhancedMetrics(bars, 3, 'close')

    // Day 0: rollingHigh=110, close=100, pctFromHigh = (110-100)/110 * 100 = 9.09%
    expect(result[0].pctFromHigh).toBeCloseTo(9.09, 1)

    // Day 1: rollingHigh=110, close=95, pctFromHigh = (110-95)/110 * 100 = 13.64%
    expect(result[1].pctFromHigh).toBeCloseTo(13.64, 1)

    // Day 2: rollingHigh=110, close=90, pctFromHigh = (110-90)/110 * 100 = 18.18%
    expect(result[2].pctFromHigh).toBeCloseTo(18.18, 1)
  })

  it('rollingHigh tracks the maximum in the window', () => {
    // Note: createBarsWithPeak creates bars where high = close + 1
    // Non-peak bars: close=100, high=101
    // Peak bar at index 10: close=150, high=151
    const bars = createBarsWithPeak(20, 10, 150)
    const result = computeEnhancedMetrics(bars, 5, 'close')

    // Before the peak (index 9), rolling high should be 101 (high of non-peak bar)
    expect(result[9].rollingHigh).toBe(101)

    // At the peak (index 10), rolling high should be 151 (peak bar's high)
    expect(result[10].rollingHigh).toBe(151)

    // After the peak but still in window (index 14), rolling high should still be 151
    expect(result[14].rollingHigh).toBe(151)

    // After peak leaves window (index 16), rolling high should be back to 101
    expect(result[16].rollingHigh).toBe(101)
  })
})

describe('Rolling window edge cases', () => {
  it('handles single bar', () => {
    const bars: DailyBar[] = [
      { date: '2024-01-01', open: 100, high: 105, low: 95, close: 100, volume: 1000 },
    ]

    const heatmap = computeHeatmap(bars, 10, 'close')
    expect(heatmap).toHaveLength(1)
    expect(heatmap[0]).toBe(10) // Returns lookback when insufficient data

    const metrics = computeEnhancedMetrics(bars, 10, 'close')
    expect(metrics).toHaveLength(1)
  })

  it('handles lookback equal to bar count', () => {
    const bars = createSyntheticBars(10)
    const result = computeHeatmap(bars, 10, 'close')
    expect(result).toHaveLength(10)
    // First bar won't have full lookback, but function should still work
  })

  it('handles all identical prices', () => {
    const bars: DailyBar[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1000,
    }))

    const result = computeHeatmap(bars, 5, 'close')
    // All prices equal means every bar is "at the high"
    expect(result.slice(4)).toEqual([0, 0, 0, 0, 0, 0])
  })
})
