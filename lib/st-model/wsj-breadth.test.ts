import { describe, expect, it } from 'vitest'
import { parseWsjNasdaqBreadth, wsjTimestampToDate, WSJ_BREADTH_VARIANT } from './wsj-breadth'

function modernPayload() {
  return {
    data: {
      instrumentSets: [
        {
          headerFields: [{ label: 'NASDAQ', value: 'NASDAQ' }],
          instruments: [
            { id: 'newhighs', name: 'New Highs', latestClose: '72', timestamp: 'Monday, September 14, 2026' },
            { id: 'newlows', name: 'New Lows', latestClose: '402', timestamp: 'Monday, September 14, 2026' },
          ],
        },
      ],
    },
  }
}

describe('WSJ Market Diary Nasdaq breadth adapter', () => {
  it('parses the live response shape observed in the source probe', () => {
    const snapshot = parseWsjNasdaqBreadth(modernPayload(), '2026-09-15T20:30:18.000Z')
    expect(snapshot).toEqual({
      date: '2026-09-14',
      newHighs: 72,
      newLows: 402,
      source: 'WSJ/Dow Jones Market Data',
      variant: WSJ_BREADTH_VARIANT,
      sourceTimestamp: 'Monday, September 14, 2026',
      capturedAt: '2026-09-15T20:30:18.000Z',
    })
  })

  it('supports the older exchange-column response shape without guessing other exchanges', () => {
    const snapshot = parseWsjNasdaqBreadth({
      data: {
        timestamp: 'Thursday, February 8, 2024',
        instrumentSets: [{
          headerFields: [
            { label: 'NYSE', value: 'NYSE' },
            { label: 'NASDAQ', value: 'NASDAQ' },
          ],
          instruments: [
            { id: 'newhighs', name: 'New Highs', NYSE: '88', NASDAQ: '237' },
            { id: 'newlows', name: 'New Lows', NYSE: '55', NASDAQ: '147' },
          ],
        }],
      },
    }, '2024-02-08T23:00:00.000Z')

    expect(snapshot.date).toBe('2024-02-08')
    expect(snapshot.newHighs).toBe(237)
    expect(snapshot.newLows).toBe(147)
  })

  it('converts the WSJ source timestamp deterministically', () => {
    expect(wsjTimestampToDate('Monday, September 14, 2026')).toBe('2026-09-14')
    expect(wsjTimestampToDate('February 5, 2024')).toBe('2024-02-05')
  })

  it('fails closed on missing or invalid breadth values', () => {
    const payload = modernPayload()
    payload.data.instrumentSets[0].instruments[0].latestClose = '-1'
    expect(() => parseWsjNasdaqBreadth(payload)).toThrow(/invalid Nasdaq new highs/)
    expect(() => parseWsjNasdaqBreadth({ data: { instrumentSets: [] } })).toThrow(/instrumentSets missing/)
  })
})
