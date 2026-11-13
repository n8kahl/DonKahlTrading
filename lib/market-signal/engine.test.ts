import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MARKET_SIGNAL_CONFIG, MARKET_SIGNAL_INDEXES, MARKET_SIGNAL_REFERENCE_SHA256 } from './config'
import { computeIndexSeries, computeMarketSignal, computeTroughs, evaluateMarketSignal, normalizeProviderCloses } from './engine'
import type { MarketSignalClose, MarketSignalIndexKey, MarketSignalIndexPoint, MarketSignalValue } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Consecutive weekdays starting 2025-01-02, one close per day. */
function weekdayCloses(closes: Array<number | null>, start = '2025-01-02'): MarketSignalClose[] {
  const out: MarketSignalClose[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  for (const close of closes) {
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() + 1)
    out.push({ date: cursor.toISOString().slice(0, 10), close })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/** Builds closes from a starting level and a list of daily returns. */
function closesFromReturns(startClose: number, returns: number[]): number[] {
  const closes = [startClose]
  for (const r of returns) closes.push(closes.at(-1)! * (1 + r))
  return closes
}

function point(overrides: Partial<MarketSignalIndexPoint>): MarketSignalIndexPoint {
  return {
    date: '2025-06-02',
    close: 100,
    roc: 0,
    netMoves10d: 0,
    upDays10d: 0,
    daysSinceHigh: 0,
    belowHigh: false,
    troughDate: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Workbook fixture (cached values of Nasdaq_Tracker_Fixed.xlsx, Market Signal!A2:T487) and the forum author's table
// ---------------------------------------------------------------------------

type Cell = string | number | null

interface WorkbookFixture {
  source: { workbook: string; sheet: string; sha256: string; range: string }
  columns: string[]
  rows: Cell[][]
}

interface ExpectedIndexCells {
  close: number | null
  roc: number | null
  netMoves10d: number | null
  daysSinceHigh: number | null
  belowHigh: string | null
  upDays10d: number | null
}

interface ExpectedRow {
  date: string
  signal: MarketSignalValue | null
  indexes: Record<MarketSignalIndexKey, ExpectedIndexCells>
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'fixtures', 'market-signal-workbook.json'), 'utf8')
) as WorkbookFixture

const KEYS = MARKET_SIGNAL_INDEXES.map((index) => index.key)

const expectedRows: ExpectedRow[] = fixture.rows.map((cells) => {
  const cell = (name: string) => cells[fixture.columns.indexOf(name)]
  return {
    date: cell('date') as string,
    signal: cell('signal') as MarketSignalValue | null,
    indexes: Object.fromEntries(KEYS.map((key) => [key, {
      close: cell(`${key}.close`) as number | null,
      roc: cell(`${key}.roc`) as number | null,
      netMoves10d: cell(`${key}.netMoves10d`) as number | null,
      daysSinceHigh: cell(`${key}.daysSinceHigh`) as number | null,
      belowHigh: cell(`${key}.belowHigh`) as string | null,
      upDays10d: cell(`${key}.upDays10d`) as number | null,
    }])) as ExpectedRow['indexes'],
  }
})

const workbookModel = computeMarketSignal({
  closesByIndex: Object.fromEntries(KEYS.map((key) => [
    key,
    // Holiday rows are passed through as null closes, exactly as blank cells.
    expectedRows.map((row) => ({ date: row.date, close: row.indexes[key].close })),
  ])),
})
const modelByDate = new Map(workbookModel.rows.map((row) => [row.date, row]))

function expectRowParity(expected: ExpectedRow) {
  const actual = modelByDate.get(expected.date)
  const isHoliday = KEYS.every((key) => expected.indexes[key].close == null)
  if (isHoliday) {
    expect(actual, `${expected.date} is blank in the workbook`).toBeUndefined()
    expect(expected.signal).toBeNull()
    return
  }

  expect(actual, `${expected.date} missing from engine output`).toBeDefined()
  expect(actual!.signal, `${expected.date} signal`).toBe(expected.signal)
  for (const key of KEYS) {
    const want = expected.indexes[key]
    const got = actual!.indexes[key]
    expect(got, `${expected.date} ${key}`).not.toBeNull()
    expect(got!.close, `${expected.date} ${key} close`).toBe(want.close)
    if (want.roc == null) expect(got!.roc, `${expected.date} ${key} roc`).toBeNull()
    else expect(got!.roc, `${expected.date} ${key} roc`).toBeCloseTo(want.roc, 12)
    expect(got!.netMoves10d, `${expected.date} ${key} 10d net`).toBe(want.netMoves10d)
    expect(got!.upDays10d, `${expected.date} ${key} +2.5% days`).toBe(want.upDays10d)
    expect(got!.daysSinceHigh, `${expected.date} ${key} days since high`).toBe(want.daysSinceHigh)
    expect(got!.belowHigh ? 'TROUGH' : null, `${expected.date} ${key} 10% below high`).toBe(want.belowHigh)
  }
}

const net = (date: string) => KEYS.map((key) => modelByDate.get(date)!.indexes[key]!.netMoves10d)
const signal = (date: string) => modelByDate.get(date)!.signal

/**
 * The forum author's April 2025 table (10d net for Nasdaq, NDX, SOX), as
 * recomputed from FRED closes and matched row for row against his post.
 * 2025-04-18 was a market holiday and is not a row.
 */
const AUTHOR_TABLE: Array<[string, number, number, number]> = [
  ['2025-03-28', -1, -1, -1], ['2025-03-31', -1, -1, -1], ['2025-04-01', -1, -1, -1], ['2025-04-02', -1, -1, -1],
  ['2025-04-03', -2, -2, -2], ['2025-04-04', -3, -3, -3], ['2025-04-07', -3, -3, -3], ['2025-04-08', -3, -3, -4],
  ['2025-04-09', -2, -2, -2], ['2025-04-10', -3, -3, -3], ['2025-04-11', -2, -2, -1], ['2025-04-14', -2, -2, -1],
  ['2025-04-15', -2, -2, -1], ['2025-04-16', -3, -3, -2], ['2025-04-17', -2, -2, -1], ['2025-04-21', -2, -1, 0],
  ['2025-04-22', -1, 0, -1], ['2025-04-23', 0, 0, 1], ['2025-04-24', 0, 0, 1], ['2025-04-25', 1, 1, 2],
]

const SOX_TROUGH_DATES = [
  '2025-04-08', '2025-04-21', '2025-11-20', '2025-12-17', '2026-03-30',
  '2026-06-10', '2026-07-29', '2026-09-14', '2026-11-05',
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Market Signal: per-index metrics', () => {
  it('computes ROC against the previous trading day and leaves the first row blank', () => {
    const series = computeIndexSeries(weekdayCloses([100, 110, 99]))
    expect(series[0].roc).toBeNull()
    expect(series[0].netMoves10d).toBeNull()
    expect(series[0].upDays10d).toBeNull()
    expect(series[1].roc).toBeCloseTo(0.10, 12)
    expect(series[2].roc).toBeCloseTo(-0.10, 12)
  })

  it('skips a market holiday instead of carrying a close or blanking the next ROC', () => {
    const series = computeIndexSeries(weekdayCloses([100, 104, null, 0, 106.08]))
    expect(series.map((item) => item.date)).toEqual(['2025-01-02', '2025-01-03', '2025-01-08'])
    expect(series[2].roc).toBeCloseTo(106.08 / 104 - 1, 12)
    expect(series[2].daysSinceHigh).toBe(0)
  })

  it('nets +2.5% days against -2.5% days over the last ten trading days only', () => {
    const returns = [0.03, -0.03, -0.026, 0.024, -0.024, 0, 0, 0, 0, 0, 0, 0, 0]
    const series = computeIndexSeries(weekdayCloses(closesFromReturns(1000, returns)))
    // Index 10 is the tenth ROC: one up day and two down days are all still in the window.
    expect(series[10].netMoves10d).toBe(-1)
    expect(series[10].upDays10d).toBe(1)
    // One day later the +3% day has left the window.
    expect(series[11].netMoves10d).toBe(-2)
    expect(series[11].upDays10d).toBe(0)
    // Then the -3% day leaves, then the -2.6% day.
    expect(series[12].netMoves10d).toBe(-1)
    expect(series[13].netMoves10d).toBe(0)
  })

  it('counts trading days since the most recent highest close and ignores holidays', () => {
    const series = computeIndexSeries(weekdayCloses([100, 120, 110, null, 115, 120, 119]))
    expect(series.map((item) => item.daysSinceHigh)).toEqual([0, 0, 1, 2, 0, 1])
  })

  it('flags 10% below high at exactly 10% below the highest close, inclusive', () => {
    const series = computeIndexSeries(weekdayCloses([100, 90.01, 90, 95, 89]))
    expect(series.map((item) => item.belowHigh)).toEqual([false, false, true, false, true])
  })

  it('ignores closes before the peak start date', () => {
    const series = computeIndexSeries([
      { date: '2024-12-30', close: 500 },
      { date: '2024-12-31', close: 400 },
      { date: '2025-01-02', close: 100 },
      { date: '2025-01-03', close: 101 },
    ])
    expect(series[0]).toMatchObject({ date: '2025-01-02', roc: null, daysSinceHigh: 0, belowHigh: false })
    expect(series[1].daysSinceHigh).toBe(0)
  })

  it('reads threshold, window, depth and start date from config', () => {
    const closes = weekdayCloses(closesFromReturns(100, [0.012, -0.012, 0, 0, -0.04]), '2025-03-03')
    const config = { ...MARKET_SIGNAL_CONFIG, moveThreshold: 0.01, windowTradingDays: 2, belowHighDepth: 0.03, peakStartDate: '2025-03-04' }
    const series = computeIndexSeries(closes, config)
    expect(series[0].date).toBe('2025-03-04')
    expect(series[0].roc).toBeNull()
    expect(series[1].netMoves10d).toBe(-1)
    expect(series[1].upDays10d).toBe(0)
    expect(series[3].netMoves10d).toBe(0)
    expect(series[4].belowHigh).toBe(true)
    expect(computeIndexSeries(closes)[5].belowHigh).toBe(false)
  })
})

describe('Market Signal: trough dates', () => {
  it('marks the low once price has fallen 10% from a peak and rebounded 10% from the low', () => {
    const closes = weekdayCloses([100, 105, 95, 94.5, 92, 96, 101.2, 103])
    const troughs = computeTroughs('SOX', closes)
    expect(troughs).toHaveLength(1)
    expect(troughs[0]).toMatchObject({ index: 'SOX', date: '2025-01-08', close: 92, peakDate: '2025-01-03', peakClose: 105, confirmedDate: '2025-01-10' })
    expect(troughs[0].decline).toBeCloseTo(92 / 105 - 1, 12)
  })

  it('does not report a low that has not yet rebounded 10%', () => {
    expect(computeTroughs('SOX', weekdayCloses([100, 105, 94, 92, 96, 101.19]))).toEqual([])
  })

  it('does not treat a dip of less than 10% as a trough', () => {
    expect(computeTroughs('SOX', weekdayCloses([100, 91, 101, 92, 103, 120]))).toEqual([])
  })

  it('finds a second trough only after a new 10% fall from the peak that follows the first', () => {
    const closes = weekdayCloses([100, 90, 99.5, 110, 99.5, 98, 108, 97, 107])
    expect(computeTroughs('SOX', closes).map((trough) => [trough.date, trough.peakDate, trough.confirmedDate])).toEqual([
      ['2025-01-03', '2025-01-02', '2025-01-06'],
      ['2025-01-09', '2025-01-07', '2025-01-10'],
      ['2025-01-13', '2025-01-10', '2025-01-14'],
    ])
  })

  it('marks trough dates only on the configured indexes', () => {
    const closes = weekdayCloses([100, 105, 95, 94.5, 92, 96, 101.2, 103])
    const model = computeMarketSignal({ closesByIndex: { IXIC: closes, NDX: closes, SOX: closes } })
    expect(model.troughs.map((trough) => [trough.index, trough.date])).toEqual([['SOX', '2025-01-08']])
    const row = model.rows.find((item) => item.date === '2025-01-08')!
    expect(row.indexes.SOX!.troughDate).toBe(true)
    expect(row.indexes.IXIC!.troughDate).toBe(false)
    expect(model.rows.filter((item) => item.indexes.SOX!.troughDate)).toHaveLength(1)

    const all = computeMarketSignal({ closesByIndex: { IXIC: closes, NDX: closes, SOX: closes }, config: { troughIndexes: ['IXIC', 'SOX'] } })
    expect(all.troughs.map((trough) => trough.index)).toEqual(['IXIC', 'SOX'])
  })
})

describe('Market Signal: daily signal', () => {
  const below = point({ belowHigh: true })
  const netUp = point({ netMoves10d: 1, upDays10d: 1 })
  const quiet = point({})

  it('is RECOVERY when at least two of three net counts are +1 or more', () => {
    expect(evaluateMarketSignal([netUp, netUp, quiet])).toBe('RECOVERY')
    expect(evaluateMarketSignal([netUp, netUp, point({ netMoves10d: -1 })])).toBe('RECOVERY')
  })

  it('checks RECOVERY before WARNING', () => {
    const both = point({ belowHigh: true, netMoves10d: 2, upDays10d: 3 })
    expect(evaluateMarketSignal([both, both, below])).toBe('RECOVERY')
  })

  it('is WARNING when at least two of three are 10% below their high and RECOVERY does not apply', () => {
    expect(evaluateMarketSignal([below, below, quiet])).toBe('WARNING')
    expect(evaluateMarketSignal([below, below, netUp])).toBe('WARNING')
  })

  it('does not count up days that are cancelled by down days', () => {
    const cancelled = point({ netMoves10d: 0, upDays10d: 2 })
    expect(evaluateMarketSignal([cancelled, cancelled, cancelled])).toBe('WATCH')
  })

  it('is WATCH otherwise', () => {
    expect(evaluateMarketSignal([quiet, quiet, quiet])).toBe('WATCH')
    expect(evaluateMarketSignal([netUp, quiet, below])).toBe('WATCH')
    expect(evaluateMarketSignal([point({ netMoves10d: -3 }), point({ netMoves10d: -3 }), quiet])).toBe('WATCH')
  })

  it('is blank when any index has no ROC for the day', () => {
    expect(evaluateMarketSignal([netUp, netUp, null])).toBeNull()
    expect(evaluateMarketSignal([netUp, netUp, point({ roc: null, netMoves10d: null, upDays10d: null })])).toBeNull()
  })
})

describe('Market Signal: provider closes', () => {
  it('drops bars dated on a weekend and rounds closes to cents', () => {
    const { closes, droppedDates } = normalizeProviderCloses([
      { date: '2026-10-09', close: 27366.16979276279 },
      { date: '2026-10-10', close: 27352.7028819305 },
      { date: '2026-10-11', close: 27352.7 },
      { date: '2026-10-12', close: 27245.90248384004 },
      { date: '2026-10-13', close: null },
    ])
    expect(closes).toEqual([
      { date: '2026-10-09', close: 27366.17 },
      { date: '2026-10-12', close: 27245.9 },
      { date: '2026-10-13', close: null },
    ])
    expect(droppedDates).toEqual(['2026-10-10', '2026-10-11'])
  })
})

describe('Market Signal data health', () => {
  const flat = weekdayCloses([100, 101, 102, 103])

  it('is current when all indexes cover the start date and share the latest date', () => {
    const model = computeMarketSignal({ closesByIndex: { IXIC: flat, NDX: flat, SOX: flat } })
    expect(model.health).toMatchObject({ status: 'current', dataThrough: '2025-01-07', staleIndexes: [], unavailableIndexes: [], truncatedIndexes: [] })
    expect(model.latest?.date).toBe('2025-01-07')
  })

  it('reports a missing index and leaves every signal blank', () => {
    const model = computeMarketSignal({ closesByIndex: { IXIC: flat, NDX: flat } })
    expect(model.health.status).toBe('degraded')
    expect(model.health.unavailableIndexes).toEqual(['SOX'])
    expect(model.rows.every((row) => row.signal == null)).toBe(true)
    expect(model.latest).toBeNull()
  })

  it('reports an index whose latest close is behind the others', () => {
    const model = computeMarketSignal({ closesByIndex: { IXIC: flat, NDX: flat, SOX: flat.slice(0, 3) } })
    expect(model.health.status).toBe('stale')
    expect(model.health.staleIndexes).toEqual(['SOX'])
    expect(model.health.dataThrough).toBe('2025-01-06')
    expect(model.rows.at(-1)!.signal).toBeNull()
    expect(model.latest?.date).toBe('2025-01-06')
  })

  it('reports history that starts after the peak start date', () => {
    const late = weekdayCloses([100, 101, 102], '2025-02-03')
    const model = computeMarketSignal({ closesByIndex: { IXIC: late, NDX: late, SOX: late } })
    expect(model.health.status).toBe('degraded')
    expect(model.health.truncatedIndexes).toEqual(['IXIC', 'NDX', 'SOX'])
  })

  it('limits displayed rows without changing their values', () => {
    const model = computeMarketSignal({ closesByIndex: { IXIC: flat, NDX: flat, SOX: flat }, displayDays: 2 })
    expect(model.rows.map((row) => row.date)).toEqual(['2025-01-06', '2025-01-07'])
    expect(model.rows[0].indexes.IXIC?.daysSinceHigh).toBe(0)
    expect(model.rows[0].indexes.IXIC?.roc).toBeCloseTo(102 / 101 - 1, 12)
  })
})

describe("Market Signal parity: the forum author's April 2025 table", () => {
  it('uses the closes the table was checked against', () => {
    expect(KEYS.map((key) => modelByDate.get('2025-04-08')!.indexes[key]!.close)).toEqual([15267.91, 17090.40, 3562.94])
    expect(KEYS.map((key) => modelByDate.get('2025-04-09')!.indexes[key]!.close)).toEqual([17124.97, 19145.06, 4230.45])
  })

  it('matches the 10-day net counts on all 20 rows', () => {
    for (const [date, nasdaq, ndx, sox] of AUTHOR_TABLE) {
      expect(net(date), date).toEqual([nasdaq, ndx, sox])
    }
  })

  it('matches days since high on all 20 rows, with no row for the 2025-04-18 holiday', () => {
    expect(modelByDate.has('2025-04-18')).toBe(false)
    AUTHOR_TABLE.forEach(([date], offset) => {
      const row = modelByDate.get(date)!
      expect(row.indexes.IXIC!.daysSinceHigh, `${date} Nasdaq`).toBe(27 + offset)
      expect(row.indexes.NDX!.daysSinceHigh, `${date} NDX`).toBe(27 + offset)
      expect(row.indexes.SOX!.daysSinceHigh, `${date} SOX`).toBe(46 + offset)
    })
  })

  it('tests the 2.5% threshold on the unrounded ROC', () => {
    // Nasdaq +2.50% on 2025-04-23 counts as an up day.
    const up = modelByDate.get('2025-04-23')!.indexes.IXIC!
    expect(up.roc!).toBeGreaterThanOrEqual(0.025)
    expect(up.roc!).toBeLessThan(0.02505)
    expect(up.upDays10d! - modelByDate.get('2025-04-22')!.indexes.IXIC!.upDays10d!).toBe(1)
    // NDX -2.46% on 2025-04-21 does not count as a down day: its net improves as an older down day drops out.
    const notDown = modelByDate.get('2025-04-21')!.indexes.NDX!
    expect(notDown.roc!).toBeGreaterThan(-0.025)
    expect(notDown.roc!).toBeLessThan(-0.0245)
    expect(notDown.netMoves10d).toBe(-1)
  })

  it('turns to RECOVERY on 2025-04-25, after WARNING from 2025-04-21 to 2025-04-24', () => {
    expect(['2025-04-21', '2025-04-22', '2025-04-23', '2025-04-24'].map(signal)).toEqual(['WARNING', 'WARNING', 'WARNING', 'WARNING'])
    expect(signal('2025-04-25')).toBe('RECOVERY')
  })

  it('confirms the November 2025 recovery from two of three on 2025-11-24', () => {
    expect(signal('2025-11-21')).toBe('WATCH')
    expect(net('2025-11-24')).toEqual([1, 1, -1])
    expect(signal('2025-11-24')).toBe('RECOVERY')
  })

  it('reads WATCH on 2026-11-12 with net -1, -1, 0', () => {
    expect(net('2026-11-12')).toEqual([-1, -1, 0])
    expect(signal('2026-11-12')).toBe('WATCH')
  })

  it('marks the SOX trough dates, including the three the author names or highlights', () => {
    expect(workbookModel.troughs.map((trough) => trough.date)).toEqual(SOX_TROUGH_DATES)
    expect(workbookModel.troughs.every((trough) => trough.index === 'SOX')).toBe(true)
    expect(workbookModel.troughs.find((trough) => trough.date === '2025-04-08')).toMatchObject({ close: 3562.94, peakDate: '2025-01-22', peakClose: 5469.29, confirmedDate: '2025-04-09' })
    expect(workbookModel.troughs.find((trough) => trough.date === '2026-11-05')).toMatchObject({ close: 9011.14, confirmedDate: '2026-11-09' })
    expect(workbookModel.rows.filter((row) => row.indexes.SOX?.troughDate).map((row) => row.date)).toEqual(SOX_TROUGH_DATES)
    expect(workbookModel.rows.some((row) => row.indexes.IXIC?.troughDate || row.indexes.NDX?.troughDate)).toBe(false)
  })
})

describe('Market Signal parity: Nasdaq_Tracker_Fixed.xlsx fixture', () => {
  const tradingRows = expectedRows.filter((row) => KEYS.some((key) => row.indexes[key].close != null))

  it('was extracted from the reference workbook named in config', () => {
    expect(fixture.source.sha256).toBe(MARKET_SIGNAL_REFERENCE_SHA256)
    expect(fixture.source.sheet).toBe('Market Signal')
    expect(expectedRows[0].date).toBe(MARKET_SIGNAL_CONFIG.peakStartDate)
    expect(expectedRows.length).toBe(486)
    expect(tradingRows.length).toBe(468)
  })

  it('matches the rows around the 2025-01-09 and 2025-01-20 market holidays', () => {
    const dates = ['2025-01-08', '2025-01-09', '2025-01-10', '2025-01-17', '2025-01-20', '2025-01-21', '2025-01-22']
    const rows = expectedRows.filter((row) => dates.includes(row.date))
    expect(rows.map((row) => row.date)).toEqual(dates)
    rows.forEach(expectRowParity)

    // Spot checks straight from the sheet, so this test does not depend only on the loop above.
    expect(modelByDate.has('2025-01-09')).toBe(false)
    expect(modelByDate.get('2025-01-10')!.indexes.IXIC!.roc).toBeCloseTo(19161.63 / 19478.88 - 1, 12)
    expect(modelByDate.get('2025-01-21')!.indexes.IXIC!.daysSinceHigh).toBe(9)
    expect(modelByDate.get('2025-01-21')!.indexes.NDX!.daysSinceHigh).toBe(0)
    expect(modelByDate.get('2025-01-21')!.indexes.SOX!.netMoves10d).toBe(2)
  })

  it('matches the last 20 rows with data', () => {
    const last20 = tradingRows.slice(-20)
    expect(last20[0].date).toBe('2026-10-16')
    expect(last20.at(-1)!.date).toBe('2026-11-12')
    last20.forEach(expectRowParity)

    expect(last20.map((row) => modelByDate.get(row.date)!.signal)).toEqual(last20.map((row) => row.signal))
    expect(last20.slice(-6).map((row) => modelByDate.get(row.date)!.signal)).toEqual(['WARNING', 'WARNING', 'WARNING', 'WARNING', 'WATCH', 'WATCH'])
    const latest = modelByDate.get('2026-11-12')!
    expect(latest.indexes.SOX).toMatchObject({ close: 10506.67, netMoves10d: 0, upDays10d: 4, daysSinceHigh: 101, belowHigh: true })
    expect(latest.indexes.IXIC).toMatchObject({ close: 25366.09, netMoves10d: -1, upDays10d: 1, daysSinceHigh: 27, belowHigh: false })
    expect(workbookModel.latest?.date).toBe('2026-11-12')
  })

  it('matches every row of the sheet from 2025-01-02 to the last row with data', () => {
    expectedRows.forEach(expectRowParity)
    expect(workbookModel.rows.length).toBe(tradingRows.length)
  })

  it('reproduces the sheet signal distribution', () => {
    const count = (value: MarketSignalValue | null) => workbookModel.rows.filter((row) => row.signal === value).length
    const expectedCount = (value: MarketSignalValue) => expectedRows.filter((row) => row.signal === value).length
    expect([count('RECOVERY'), count('WARNING'), count('WATCH')]).toEqual([80, 40, 347])
    expect([expectedCount('RECOVERY'), expectedCount('WARNING'), expectedCount('WATCH')]).toEqual([80, 40, 347])
    // Only the first row (no ROC yet) is a trading day without a signal.
    expect(count(null)).toBe(1)
  })
})
