import { describe, expect, it } from 'vitest'
import { compareNhnlParity, reconstructNhnlCount } from './nhnl-research'
import type { STDailyBar } from './types'

function bar(date: string, high: number, low: number, close = (high + low) / 2): STDailyBar {
  return { date, open: close, high, low, close }
}

describe('NHNL research parity harness', () => {
  it('counts inclusive rolling intraday highs and lows', () => {
    const histories = {
      AAA: [bar('2024-01-01', 10, 8), bar('2024-01-02', 12, 9), bar('2024-01-03', 13, 10)],
      BBB: [bar('2024-01-01', 20, 18), bar('2024-01-02', 19, 17), bar('2024-01-03', 18, 16)],
      CCC: [bar('2024-01-01', 30, 28), bar('2024-01-02', 29, 27), bar('2024-01-03', 29.5, 27.5)],
    }

    expect(reconstructNhnlCount(histories, '2024-01-03', { lookback: 3 })).toEqual({
      date: '2024-01-03',
      newHighs: 1,
      newLows: 1,
    })
  })

  it('supports a minimum-history candidate rule without changing the live model', () => {
    const histories = {
      AAA: [bar('2024-01-01', 10, 8), bar('2024-01-02', 12, 9)],
      BBB: [bar('2024-01-02', 5, 4)],
    }

    expect(reconstructNhnlCount(histories, '2024-01-02', { lookback: 252, minObservations: 2 })).toEqual({
      date: '2024-01-02',
      newHighs: 1,
      newLows: 0,
    })
  })

  it('requires exact high and low counts for parity promotion', () => {
    const expected = [
      { date: '2024-02-14', newHighs: 114, newLows: 80 },
      { date: '2024-02-15', newHighs: 230, newLows: 64 },
    ]

    const comparison = compareNhnlParity(expected, [
      { date: '2024-02-14', newHighs: 114, newLows: 80 },
      { date: '2024-02-15', newHighs: 229, newLows: 64 },
    ])

    expect(comparison.exactMatches).toBe(1)
    expect(comparison.total).toBe(2)
    expect(comparison.allExact).toBe(false)
    expect(comparison.rows[1].highDelta).toBe(-1)
  })
})
