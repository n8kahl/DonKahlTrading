// =============================================================================
// Massive/Polygon API - Data Normalizers
// =============================================================================
//
// Normalizes API responses to consistent, typed formats.
// Handles:
// - Timestamp normalization to ISO dates
// - Ascending chronological order for timeseries
// - Consistent field names across endpoints
// - Entitlement/delay flag detection
// =============================================================================

import type { z } from 'zod'
import type {
  AggregatesResponseSchema,
  SnapshotResponseSchema,
  OptionsChainResponseSchema,
  MarketStatusSchema,
  SnapshotAllResponseSchema,
} from './operations'

// -----------------------------------------------------------------------------
// Normalized Types
// -----------------------------------------------------------------------------

export interface NormalizedBar {
  date: string // ISO date YYYY-MM-DD
  timestamp: number // Unix ms
  open: number
  high: number
  low: number
  close: number
  volume: number
  vwap: number | null
  transactions: number | null
}

export interface NormalizedSnapshot {
  symbol: string
  price: number
  change: number
  changePercent: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  vwap: number | null
  previousClose: number
  updatedAt: string // ISO timestamp
  isDelayed: boolean
}

export interface NormalizedOptionsContract {
  ticker: string
  underlying: string
  contractType: 'call' | 'put'
  strike: number
  expiration: string // YYYY-MM-DD
  bid: number
  ask: number
  mid: number
  last: number
  volume: number
  openInterest: number
  impliedVolatility: number
  delta: number | null
  gamma: number | null
  theta: number | null
  vega: number | null
  breakEven: number | null
  underlyingPrice: number
}

export interface NormalizedMarketStatus {
  isOpen: boolean
  phase: 'pre-market' | 'open' | 'after-hours' | 'closed'
  serverTime: string
  exchanges: {
    nyse: string
    nasdaq: string
  }
}

// -----------------------------------------------------------------------------
// Normalizers
// -----------------------------------------------------------------------------

/**
 * Normalize aggregates (OHLCV bars) response.
 * Ensures ascending chronological order and consistent field names.
 */
export function normalizeAggregates(
  response: z.infer<typeof AggregatesResponseSchema>
): NormalizedBar[] {
  const results = response.results || []

  // Map and sort by timestamp (ascending)
  const bars = results
    .map((bar) => ({
      date: new Date(bar.t).toISOString().split('T')[0],
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v ?? 0,
      vwap: bar.vw ?? null,
      transactions: bar.n ?? null,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)

  return bars
}

/**
 * Normalize single ticker snapshot.
 */
export function normalizeSnapshot(
  response: z.infer<typeof SnapshotResponseSchema>,
  ticker: string
): NormalizedSnapshot | null {
  const t = response.ticker
  if (!t) return null

  const day = t.day
  const prevDay = t.prevDay

  return {
    symbol: t.ticker || ticker,
    price: day?.c ?? prevDay?.c ?? 0,
    change: t.todaysChange ?? 0,
    changePercent: t.todaysChangePerc ?? 0,
    open: day?.o ?? 0,
    high: day?.h ?? 0,
    low: day?.l ?? 0,
    close: day?.c ?? 0,
    volume: day?.v ?? 0,
    vwap: day?.vw ?? null,
    previousClose: prevDay?.c ?? 0,
    updatedAt: t.updated ? new Date(t.updated).toISOString() : new Date().toISOString(),
    isDelayed: false, // Polygon doesn't flag this directly; assume real-time for paid plans
  }
}

/**
 * Normalize multiple ticker snapshots (gainers/losers).
 */
export function normalizeSnapshotAll(
  response: z.infer<typeof SnapshotAllResponseSchema>
): NormalizedSnapshot[] {
  const tickers = response.tickers || []

  return tickers
    .map((t) => {
      const day = t.day
      const prevDay = t.prevDay

      return {
        symbol: t.ticker,
        price: day?.c ?? prevDay?.c ?? 0,
        change: t.todaysChange ?? 0,
        changePercent: t.todaysChangePerc ?? 0,
        open: day?.o ?? 0,
        high: day?.h ?? 0,
        low: day?.l ?? 0,
        close: day?.c ?? 0,
        volume: day?.v ?? 0,
        vwap: day?.vw ?? null,
        previousClose: prevDay?.c ?? 0,
        updatedAt: t.updated ? new Date(t.updated).toISOString() : new Date().toISOString(),
        isDelayed: false,
      }
    })
    .filter((s) => s.price > 0) // Filter out invalid snapshots
}

/**
 * Normalize options chain response.
 */
export function normalizeOptionsChain(
  response: z.infer<typeof OptionsChainResponseSchema>
): NormalizedOptionsContract[] {
  const results = response.results || []

  return results
    .map((opt) => {
      const details = opt.details
      const quote = opt.last_quote
      const greeks = opt.greeks
      const underlying = opt.underlying_asset

      if (!details) return null

      return {
        ticker: details.ticker,
        underlying: details.underlying_ticker,
        contractType: details.contract_type,
        strike: details.strike_price,
        expiration: details.expiration_date,
        bid: quote?.bid ?? 0,
        ask: quote?.ask ?? 0,
        mid: quote?.midpoint ?? (quote?.bid && quote?.ask ? (quote.bid + quote.ask) / 2 : 0),
        last: opt.day?.close ?? 0,
        volume: opt.day?.volume ?? 0,
        openInterest: opt.open_interest ?? 0,
        impliedVolatility: opt.implied_volatility ?? 0,
        delta: greeks?.delta ?? null,
        gamma: greeks?.gamma ?? null,
        theta: greeks?.theta ?? null,
        vega: greeks?.vega ?? null,
        breakEven: opt.break_even_price ?? null,
        underlyingPrice: underlying?.price ?? 0,
      }
    })
    .filter((c): c is NormalizedOptionsContract => c !== null)
    .sort((a, b) => {
      // Sort by expiration, then by strike
      const expCompare = a.expiration.localeCompare(b.expiration)
      if (expCompare !== 0) return expCompare
      return a.strike - b.strike
    })
}

/**
 * Normalize market status response.
 */
export function normalizeMarketStatus(
  response: z.infer<typeof MarketStatusSchema>
): NormalizedMarketStatus {
  const exchanges = response.exchanges

  // Determine phase
  let phase: NormalizedMarketStatus['phase'] = 'closed'

  if (response.market === 'open') {
    phase = 'open'
  } else if (response.earlyHours) {
    phase = 'pre-market'
  } else if (response.afterHours) {
    phase = 'after-hours'
  }

  return {
    isOpen: response.market === 'open',
    phase,
    serverTime: response.serverTime || new Date().toISOString(),
    exchanges: {
      nyse: exchanges?.nyse ?? 'unknown',
      nasdaq: exchanges?.nasdaq ?? 'unknown',
    },
  }
}

// -----------------------------------------------------------------------------
// Helper: Detect if data is delayed
// -----------------------------------------------------------------------------

export function isDataDelayed(updatedAt: string | number, maxAgeMs = 900000): boolean {
  const updated = typeof updatedAt === 'number' ? updatedAt : new Date(updatedAt).getTime()
  const age = Date.now() - updated
  return age > maxAgeMs
}

// -----------------------------------------------------------------------------
// Helper: Format price with appropriate decimals
// -----------------------------------------------------------------------------

export function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(2)
  return price.toFixed(4)
}

// -----------------------------------------------------------------------------
// Helper: Format change with sign
// -----------------------------------------------------------------------------

export function formatChange(change: number, percent: number): string {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)} (${sign}${percent.toFixed(2)}%)`
}

// -----------------------------------------------------------------------------
// Index Symbol Mapping (for fallback to ETFs)
// -----------------------------------------------------------------------------

export const INDEX_TO_ETF: Record<string, string> = {
  'I:SPX': 'SPY',
  'I:NDX': 'QQQ',
  'I:RUT': 'IWM',
  'I:DJI': 'DIA',
  'I:VIX': 'VIXY', // VIX is complex; VIXY is VIX futures ETF
  'I:SOX': 'SMH',
  'I:COMP': 'QQQ', // NASDAQ Composite ~ QQQ
  SPX: 'SPY',
  NDX: 'QQQ',
  RUT: 'IWM',
  DJI: 'DIA',
  VIX: 'VIXY',
  SOX: 'SMH',
}

/**
 * Get ETF proxy for an index if needed.
 */
export function getEtfProxy(symbol: string): string {
  return INDEX_TO_ETF[symbol.toUpperCase()] || symbol
}

/**
 * Check if symbol is an index.
 */
export function isIndex(symbol: string): boolean {
  const upper = symbol.toUpperCase()
  return upper.startsWith('I:') || upper in INDEX_TO_ETF
}
