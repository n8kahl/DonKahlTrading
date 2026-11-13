export type MarketSignalIndexKey = 'IXIC' | 'NDX' | 'SOX'

export type MarketSignalValue = 'WARNING' | 'RECOVERY' | 'WATCH'

export interface MarketSignalIndexConfig {
  /** Tucson Trader symbol; `lib/massive-api.ts` resolves it to the provider ticker. */
  key: MarketSignalIndexKey
  /** Column heading used by the workbook. */
  label: string
  name: string
  providerSymbol: string
}

export interface MarketSignalConfig {
  /** A daily move counts when |ROC| >= this fraction (2.5%). Tested on the unrounded ROC. */
  moveThreshold: number
  /** Number of trading days in the rolling net count, including the current day (10). */
  windowTradingDays: number
  /** "10% below high" when close <= (1 - belowHighDepth) * highest close since `peakStartDate`. */
  belowHighDepth: number
  /** First row of the table and the start of the history used for the highest close (2025-01-02). */
  peakStartDate: string
  /** How many of the indexes must agree for RECOVERY / WARNING (2 of 3). */
  signalQuorum: number
  /** Peak-to-trough swing that defines a trough date: a 10% fall, then a 10% rebound from the low. */
  troughSwing: number
  /** Indexes whose trough dates are marked (the forum author marks SOX only). */
  troughIndexes: MarketSignalIndexKey[]
}

export interface MarketSignalClose {
  date: string
  close: number | null
}

/** One index on one trading day. Mirrors one index's cells in a workbook row. */
export interface MarketSignalIndexPoint {
  date: string
  close: number
  /** close / previous trading day's close - 1, unrounded. Null on the first row. */
  roc: number | null
  /** Days with ROC >= +threshold minus days with ROC <= -threshold over the last N trading days. Null when ROC is null. */
  netMoves10d: number | null
  /** Days with ROC >= +threshold over the last N trading days (workbook reference columns R:T). Null when ROC is null. */
  upDays10d: number | null
  /** Trading days since the most recent highest close since `peakStartDate`. */
  daysSinceHigh: number
  /** Live state: close <= (1 - belowHighDepth) * highest close since `peakStartDate` (workbook cell text "TROUGH"). */
  belowHigh: boolean
  /** True on a confirmed trough date. Only set for `troughIndexes`, and only once the rebound has confirmed it. */
  troughDate: boolean
}

/** A swing low: the lowest close after a fall of `troughSwing` from a peak, confirmed by a rebound of `troughSwing`. */
export interface MarketSignalTrough {
  index: MarketSignalIndexKey
  date: string
  close: number
  peakDate: string
  peakClose: number
  /** close / peakClose - 1 (negative). */
  decline: number
  /** First trading day whose close was `troughSwing` or more above the low. The trough is unknown before this day. */
  confirmedDate: string
}

export interface MarketSignalRow {
  date: string
  indexes: Record<MarketSignalIndexKey, MarketSignalIndexPoint | null>
  /** Null when any index has no net count for the day, as in the workbook. */
  signal: MarketSignalValue | null
}

export interface MarketSignalHealth {
  status: 'current' | 'degraded' | 'stale'
  /** Latest date on which every index has a close. */
  dataThrough: string | null
  staleIndexes: MarketSignalIndexKey[]
  unavailableIndexes: MarketSignalIndexKey[]
  /** Indexes whose history starts after `peakStartDate`, so the peak anchor is not covered. */
  truncatedIndexes: MarketSignalIndexKey[]
  notes: string[]
}

export interface MarketSignalResult {
  config: MarketSignalConfig
  indexes: MarketSignalIndexConfig[]
  /** Ascending by date. One row per date on which at least one index has a close. */
  rows: MarketSignalRow[]
  /** Most recent row that carries a signal. */
  latest: MarketSignalRow | null
  /** Confirmed trough dates for `troughIndexes`, ascending. */
  troughs: MarketSignalTrough[]
  health: MarketSignalHealth
}
