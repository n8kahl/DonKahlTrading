import type { STSymbolConfig } from './types'

export const ST_MODEL_SPEC_VERSION = '2026-09-15'
export const ST_MODEL_REFERENCE_SHA256 = '088936d378790ad8633313fb35b1bda36253bbc3e8f0389da8bb50f0150fd27d'

export const ST_MODEL_SYMBOLS: STSymbolConfig[] = [
  { symbol: 'SOXL', label: 'SOXL', alternateFallThreshold: -0.20, supportsExtremeBuy: true },
  { symbol: 'TQQQ', label: 'TQQQ', alternateFallThreshold: -0.20, supportsExtremeBuy: true },
  { symbol: 'FNGG', label: 'FNGG', alternateFallThreshold: -0.13, supportsExtremeBuy: true },
  { symbol: 'TECL', label: 'TECL', alternateFallThreshold: -0.20, supportsExtremeBuy: false },
  { symbol: 'TNA', label: 'TNA', alternateFallThreshold: -0.20, supportsExtremeBuy: false },
  { symbol: 'MSTR', label: 'MSTR', alternateFallThreshold: -0.20, supportsExtremeBuy: false },
  { symbol: 'YINN', label: 'YINN', alternateFallThreshold: -0.20, supportsExtremeBuy: false },
  { symbol: 'TAN', label: 'TAN', alternateFallThreshold: -0.20, supportsExtremeBuy: false },
]

export const ST_PRICE_SYMBOLS = ST_MODEL_SYMBOLS.map((item) => item.symbol)

export const DBE_SYMBOLS = [
  'SPY',
  'ITOT',
  'QQQ',
  'SOXX',
  'VTI',
  'IXF',
  'IWB',
  'NYA',
  'IWV',
  'USFR',
] as const

export const SMA_SYMBOL = 'VOO'
export const QQQ_CONTEXT_SYMBOL = 'QQQ'

export const WORKBOOK_CONSTANTS = {
  rsiOffset: 4,
  rsiObservationCount: 5,
  shortWindow: 11,
  daysFromHighWindow: 63,
  smaWindow: 180,
  smaSlopeLag: 6,
  dbeWindow: 110,
  dbeBearishFractionThreshold: 0.10,
  stdFallThreshold: -0.20,
  stdRsiThreshold: 5,
  altRiseThreshold: 0.02,
  altRsiThreshold: 20,
  bullFastFallThreshold: -0.10,
  bullFastRsiThreshold: 5,
  bullFallbackFallThreshold: -0.15,
  bullFallbackRsiThreshold: 50,
  bullRiseThreshold: 0.025,
} as const
