import type { MarketSignalConfig, MarketSignalIndexConfig } from './types'

export const MARKET_SIGNAL_SPEC_VERSION = '2026-11-13'
export const MARKET_SIGNAL_REFERENCE_WORKBOOK = 'Nasdaq_Tracker_Fixed.xlsx'
export const MARKET_SIGNAL_REFERENCE_SHA256 = 'af9178de989171f979a433feba2443849a200372f7a02c4cd8d532478501e887'

/** Sheet order: Nasdaq, NDX100, PHLX SOX. */
export const MARKET_SIGNAL_INDEXES: MarketSignalIndexConfig[] = [
  { key: 'IXIC', label: 'Nasdaq', name: 'Nasdaq Composite', providerSymbol: 'I:COMP' },
  { key: 'NDX', label: 'NDX100', name: 'Nasdaq-100', providerSymbol: 'I:NDX' },
  { key: 'SOX', label: 'PHLX SOX', name: 'PHLX Semiconductor', providerSymbol: 'I:SOX' },
]

/**
 * Rule constants. Change them here, never inline in the engine.
 * docs/MARKET_SIGNAL_SDD.md records where each rule comes from.
 */
export const MARKET_SIGNAL_CONFIG: MarketSignalConfig = {
  moveThreshold: 0.025,
  windowTradingDays: 10,
  belowHighDepth: 0.10,
  peakStartDate: '2025-01-02',
  signalQuorum: 2,
  troughSwing: 0.10,
  troughIndexes: ['SOX'],
}
