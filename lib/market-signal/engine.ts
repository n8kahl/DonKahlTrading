import { MARKET_SIGNAL_CONFIG, MARKET_SIGNAL_INDEXES } from './config'
import type {
  MarketSignalClose,
  MarketSignalConfig,
  MarketSignalHealth,
  MarketSignalIndexKey,
  MarketSignalIndexPoint,
  MarketSignalResult,
  MarketSignalRow,
  MarketSignalTrough,
  MarketSignalValue,
} from './types'

function isUsableClose(close: number | null | undefined): close is number {
  // The workbook treats a blank or zero close as "no data for this day".
  return typeof close === 'number' && Number.isFinite(close) && close !== 0
}

/** Usable closes on or after `peakStartDate`, one per date, ascending. */
function tradingCloses(closes: MarketSignalClose[], config: MarketSignalConfig): Array<{ date: string; close: number }> {
  const byDate = new Map<string, number>()
  for (const item of closes) {
    if (item.date >= config.peakStartDate && isUsableClose(item.close)) byDate.set(item.date, item.close)
  }
  return [...byDate.keys()].sort().map((date) => ({ date, close: byDate.get(date)! }))
}

/**
 * Provider hygiene, not a rule: index feeds can carry a bar dated on a
 * Saturday or Sunday and closes with more than two decimals. The rules are
 * defined on published daily closes, so weekend bars are dropped (they would
 * count as an extra trading day) and closes are rounded to cents.
 */
export function normalizeProviderCloses(bars: MarketSignalClose[]): { closes: MarketSignalClose[]; droppedDates: string[] } {
  const closes: MarketSignalClose[] = []
  const droppedDates: string[] = []
  for (const bar of bars) {
    const weekday = new Date(`${bar.date}T00:00:00Z`).getUTCDay()
    if (weekday === 0 || weekday === 6) {
      droppedDates.push(bar.date)
      continue
    }
    closes.push({ date: bar.date, close: bar.close == null ? null : Math.round(bar.close * 100) / 100 })
  }
  return { closes, droppedDates }
}

/**
 * One index column group of the workbook (close, ROC, 10d net, days since
 * high, 10% below high), computed over trading days on or after
 * `peakStartDate`. Days without a close (market holidays) are skipped, never
 * carried forward. `troughDate` is filled in by `computeMarketSignal`.
 */
export function computeIndexSeries(
  closes: MarketSignalClose[],
  config: MarketSignalConfig = MARKET_SIGNAL_CONFIG
): MarketSignalIndexPoint[] {
  const series = tradingCloses(closes, config)
  const belowHighLevel = 1 - config.belowHighDepth

  const points: MarketSignalIndexPoint[] = []
  const rocs: Array<number | null> = []
  let peak = -Infinity
  let peakIndex = 0

  series.forEach(({ date, close }, index) => {
    const roc = index === 0 ? null : close / series[index - 1].close - 1
    rocs.push(roc)

    // A tie with the running high moves the anchor to the most recent day.
    if (close >= peak) {
      peak = close
      peakIndex = index
    }

    let netMoves10d: number | null = null
    let upDays10d: number | null = null
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
      netMoves10d = ups - downs
      upDays10d = ups
    }

    points.push({
      date,
      close,
      roc,
      netMoves10d,
      upDays10d,
      daysSinceHigh: index - peakIndex,
      belowHigh: close <= belowHighLevel * peak,
      troughDate: false,
    })
  })

  return points
}

/**
 * Trough dates by a closing-price zigzag: once the close has fallen
 * `troughSwing` or more from the running peak, the lowest close that follows
 * becomes a trough on the first day the close is `troughSwing` or more above
 * it. A trough is therefore only known in hindsight, on `confirmedDate`; the
 * low still forming at the end of the data is not reported.
 */
export function computeTroughs(
  index: MarketSignalIndexKey,
  closes: MarketSignalClose[],
  config: MarketSignalConfig = MARKET_SIGNAL_CONFIG
): MarketSignalTrough[] {
  const series = tradingCloses(closes, config)
  const troughs: MarketSignalTrough[] = []
  if (!series.length) return troughs

  const swing = config.troughSwing
  let direction: 'up' | 'down' = 'up'
  let high = series[0]
  let low = series[0]

  for (const day of series) {
    if (direction === 'up') {
      if (day.close > high.close) high = day
      if (day.close <= high.close * (1 - swing)) {
        direction = 'down'
        low = day
      }
    } else {
      if (day.close < low.close) low = day
      if (day.close >= low.close * (1 + swing)) {
        troughs.push({
          index,
          date: low.date,
          close: low.close,
          peakDate: high.date,
          peakClose: high.close,
          decline: low.close / high.close - 1,
          confirmedDate: day.date,
        })
        direction = 'up'
        high = day
      }
    }
  }

  return troughs
}

/**
 * Daily signal across the indexes. RECOVERY is checked before WARNING. Null
 * unless every index has a net count for the day (the workbook leaves the
 * cell blank in that case).
 */
export function evaluateMarketSignal(
  points: Array<MarketSignalIndexPoint | null>,
  config: MarketSignalConfig = MARKET_SIGNAL_CONFIG
): MarketSignalValue | null {
  if (!points.length || points.some((point) => point == null || point.netMoves10d == null)) return null
  const present = points as MarketSignalIndexPoint[]
  const netPositive = present.filter((point) => point.netMoves10d! >= 1).length
  if (netPositive >= config.signalQuorum) return 'RECOVERY'
  const belowHigh = present.filter((point) => point.belowHigh).length
  if (belowHigh >= config.signalQuorum) return 'WARNING'
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
  const troughs: MarketSignalTrough[] = []

  for (const key of keys) {
    const closes = input.closesByIndex[key] || []
    const series = computeIndexSeries(closes, config)
    const byDate = new Map(series.map((point) => [point.date, point]))
    if (config.troughIndexes.includes(key)) {
      for (const trough of computeTroughs(key, closes, config)) {
        troughs.push(trough)
        byDate.get(trough.date)!.troughDate = true
      }
    }
    seriesByIndex.set(key, byDate)
    lastDateByIndex.set(key, series.at(-1)?.date ?? null)
    if (!series.length) {
      unavailableIndexes.push(key)
      continue
    }
    const first = firstDate(closes)
    if (first != null && first > config.peakStartDate) truncatedIndexes.push(key)
  }
  troughs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

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
    notes.push(`History for ${truncatedIndexes.map(label).join(', ')} starts after ${config.peakStartDate}; highest close, days since high, 10% below high and trough dates may differ from the workbook.`)
  }

  const health: MarketSignalHealth = {
    status: staleIndexes.length ? 'stale' : unavailableIndexes.length || truncatedIndexes.length ? 'degraded' : 'current',
    dataThrough,
    staleIndexes,
    unavailableIndexes,
    truncatedIndexes,
    notes,
  }

  return { config, indexes: MARKET_SIGNAL_INDEXES, rows, latest, troughs, health }
}
