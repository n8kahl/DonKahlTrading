import type { MarketSignalConfig, MarketSignalIndexConfig } from './types'

export const MARKET_SIGNAL_SPEC_VERSION = '2026-11-13'
export const MARKET_SIGNAL_REFERENCE_WORKBOOK = 'Nasdaq_Tracker_Fixed.xlsx'
export const MARKET_SIGNAL_REFERENCE_SHA256 = '7e79c4e751a80c0fe4cb51abd1ca0890d9f18604e538200cce8aff1c0cfa6c64'

/** Sheet order: Nasdaq, NDX100, PHLX SOX. */
export const MARKET_SIGNAL_INDEXES: MarketSignalIndexConfig[] = [
  { key: 'IXIC', label: 'Nasdaq', name: 'Nasdaq Composite', providerSymbol: 'I:COMP' },
  { key: 'NDX', label: 'NDX100', name: 'Nasdaq-100', providerSymbol: 'I:NDX' },
  { key: 'SOX', label: 'PHLX SOX', name: 'PHLX Semiconductor', providerSymbol: 'I:SOX' },
]

/**
 * Workbook rule constants. Change them here, never inline in the engine.
 * See docs/MARKET_SIGNAL_SDD.md for the two rules that are still open with Don.
 */
export const MARKET_SIGNAL_CONFIG: MarketSignalConfig = {
  moveThreshold: 0.025,
  windowTradingDays: 10,
  troughDepth: 0.10,
  peakStartDate: '2025-01-02',
  signalQuorum: 2,
}
