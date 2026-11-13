import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MARKET_SIGNAL_CONFIG, MARKET_SIGNAL_INDEXES, MARKET_SIGNAL_REFERENCE_SHA256 } from './config'
import { computeIndexSeries, computeMarketSignal, evaluateMarketSignal } from './engine'
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
    positiveMoves10d: 0,
    bigMoves10d: 0,
    daysSinceHigh: 0,
    trough: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Workbook fixture (cached values of Nasdaq_Tracker_Fixed.xlsx, Market Signal!A2:T487)
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
  bigMoves10d: number | null
  daysSinceHigh: number | null
  trough: string | null
  positiveMoves10d: number | null
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
      bigMoves10d: cell(`${key}.bigMoves10d`) as number | null,
      daysSinceHigh: cell(`${key}.daysSinceHigh`) as number | null,
      trough: cell(`${key}.trough`) as string | null,
      positiveMoves10d: cell(`${key}.positiveMoves10d`) as number | null,
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
    expect(got!.positiveMoves10d, `${expected.date} ${key} +2.5% days`).toBe(want.positiveMoves10d)
    expect(got!.bigMoves10d, `${expected.date} ${key} 2.5% moves`).toBe(want.bigMoves10d)
    expect(got!.daysSinceHigh, `${expected.date} ${key} days since high`).toBe(want.daysSinceHigh)
    expect(got!.trough ? 'TROUGH' : null, `${expected.date} ${key} trough`).toBe(want.trough)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Market Signal workbook parity: per-index metrics', () => {
  it('computes ROC against the last available close and leaves the first row blank', () => {
    const series = computeIndexSeries(weekdayCloses([100, 110, 99]))
    expect(series[0].roc).toBeNull()
    expect(series[0].positiveMoves10d).toBeNull()
    expect(series[0].bigMoves10d).toBeNull()
    expect(series[1].roc).toBeCloseTo(0.10, 12)
    expect(series[2].roc).toBeCloseTo(-0.10, 12)
  })

  it('skips a market holiday instead of carrying a close or blanking the next ROC', () => {
    const series = computeIndexSeries(weekdayCloses([100, 104, null, 0, 106.08]))
    expect(series.map((item) => item.date)).toEqual(['2025-01-02', '2025-01-03', '2025-01-08'])
    expect(series[2].roc).toBeCloseTo(106.08 / 104 - 1, 12)
    expect(series[2].daysSinceHigh).toBe(0)
  })

  it('counts +2.5% days and all 2.5% moves over the last ten trading days only', () => {
    const returns = [0.03, -0.03, 0.026, 0.024, -0.024, 0, 0, 0, 0, 0, 0, 0, 0]
    const series = computeIndexSeries(weekdayCloses(closesFromReturns(1000, returns)))
    // Index 10 is the tenth ROC: the window still holds every move so far.
    expect(series[10].positiveMoves10d).toBe(2)
    expect(series[10].bigMoves10d).toBe(3)
    // One day later the +3% day has left the window.
    expect(series[11].positiveMoves10d).toBe(1)
    expect(series[11].bigMoves10d).toBe(2)
    // Then the -3% day leaves, then the +2.6% day.
    expect(series[12].bigMoves10d).toBe(1)
    expect(series[13].positiveMoves10d).toBe(0)
    expect(series[13].bigMoves10d).toBe(0)
  })

  it('counts trading days since the most recent highest close and ignores holidays', () => {
    const series = computeIndexSeries(weekdayCloses([100, 120, 110, null, 115, 120, 119]))
    expect(series.map((item) => item.daysSinceHigh)).toEqual([0, 0, 1, 2, 0, 1])
  })

  it('flags TROUGH at exactly 10% below the highest close, inclusive', () => {
    const series = computeIndexSeries(weekdayCloses([100, 90.01, 90, 95, 89]))
    expect(series.map((item) => item.trough)).toEqual([false, false, true, false, true])
  })

  it('ignores closes before the peak start date', () => {
    const series = computeIndexSeries([
      { date: '2024-12-30', close: 500 },
      { date: '2024-12-31', close: 400 },
      { date: '2025-01-02', close: 100 },
      { date: '2025-01-03', close: 101 },
    ])
    expect(series[0]).toMatchObject({ date: '2025-01-02', roc: null, daysSinceHigh: 0, trough: false })
    expect(series[1].daysSinceHigh).toBe(0)
  })

  it('reads threshold, window, trough depth and start date from config', () => {
    const closes = weekdayCloses(closesFromReturns(100, [0.012, -0.012, 0, 0, -0.04]), '2025-03-03')
    const config = { ...MARKET_SIGNAL_CONFIG, moveThreshold: 0.01, windowTradingDays: 2, troughDepth: 0.03, peakStartDate: '2025-03-04' }
    const series = computeIndexSeries(closes, config)
    expect(series[0].date).toBe('2025-03-04')
    expect(series[0].roc).toBeNull()
    expect(series[1].bigMoves10d).toBe(1)
    expect(series[1].positiveMoves10d).toBe(0)
    expect(series[3].bigMoves10d).toBe(0)
    expect(series[4].trough).toBe(true)
    expect(computeIndexSeries(closes)[5].trough).toBe(false)
  })
})

describe('Market Signal workbook parity: daily signal', () => {
  const trough = point({ trough: true })
  const positive = point({ positiveMoves10d: 1, bigMoves10d: 1 })
  const quiet = point({})

  it('is WARNING when at least two of three indexes are in a trough', () => {
    expect(evaluateMarketSignal([trough, trough, quiet])).toBe('WARNING')
    expect(evaluateMarketSignal([trough, trough, trough])).toBe('WARNING')
  })

  it('gives WARNING priority over RECOVERY', () => {
    const both = point({ trough: true, positiveMoves10d: 3, bigMoves10d: 5 })
    expect(evaluateMarketSignal([both, both, positive])).toBe('WARNING')
  })

  it('is RECOVERY when at least two of three have a +2.5% day in the window', () => {
    expect(evaluateMarketSignal([positive, positive, quiet])).toBe('RECOVERY')
    expect(evaluateMarketSignal([positive, positive, trough])).toBe('RECOVERY')
  })

  it('is WATCH otherwise, including when only down moves are in the window', () => {
    const downOnly = point({ positiveMoves10d: 0, bigMoves10d: 4 })
    expect(evaluateMarketSignal([quiet, quiet, quiet])).toBe('WATCH')
    expect(evaluateMarketSignal([positive, quiet, trough])).toBe('WATCH')
    expect(evaluateMarketSignal([downOnly, downOnly, downOnly])).toBe('WATCH')
  })

  it('is blank when any index has no ROC for the day', () => {
    expect(evaluateMarketSignal([positive, positive, null])).toBeNull()
    expect(evaluateMarketSignal([positive, positive, point({ roc: null, positiveMoves10d: null, bigMoves10d: null })])).toBeNull()
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

describe('Market Signal workbook parity: Nasdaq_Tracker_Fixed.xlsx fixture', () => {
  const tradingRows = expectedRows.filter((row) => KEYS.some((key) => row.indexes[key].close != null))

  it('was extracted from the reference workbook named in config', () => {
    expect(fixture.source.sha256).toBe(MARKET_SIGNAL_REFERENCE_SHA256)
    expect(fixture.source.sheet).toBe('Market Signal')
    expect(expectedRows[0].date).toBe(MARKET_SIGNAL_CONFIG.peakStartDate)
    expect(expectedRows.length).toBe(486)
    expect(tradingRows.length).toBeGreaterThan(450)
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
    expect(modelByDate.get('2025-01-21')!.indexes.SOX!.positiveMoves10d).toBe(2)
  })

  it('matches the last 20 rows with data', () => {
    const last20 = tradingRows.slice(-20)
    expect(last20[0].date).toBe('2026-10-16')
    expect(last20.at(-1)!.date).toBe('2026-11-12')
    last20.forEach(expectRowParity)

    expect(last20.map((row) => modelByDate.get(row.date)!.signal)).toEqual([
      'WATCH', 'WATCH', 'WATCH', 'WATCH', 'WATCH', 'WATCH', 'WATCH', 'WATCH', 'WATCH', 'WATCH',
      'WATCH', 'WARNING', 'WATCH', 'WATCH', 'WARNING', 'WARNING', 'WARNING', 'WARNING', 'RECOVERY', 'RECOVERY',
    ])
    const latest = modelByDate.get('2026-11-12')!
    expect(latest.indexes.SOX).toMatchObject({ close: 10506.67, positiveMoves10d: 4, bigMoves10d: 8, daysSinceHigh: 101, trough: true })
    expect(latest.indexes.IXIC).toMatchObject({ close: 25366.09, positiveMoves10d: 1, bigMoves10d: 3, daysSinceHigh: 27, trough: false })
    expect(workbookModel.latest?.date).toBe('2026-11-12')
  })

  it('matches every row of the sheet from 2025-01-02 to the last row with data', () => {
    expectedRows.forEach(expectRowParity)
    expect(workbookModel.rows.length).toBe(tradingRows.length)
  })

  it('reproduces the sheet signal distribution', () => {
    const count = (signal: MarketSignalValue | null) => workbookModel.rows.filter((row) => row.signal === signal).length
    const expectedCount = (signal: MarketSignalValue) => expectedRows.filter((row) => row.signal === signal).length
    expect(count('WARNING')).toBe(expectedCount('WARNING'))
    expect(count('RECOVERY')).toBe(expectedCount('RECOVERY'))
    expect(count('WATCH')).toBe(expectedCount('WATCH'))
    // Only the first row (no ROC yet) is a trading day without a signal.
    expect(count(null)).toBe(1)
  })
})
