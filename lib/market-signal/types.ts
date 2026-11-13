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
  /** A daily move counts when |ROC| >= this fraction (workbook: 2.5%). */
  moveThreshold: number
  /** Number of trading days in the rolling count window (workbook: 10). */
  windowTradingDays: number
  /** TROUGH when close <= (1 - troughDepth) * highest close (workbook: 10%). */
  troughDepth: number
  /** First row of the table and the anchor for the highest close (workbook: 2025-01-02). */
  peakStartDate: string
  /** How many of the indexes must agree for WARNING / RECOVERY (workbook: 2 of 3). */
  signalQuorum: number
}

export interface MarketSignalClose {
  date: string
  close: number | null
}

/** One index on one trading day. Mirrors one index's cells in a workbook row. */
export interface MarketSignalIndexPoint {
  date: string
  close: number
  /** close / last available prior close - 1. Null on the first row. */
  roc: number | null
  /** Count of ROC >= +threshold in the last N trading days. Null when ROC is null. */
  positiveMoves10d: number | null
  /** Count of |ROC| >= threshold (ups plus downs) in the last N trading days. Null when ROC is null. */
  bigMoves10d: number | null
  /** Trading days since the most recent highest close since `peakStartDate`. */
  daysSinceHigh: number
  /** True when close <= (1 - troughDepth) * highest close since `peakStartDate`. */
  trough: boolean
}

export interface MarketSignalRow {
  date: string
  indexes: Record<MarketSignalIndexKey, MarketSignalIndexPoint | null>
  /** Null when any index has no ROC for the day, as in the workbook. */
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
  health: MarketSignalHealth
}
