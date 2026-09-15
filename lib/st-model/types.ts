export interface STDailyBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type RegimeSignal = 'Bull' | 'Bear' | 'Unavailable'
export type PYImpact = 'PY_Thrust' | 'PY_Danger' | ''
export type ShortTermSignal = 'EB' | 'B' | ''

export interface STSymbolConfig {
  symbol: string
  label: string
  alternateFallThreshold: number
  supportsExtremeBuy: boolean
}

export interface STRegimePoint {
  date: string
  signal: RegimeSignal
}

export interface STSignalPoint {
  date: string
  symbol: string
  std: ShortTermSignal
  alt: ShortTermSignal
  bull: ShortTermSignal
  rsi: number | null
  pctRise: number | null
  pctFall: number | null
  daysFromHigh: number | null
  qqqDaysSince63dHigh: number | null
  pyImpact: PYImpact
  regimes: {
    sma: RegimeSignal
    nhnl: RegimeSignal
    dbe: RegimeSignal
  }
  bullSignalEligible: boolean
}

export type STBreadthMode = 'legacy-exact' | 'wsj-dow-jones' | 'unavailable'

export interface STDataHealth {
  status: 'current' | 'degraded' | 'stale'
  priceDataThrough: string | null
  breadthDataThrough: string | null
  breadthMode: STBreadthMode
  staleSymbols: string[]
  unavailableSources: string[]
  notes: string[]
}

export interface STModelResult {
  dates: string[]
  symbols: string[]
  rows: STSignalPoint[]
  byDate: Record<string, Record<string, STSignalPoint>>
  health: STDataHealth
}
