import { MARKET_SIGNAL_CONFIG, MARKET_SIGNAL_INDEXES } from './config'
import type {
  MarketSignalClose,
  MarketSignalConfig,
  MarketSignalHealth,
  MarketSignalIndexKey,
  MarketSignalIndexPoint,
  MarketSignalResult,
  MarketSignalRow,
  MarketSignalValue,
} from './types'

function isUsableClose(close: number | null | undefined): close is number {
  // The workbook treats a blank or zero close as "no data for this day".
  return typeof close === 'number' && Number.isFinite(close) && close !== 0
}

/**
 * One index column group of the workbook (close, ROC, 10d counts, days since
 * high, trough), computed over trading days on or after `peakStartDate`.
 * Days without a close (market holidays) are skipped, never carried forward.
 */
export function computeIndexSeries(
  closes: MarketSignalClose[],
  config: MarketSignalConfig = MARKET_SIGNAL_CONFIG
): MarketSignalIndexPoint[] {
  const byDate = new Map<string, number>()
  for (const item of closes) {
    if (item.date >= config.peakStartDate && isUsableClose(item.close)) byDate.set(item.date, item.close)
  }
  const dates = [...byDate.keys()].sort()
  const troughLevel = 1 - config.troughDepth

  const points: MarketSignalIndexPoint[] = []
  const rocs: Array<number | null> = []
  let peak = -Infinity
  let peakIndex = 0

  dates.forEach((date, index) => {
    const close = byDate.get(date)!
    const roc = index === 0 ? null : close / points[index - 1].close - 1
    rocs.push(roc)

    // A tie with the running high moves the anchor to the most recent day.
    if (close >= peak) {
      peak = close
      peakIndex = index
    }

    let positiveMoves10d: number | null = null
    let bigMoves10d: number | null = null
    if (roc != null) {
      // The first row has no ROC, so the window never reaches back past index 1.
      const start = Math.max(1, index - config.windowTradingDays + 1)
      let ups = 0
      let downs = 0
      for (let i = start; i <= index; i++) {
        const value = rocs[i]!
        if (value >= config.moveThreshold) ups++
        else if (value <= -config.moveThreshold) downs++
      }
      positiveMoves10d = ups
      bigMoves10d = ups + downs
    }

    points.push({
      date,
      close,
      roc,
      positiveMoves10d,
      bigMoves10d,
      daysSinceHigh: index - peakIndex,
      trough: close <= troughLevel * peak,
    })
  })

  return points
}

/**
 * Daily signal across the indexes. Null unless every index has a 10-day count
 * for the day (the workbook leaves the cell blank in that case).
 */
export function evaluateMarketSignal(
  points: Array<MarketSignalIndexPoint | null>,
  config: MarketSignalConfig = MARKET_SIGNAL_CONFIG
): MarketSignalValue | null {
  if (!points.length || points.some((point) => point == null || point.positiveMoves10d == null)) return null
  const present = points as MarketSignalIndexPoint[]
  const troughs = present.filter((point) => point.trough).length
  if (troughs >= config.signalQuorum) return 'WARNING'
  const withPositiveMove = present.filter((point) => point.positiveMoves10d! >= 1).length
  if (withPositiveMove >= config.signalQuorum) return 'RECOVERY'
  return 'WATCH'
}

export interface ComputeMarketSignalInput {
  closesByIndex: Partial<Record<MarketSignalIndexKey, MarketSignalClose[]>>
  config?: Partial<MarketSignalConfig>
  /** Keep only the most recent N rows in the result. Metrics still use the full history. */
  displayDays?: number
  healthNotes?: string[]
}

function firstDate(closes: MarketSignalClose[]): string | null {
  let first: string | null = null
  for (const item of closes) {
    if (isUsableClose(item.close) && (first == null || item.date < first)) first = item.date
  }
  return first
}

export function computeMarketSignal(input: ComputeMarketSignalInput): MarketSignalResult {
  const config: MarketSignalConfig = { ...MARKET_SIGNAL_CONFIG, ...input.config }
  const keys = MARKET_SIGNAL_INDEXES.map((index) => index.key)

  const seriesByIndex = new Map<MarketSignalIndexKey, Map<string, MarketSignalIndexPoint>>()
  const lastDateByIndex = new Map<MarketSignalIndexKey, string | null>()
  const unavailableIndexes: MarketSignalIndexKey[] = []
  const truncatedIndexes: MarketSignalIndexKey[] = []

  for (const key of keys) {
    const closes = input.closesByIndex[key] || []
    const series = computeIndexSeries(closes, config)
    seriesByIndex.set(key, new Map(series.map((point) => [point.date, point])))
    lastDateByIndex.set(key, series.at(-1)?.date ?? null)
    if (!series.length) {
      unavailableIndexes.push(key)
      continue
    }
    const first = firstDate(closes)
    if (first != null && first > config.peakStartDate) truncatedIndexes.push(key)
  }

  const allDates = [...new Set(keys.flatMap((key) => [...seriesByIndex.get(key)!.keys()]))].sort()
  const allRows: MarketSignalRow[] = allDates.map((date) => {
    const indexes = Object.fromEntries(
      keys.map((key) => [key, seriesByIndex.get(key)!.get(date) ?? null])
    ) as MarketSignalRow['indexes']
    return { date, indexes, signal: evaluateMarketSignal(keys.map((key) => indexes[key]), config) }
  })

  const rows = input.displayDays ? allRows.slice(-input.displayDays) : allRows
  const latest = [...allRows].reverse().find((row) => row.signal != null) ?? null

  const lastDates = keys.map((key) => lastDateByIndex.get(key)).filter((value): value is string => Boolean(value))
  const newest = lastDates.length ? lastDates.slice().sort().at(-1)! : null
  const staleIndexes = keys.filter((key) => {
    const last = lastDateByIndex.get(key)
    return last != null && last !== newest
  })
  const dataThrough = unavailableIndexes.length || !lastDates.length ? null : lastDates.slice().sort()[0]

  const label = (key: MarketSignalIndexKey) => MARKET_SIGNAL_INDEXES.find((index) => index.key === key)!.label
  const notes = [...(input.healthNotes || [])]
  if (unavailableIndexes.length) {
    notes.push(`No closes available for: ${unavailableIndexes.map(label).join(', ')}. The signal is blank until all indexes have data.`)
  }
  if (staleIndexes.length) notes.push(`Stale index feeds: ${staleIndexes.map(label).join(', ')}.`)
  if (truncatedIndexes.length) {
    notes.push(`History for ${truncatedIndexes.map(label).join(', ')} starts after ${config.peakStartDate}; highest close, days since high and TROUGH may differ from the workbook.`)
  }

  const health: MarketSignalHealth = {
    status: staleIndexes.length ? 'stale' : unavailableIndexes.length || truncatedIndexes.length ? 'degraded' : 'current',
    dataThrough,
    staleIndexes,
    unavailableIndexes,
    truncatedIndexes,
    notes,
  }

  return { config, indexes: MARKET_SIGNAL_INDEXES, rows, latest, health }
}
