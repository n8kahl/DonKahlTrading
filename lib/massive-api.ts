// =============================================================================
// Tucson Trader - Production Data Layer
// Massive/Polygon.io API Integration for Options & Indices Analysis
// =============================================================================

// -----------------------------------------------------------------------------
// Core Types - Daily Bars & Heatmap Metrics (existing)
// -----------------------------------------------------------------------------

export interface DailyBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HeatmapMetrics {
  daysSinceHigh: number
  daysSinceLow: number
  pctFromHigh: number
  pctFromLow: number
  rollingHigh: number
  rollingLow: number
  currentValue: number
}

export interface EnhancedHeatmapData {
  dates: string[]
  data: Record<string, HeatmapMetrics[]>
  rawBars: Record<string, DailyBar[]>
}

export interface HeatmapData {
  dates: string[]
  data: Record<string, number[]>
}

// -----------------------------------------------------------------------------
// Options Types - Greeks, Contracts, Chain
// -----------------------------------------------------------------------------

export interface Greeks {
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
}

export interface OptionContract {
  ticker: string
  underlying_ticker: string
  contract_type: 'call' | 'put'
  strike_price: number
  expiration_date: string
  shares_per_contract: number
  exercise_style: 'american' | 'european'
}

export interface OptionQuote {
  bid: number
  bid_size: number
  ask: number
  ask_size: number
  last_price: number
  last_size: number
  midpoint: number
}

export interface OptionDayData {
  open: number
  high: number
  low: number
  close: number
  volume: number
  vwap: number
  change: number
  change_percent: number
  previous_close: number
}

export interface OptionSnapshot {
  contract: OptionContract
  quote: OptionQuote
  day: OptionDayData
  greeks: Greeks
  implied_volatility: number
  open_interest: number
  break_even_price: number
  underlying_price: number
  last_updated: string
}

export interface OptionsChainResponse {
  success: boolean
  underlying_symbol: string
  underlying_price: number
  results: OptionSnapshot[]
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Intraday Bar Types
// -----------------------------------------------------------------------------

export type IntradayInterval = '1m' | '5m' | '15m' | '30m' | '1h'

export interface IntradayBar {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  vwap: number
  transactions: number
}

export interface IntradayBarsResponse {
  success: boolean
  symbol: string
  interval: IntradayInterval
  results: IntradayBar[]
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Market Status Types
// -----------------------------------------------------------------------------

export type MarketPhase =
  | 'pre-market'
  | 'open'
  | 'after-hours'
  | 'closed'

export interface MarketStatus {
  market: 'stocks' | 'crypto' | 'forex'
  server_time: string
  exchanges: {
    nyse: MarketPhase
    nasdaq: MarketPhase
  }
  early_close: boolean
  next_open: string
  next_close: string
}

export interface MarketStatusResponse {
  success: boolean
  status: MarketStatus | null
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Snapshot Types (Real-time Quote Data)
// -----------------------------------------------------------------------------

export interface TickerSnapshot {
  ticker: string
  todaysChange: number
  todaysChangePerc: number
  updated: number
  day: {
    open: number
    high: number
    low: number
    close: number
    volume: number
    vwap: number
  }
  prevDay: {
    open: number
    high: number
    low: number
    close: number
    volume: number
    vwap: number
  }
  min: {
    open: number
    high: number
    low: number
    close: number
    volume: number
    vwap: number
    accumulated_volume: number
  }
}

export interface SnapshotResponse {
  success: boolean
  ticker: TickerSnapshot | null
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Universal Snapshot Types
// -----------------------------------------------------------------------------

export interface UniversalSnapshotItem {
  ticker: string
  name?: string
  market: string
  locale: string
  type: string
  currency_name?: string
  last_updated_utc?: string
  // Session data
  session?: {
    open: number
    high: number
    low: number
    close: number
    volume: number
    change: number
    change_percent: number
    previous_close: number
    early_trading_change?: number
    early_trading_change_percent?: number
    late_trading_change?: number
    late_trading_change_percent?: number
  }
  // Last quote
  last_quote?: {
    bid: number
    bid_size: number
    ask: number
    ask_size: number
    last_updated: number
  }
  // Last trade
  last_trade?: {
    price: number
    size: number
    exchange: number
    conditions?: number[]
    timestamp: number
  }
  // Fair market value (for options)
  fmv?: number
  // Underlying asset info (for options/derivatives)
  underlying_asset?: {
    ticker: string
    price: number
    change_to_break_even?: number
  }
  // Greeks (for options)
  greeks?: Greeks
  implied_volatility?: number
  open_interest?: number
  break_even_price?: number
}

export interface UniversalSnapshotResponse {
  success: boolean
  results: UniversalSnapshotItem[]
  entitlement: DataEntitlement
  request_id?: string
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Index Snapshot Types
// -----------------------------------------------------------------------------

export interface IndexSnapshotItem {
  ticker: string
  name: string
  market: string
  locale: string
  type: 'indices'
  value: number
  session: {
    open: number
    high: number
    low: number
    close: number
    change: number
    change_percent: number
    previous_close: number
  }
  last_updated: number
}

export interface IndexSnapshotResponse {
  success: boolean
  results: IndexSnapshotItem[]
  entitlement: DataEntitlement
  request_id?: string
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Error Handling Types
// -----------------------------------------------------------------------------

export interface ApiError {
  code: 'API_KEY_MISSING' | 'FETCH_FAILED' | 'INVALID_RESPONSE' | 'RATE_LIMITED' | 'NOT_FOUND' | 'UNKNOWN'
  message: string
  symbol?: string
  endpoint?: string
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

// Known market indices that require the I: prefix for Polygon API
const KNOWN_INDICES = new Set([
  'SPX',   // S&P 500
  'NDX',   // Nasdaq 100
  'RUT',   // Russell 2000
  'VIX',   // CBOE Volatility Index
  'SOX',   // PHLX Semiconductor
  'DJI',   // Dow Jones Industrial
  'IXIC',  // Nasdaq Composite
  'COMP',  // Nasdaq Composite (alternate)
  'NYA',   // NYSE Composite
  'OEX',   // S&P 100
  'MID',   // S&P MidCap 400
  'SML',   // S&P SmallCap 600
])

// Ticker aliases that need specific mapping
const TICKER_MAPPING: Record<string, string> = {
  IXIC: 'I:COMP',
  DJI: 'I:DJI',
  SPX: 'I:SPX',
  NDX: 'I:NDX',
  RUT: 'I:RUT',
  SOX: 'I:SOX',
}

const INTERVAL_MAP: Record<IntradayInterval, { multiplier: number; timespan: string }> = {
  '1m': { multiplier: 1, timespan: 'minute' },
  '5m': { multiplier: 5, timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '30m': { multiplier: 30, timespan: 'minute' },
  '1h': { multiplier: 1, timespan: 'hour' },
}

// Unified base URL - configurable via environment variable
const BASE_URL = process.env.POLYGON_BASE_URL || 'https://api.polygon.io'

// Asset classes for Universal Snapshot
export type AssetClass = 'stocks' | 'options' | 'crypto' | 'forex' | 'indices'

// Entitlement/delay status for data freshness
export interface DataEntitlement {
  delayed: boolean
  delayMinutes: number
  entitlementId?: string
  source: 'realtime' | 'delayed' | 'eod'
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

function getApiKey(): string | null {
  return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || null
}

/**
 * Normalizes a ticker symbol for Polygon API.
 * - Indices (SPX, NDX, RUT, VIX, etc.) get the I: prefix
 * - Stocks (AAPL, NVDA, SPY, QQQ) do NOT get the I: prefix
 * - ETFs tracking indices (SPY, QQQ, IWM) are stocks, not indices
 */
export function normalizeSymbol(symbol: string): string {
  // Remove any existing I: prefix and uppercase for consistent comparison
  const cleanSymbol = symbol.replace(/^I:/i, '').toUpperCase().trim()

  // Check for explicit ticker mapping first (handles aliases like IXIC -> I:COMP)
  if (TICKER_MAPPING[cleanSymbol]) {
    return TICKER_MAPPING[cleanSymbol]
  }

  // If the symbol is already prefixed with I: and it's in our known indices, keep it
  if (symbol.toUpperCase().startsWith('I:') && KNOWN_INDICES.has(cleanSymbol)) {
    return `I:${cleanSymbol}`
  }

  // Auto-detect: If it's a known index, add the I: prefix
  if (KNOWN_INDICES.has(cleanSymbol)) {
    return `I:${cleanSymbol}`
  }

  // Otherwise it's a stock/ETF - return without prefix
  return cleanSymbol
}

function createError(
  code: ApiError['code'],
  message: string,
  symbol?: string,
  endpoint?: string
): ApiError {
  return { code, message, symbol, endpoint }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// -----------------------------------------------------------------------------
// Market Status Helpers
// -----------------------------------------------------------------------------

let cachedMarketStatus: { status: MarketStatus; fetchedAt: number } | null = null
const MARKET_STATUS_CACHE_MS = 60_000 // 1 minute

export function isMarketOpen(): boolean {
  if (!cachedMarketStatus) {
    return false // Default to closed if unknown
  }

  const { status, fetchedAt } = cachedMarketStatus
  const isStale = Date.now() - fetchedAt > MARKET_STATUS_CACHE_MS

  if (isStale) {
    return false // Conservative: treat stale data as closed
  }

  return status.exchanges.nyse === 'open' || status.exchanges.nasdaq === 'open'
}

export function isExtendedHours(): boolean {
  if (!cachedMarketStatus) {
    return false
  }

  const { status } = cachedMarketStatus
  return (
    status.exchanges.nyse === 'pre-market' ||
    status.exchanges.nyse === 'after-hours' ||
    status.exchanges.nasdaq === 'pre-market' ||
    status.exchanges.nasdaq === 'after-hours'
  )
}

export function getCacheRevalidation(): number {
  if (isMarketOpen()) {
    return 60 // 1 minute during market hours
  }
  if (isExtendedHours()) {
    return 300 // 5 minutes during extended hours
  }
  return 3600 // 1 hour when closed
}

export function getCurrentMarketPhase(): MarketPhase {
  if (!cachedMarketStatus) {
    return 'closed'
  }
  const { status } = cachedMarketStatus
  // Prioritize NYSE status
  return status.exchanges.nyse
}

export interface ResponseMeta {
  lastFetchedAt: string
  marketStatus: MarketPhase
  isDelayed: boolean
  source: 'polygon'
}

export function buildResponseMeta(): ResponseMeta {
  return {
    lastFetchedAt: new Date().toISOString(),
    marketStatus: getCurrentMarketPhase(),
    isDelayed: true, // Polygon basic tier has 15-min delay
    source: 'polygon',
  }
}

// -----------------------------------------------------------------------------
// API Functions - Market Status
// -----------------------------------------------------------------------------

export async function fetchMarketStatus(): Promise<MarketStatusResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    console.error('[API] Market status fetch failed: API key not configured')
    return {
      success: false,
      status: null,
      error: createError('API_KEY_MISSING', 'API key is not configured'),
    }
  }

  try {
    const url = `${BASE_URL}/v1/marketstatus/now?apiKey=${apiKey}`

    const response = await fetch(url, {
      next: { revalidate: 60 },
    })

    if (!response.ok) {
      console.error(`[API] Market status fetch failed: ${response.status}`)
      return {
        success: false,
        status: null,
        error: createError('FETCH_FAILED', `HTTP ${response.status}: ${response.statusText}`),
      }
    }

    const data = await response.json()

    const status: MarketStatus = {
      market: 'stocks',
      server_time: data.serverTime || new Date().toISOString(),
      exchanges: {
        nyse: mapMarketPhase(data.exchanges?.nyse || data.market),
        nasdaq: mapMarketPhase(data.exchanges?.nasdaq || data.market),
      },
      early_close: data.earlyHours || false,
      next_open: data.nextOpen || '',
      next_close: data.nextClose || '',
    }

    // Update cache
    cachedMarketStatus = { status, fetchedAt: Date.now() }

    return { success: true, status }
  } catch (error) {
    console.error('[API] Market status fetch error:', error instanceof Error ? error.message : 'Unknown error')
    return {
      success: false,
      status: null,
      error: createError('FETCH_FAILED', 'Failed to fetch market status'),
    }
  }
}

function mapMarketPhase(phase: string): MarketPhase {
  switch (phase?.toLowerCase()) {
    case 'open':
    case 'regular':
      return 'open'
    case 'pre-market':
    case 'pre':
    case 'premarket':
      return 'pre-market'
    case 'after-hours':
    case 'after':
    case 'afterhours':
    case 'extended-hours':
      return 'after-hours'
    default:
      return 'closed'
  }
}

// -----------------------------------------------------------------------------
// API Functions - Options Chain
// -----------------------------------------------------------------------------

export async function fetchOptionsChain(
  symbol: string,
  options?: {
    contract_type?: 'call' | 'put'
    expiration_date_gte?: string
    expiration_date_lte?: string
    strike_price_gte?: number
    strike_price_lte?: number
    limit?: number
  }
): Promise<OptionsChainResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    console.error('[API] Options chain fetch failed: API key not configured')
    return {
      success: false,
      underlying_symbol: symbol,
      underlying_price: 0,
      results: [],
      error: createError('API_KEY_MISSING', 'API key is not configured', symbol),
    }
  }

  const normalizedSymbol = symbol.replace('I:', '').toUpperCase()

  try {
    const params = new URLSearchParams({
      apiKey,
      limit: String(options?.limit || 250),
    })

    if (options?.contract_type) {
      params.set('contract_type', options.contract_type)
    }
    if (options?.expiration_date_gte) {
      params.set('expiration_date.gte', options.expiration_date_gte)
    }
    if (options?.expiration_date_lte) {
      params.set('expiration_date.lte', options.expiration_date_lte)
    }
    if (options?.strike_price_gte) {
      params.set('strike_price.gte', String(options.strike_price_gte))
    }
    if (options?.strike_price_lte) {
      params.set('strike_price.lte', String(options.strike_price_lte))
    }

    const url = `${BASE_URL}/v3/snapshot/options/${normalizedSymbol}?${params.toString()}`

    const response = await fetch(url, {
      next: { revalidate: getCacheRevalidation() },
    })

    if (response.status === 404) {
      console.error(`[API] Options chain not found for ${symbol}`)
      return {
        success: false,
        underlying_symbol: symbol,
        underlying_price: 0,
        results: [],
        error: createError('NOT_FOUND', `No options data found for ${symbol}`, symbol, 'options_chain'),
      }
    }

    if (response.status === 429) {
      console.error('[API] Rate limited on options chain request')
      return {
        success: false,
        underlying_symbol: symbol,
        underlying_price: 0,
        results: [],
        error: createError('RATE_LIMITED', 'API rate limit exceeded', symbol, 'options_chain'),
      }
    }

    if (!response.ok) {
      console.error(`[API] Options chain fetch failed: ${response.status}`)
      return {
        success: false,
        underlying_symbol: symbol,
        underlying_price: 0,
        results: [],
        error: createError('FETCH_FAILED', `HTTP ${response.status}`, symbol, 'options_chain'),
      }
    }

    const data = await response.json()

    if (!data.results || !Array.isArray(data.results)) {
      return {
        success: true,
        underlying_symbol: symbol,
        underlying_price: data.underlying_asset?.price || 0,
        results: [],
      }
    }

    const snapshots: OptionSnapshot[] = data.results.map((item: any) => ({
      contract: {
        ticker: item.details?.ticker || '',
        underlying_ticker: item.details?.underlying_ticker || symbol,
        contract_type: item.details?.contract_type || 'call',
        strike_price: item.details?.strike_price || 0,
        expiration_date: item.details?.expiration_date || '',
        shares_per_contract: item.details?.shares_per_contract || 100,
        exercise_style: item.details?.exercise_style || 'american',
      },
      quote: {
        bid: item.last_quote?.bid || 0,
        bid_size: item.last_quote?.bid_size || 0,
        ask: item.last_quote?.ask || 0,
        ask_size: item.last_quote?.ask_size || 0,
        last_price: item.last_trade?.price || 0,
        last_size: item.last_trade?.size || 0,
        midpoint: item.last_quote?.midpoint || ((item.last_quote?.bid || 0) + (item.last_quote?.ask || 0)) / 2,
      },
      day: {
        open: item.day?.open || 0,
        high: item.day?.high || 0,
        low: item.day?.low || 0,
        close: item.day?.close || 0,
        volume: item.day?.volume || 0,
        vwap: item.day?.vwap || 0,
        change: item.day?.change || 0,
        change_percent: item.day?.change_percent || 0,
        previous_close: item.day?.previous_close || 0,
      },
      greeks: {
        delta: item.greeks?.delta || 0,
        gamma: item.greeks?.gamma || 0,
        theta: item.greeks?.theta || 0,
        vega: item.greeks?.vega || 0,
        rho: item.greeks?.rho || 0,
      },
      implied_volatility: item.implied_volatility || 0,
      open_interest: item.open_interest || 0,
      break_even_price: item.break_even_price || 0,
      underlying_price: item.underlying_asset?.price || data.underlying_asset?.price || 0,
      last_updated: item.last_updated || new Date().toISOString(),
    }))

    return {
      success: true,
      underlying_symbol: symbol,
      underlying_price: data.underlying_asset?.price || 0,
      results: snapshots,
    }
  } catch (error) {
    console.error('[API] Options chain fetch error:', error instanceof Error ? error.message : 'Unknown error')
    return {
      success: false,
      underlying_symbol: symbol,
      underlying_price: 0,
      results: [],
      error: createError('FETCH_FAILED', 'Failed to fetch options chain', symbol, 'options_chain'),
    }
  }
}

// -----------------------------------------------------------------------------
// API Functions - Intraday Bars
// -----------------------------------------------------------------------------

export async function fetchIntradayBars(
  symbol: string,
  interval: IntradayInterval = '5m',
  options?: {
    from?: Date
    to?: Date
    limit?: number
  }
): Promise<IntradayBarsResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    console.error('[API] Intraday bars fetch failed: API key not configured')
    return {
      success: false,
      symbol,
      interval,
      results: [],
      error: createError('API_KEY_MISSING', 'API key is not configured', symbol),
    }
  }

  const normalizedSymbol = normalizeSymbol(symbol)
  const intervalConfig = INTERVAL_MAP[interval]

  const to = options?.to || new Date()
  const from = options?.from || new Date(to.getTime() - 24 * 60 * 60 * 1000) // Default: last 24 hours

  try {
    const url = `${BASE_URL}/v2/aggs/ticker/${normalizedSymbol}/range/${intervalConfig.multiplier}/${intervalConfig.timespan}/${formatDate(from)}/${formatDate(to)}?adjusted=true&sort=asc&limit=${options?.limit || 5000}&apiKey=${apiKey}`

    const response = await fetch(url, {
      next: { revalidate: isMarketOpen() ? 60 : 300 },
    })

    if (response.status === 404) {
      return {
        success: false,
        symbol,
        interval,
        results: [],
        error: createError('NOT_FOUND', `No intraday data for ${symbol}`, symbol, 'intraday_bars'),
      }
    }

    if (response.status === 429) {
      return {
        success: false,
        symbol,
        interval,
        results: [],
        error: createError('RATE_LIMITED', 'API rate limit exceeded', symbol, 'intraday_bars'),
      }
    }

    if (!response.ok) {
      console.error(`[API] Intraday bars fetch failed: ${response.status}`)
      return {
        success: false,
        symbol,
        interval,
        results: [],
        error: createError('FETCH_FAILED', `HTTP ${response.status}`, symbol, 'intraday_bars'),
      }
    }

    const data = await response.json()

    if (!data.results || !Array.isArray(data.results)) {
      return {
        success: true,
        symbol,
        interval,
        results: [],
      }
    }

    const bars: IntradayBar[] = data.results.map((bar: any) => ({
      timestamp: new Date(bar.t).toISOString(),
      open: bar.o || 0,
      high: bar.h || 0,
      low: bar.l || 0,
      close: bar.c || 0,
      volume: bar.v || 0,
      vwap: bar.vw || 0,
      transactions: bar.n || 0,
    }))

    return {
      success: true,
      symbol,
      interval,
      results: bars,
    }
  } catch (error) {
    console.error('[API] Intraday bars fetch error:', error instanceof Error ? error.message : 'Unknown error')
    return {
      success: false,
      symbol,
      interval,
      results: [],
      error: createError('FETCH_FAILED', 'Failed to fetch intraday bars', symbol, 'intraday_bars'),
    }
  }
}

// -----------------------------------------------------------------------------
// API Functions - Ticker Snapshot
// -----------------------------------------------------------------------------

export async function fetchTickerSnapshot(symbol: string): Promise<SnapshotResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      success: false,
      ticker: null,
      error: createError('API_KEY_MISSING', 'API key is not configured', symbol),
    }
  }

  const normalizedSymbol = normalizeSymbol(symbol)

  try {
    const url = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${normalizedSymbol}?apiKey=${apiKey}`

    const response = await fetch(url, {
      next: { revalidate: isMarketOpen() ? 30 : 300 },
    })

    if (!response.ok) {
      return {
        success: false,
        ticker: null,
        error: createError('FETCH_FAILED', `HTTP ${response.status}`, symbol, 'snapshot'),
      }
    }

    const data = await response.json()

    if (!data.ticker) {
      return {
        success: false,
        ticker: null,
        error: createError('INVALID_RESPONSE', 'No ticker data in response', symbol, 'snapshot'),
      }
    }

    return {
      success: true,
      ticker: {
        ticker: data.ticker.ticker,
        todaysChange: data.ticker.todaysChange || 0,
        todaysChangePerc: data.ticker.todaysChangePerc || 0,
        updated: data.ticker.updated || Date.now(),
        day: {
          open: data.ticker.day?.o || 0,
          high: data.ticker.day?.h || 0,
          low: data.ticker.day?.l || 0,
          close: data.ticker.day?.c || 0,
          volume: data.ticker.day?.v || 0,
          vwap: data.ticker.day?.vw || 0,
        },
        prevDay: {
          open: data.ticker.prevDay?.o || 0,
          high: data.ticker.prevDay?.h || 0,
          low: data.ticker.prevDay?.l || 0,
          close: data.ticker.prevDay?.c || 0,
          volume: data.ticker.prevDay?.v || 0,
          vwap: data.ticker.prevDay?.vw || 0,
        },
        min: {
          open: data.ticker.min?.o || 0,
          high: data.ticker.min?.h || 0,
          low: data.ticker.min?.l || 0,
          close: data.ticker.min?.c || 0,
          volume: data.ticker.min?.v || 0,
          vwap: data.ticker.min?.vw || 0,
          accumulated_volume: data.ticker.min?.av || 0,
        },
      },
    }
  } catch (error) {
    return {
      success: false,
      ticker: null,
      error: createError('FETCH_FAILED', 'Failed to fetch snapshot', symbol, 'snapshot'),
    }
  }
}

// -----------------------------------------------------------------------------
// API Functions - Universal Snapshot
// -----------------------------------------------------------------------------

export interface UniversalSnapshotOptions {
  symbols: string[]
  assetClass?: AssetClass
  includeOtc?: boolean
}

/**
 * Fetches universal snapshot data for multiple symbols across asset classes.
 * Uses the Polygon Universal Snapshot endpoint.
 *
 * @param options - Configuration for the snapshot request
 * @returns Promise with snapshot results and entitlement info
 */
export async function fetchUniversalSnapshot(
  options: UniversalSnapshotOptions
): Promise<UniversalSnapshotResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      success: false,
      results: [],
      entitlement: { delayed: true, delayMinutes: 15, source: 'delayed' },
      error: createError('API_KEY_MISSING', 'API key is not configured'),
    }
  }

  const { symbols, assetClass = 'stocks', includeOtc = false } = options

  // Normalize symbols based on asset class
  const normalizedSymbols = symbols.map((s) =>
    assetClass === 'indices' ? normalizeSymbol(s) : s.toUpperCase()
  )

  try {
    const params = new URLSearchParams({
      'ticker.any_of': normalizedSymbols.join(','),
      apiKey,
    })

    if (!includeOtc) {
      params.append('include_otc', 'false')
    }

    const url = `${BASE_URL}/v3/snapshot?${params.toString()}`

    const response = await fetch(url, {
      next: { revalidate: isMarketOpen() ? 15 : 300 },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        results: [],
        entitlement: { delayed: true, delayMinutes: 15, source: 'delayed' },
        error: createError('FETCH_FAILED', `HTTP ${response.status}: ${errorText}`, undefined, 'universal-snapshot'),
      }
    }

    const data = await response.json()

    // Parse entitlement from response headers or data
    const entitlement = parseEntitlement(response, data)

    const results: UniversalSnapshotItem[] = (data.results || []).map((item: any) => ({
      ticker: item.ticker,
      name: item.name,
      market: item.market,
      locale: item.locale,
      type: item.type,
      currency_name: item.currency_name,
      last_updated_utc: item.last_updated_utc,
      session: item.session
        ? {
            open: item.session.open || 0,
            high: item.session.high || 0,
            low: item.session.low || 0,
            close: item.session.close || 0,
            volume: item.session.volume || 0,
            change: item.session.change || 0,
            change_percent: item.session.change_percent || 0,
            previous_close: item.session.previous_close || 0,
            early_trading_change: item.session.early_trading_change,
            early_trading_change_percent: item.session.early_trading_change_percent,
            late_trading_change: item.session.late_trading_change,
            late_trading_change_percent: item.session.late_trading_change_percent,
          }
        : undefined,
      last_quote: item.last_quote
        ? {
            bid: item.last_quote.bid || 0,
            bid_size: item.last_quote.bid_size || 0,
            ask: item.last_quote.ask || 0,
            ask_size: item.last_quote.ask_size || 0,
            last_updated: item.last_quote.last_updated || 0,
          }
        : undefined,
      last_trade: item.last_trade
        ? {
            price: item.last_trade.price || 0,
            size: item.last_trade.size || 0,
            exchange: item.last_trade.exchange || 0,
            conditions: item.last_trade.conditions,
            timestamp: item.last_trade.timestamp || 0,
          }
        : undefined,
      fmv: item.fmv,
      underlying_asset: item.underlying_asset,
      greeks: item.greeks,
      implied_volatility: item.implied_volatility,
      open_interest: item.open_interest,
      break_even_price: item.break_even_price,
    }))

    return {
      success: true,
      results,
      entitlement,
      request_id: data.request_id,
    }
  } catch (error) {
    return {
      success: false,
      results: [],
      entitlement: { delayed: true, delayMinutes: 15, source: 'delayed' },
      error: createError('FETCH_FAILED', 'Failed to fetch universal snapshot', undefined, 'universal-snapshot'),
    }
  }
}

// -----------------------------------------------------------------------------
// API Functions - Index Snapshot
// -----------------------------------------------------------------------------

/**
 * Fetches snapshot data specifically for market indices.
 * Uses the Polygon Indices Snapshot endpoint with proper I: prefix handling.
 *
 * @param symbols - Array of index symbols (SPX, NDX, etc.)
 * @returns Promise with index snapshot results and entitlement info
 */
export async function fetchIndexSnapshot(symbols: string[]): Promise<IndexSnapshotResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      success: false,
      results: [],
      entitlement: { delayed: true, delayMinutes: 15, source: 'delayed' },
      error: createError('API_KEY_MISSING', 'API key is not configured'),
    }
  }

  // Normalize symbols to include I: prefix for indices
  const normalizedSymbols = symbols.map((s) => normalizeSymbol(s))

  try {
    const params = new URLSearchParams({
      'ticker.any_of': normalizedSymbols.join(','),
      apiKey,
    })

    const url = `${BASE_URL}/v3/snapshot/indices?${params.toString()}`

    const response = await fetch(url, {
      next: { revalidate: isMarketOpen() ? 60 : 300 },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        results: [],
        entitlement: { delayed: true, delayMinutes: 15, source: 'delayed' },
        error: createError('FETCH_FAILED', `HTTP ${response.status}: ${errorText}`, undefined, 'index-snapshot'),
      }
    }

    const data = await response.json()

    // Parse entitlement - index data may have different delay based on subscription
    const entitlement = parseEntitlement(response, data)

    const results: IndexSnapshotItem[] = (data.results || []).map((item: any) => ({
      ticker: item.ticker,
      name: item.name || '',
      market: item.market || 'indices',
      locale: item.locale || 'us',
      type: 'indices' as const,
      value: item.value || item.session?.close || 0,
      session: {
        open: item.session?.open || 0,
        high: item.session?.high || 0,
        low: item.session?.low || 0,
        close: item.session?.close || 0,
        change: item.session?.change || 0,
        change_percent: item.session?.change_percent || 0,
        previous_close: item.session?.previous_close || 0,
      },
      last_updated: item.last_updated || Date.now(),
    }))

    return {
      success: true,
      results,
      entitlement,
      request_id: data.request_id,
    }
  } catch (error) {
    return {
      success: false,
      results: [],
      entitlement: { delayed: true, delayMinutes: 15, source: 'delayed' },
      error: createError('FETCH_FAILED', 'Failed to fetch index snapshot', undefined, 'index-snapshot'),
    }
  }
}

/**
 * Parses entitlement/delay information from API response.
 * Different Polygon plans have different data freshness:
 * - Basic: 15-minute delayed
 * - Stocks Starter: Real-time stocks, delayed options
 * - Options: Real-time options
 * - Indices: May be delayed depending on exchange agreements
 */
function parseEntitlement(response: Response, data: any): DataEntitlement {
  // Check for delay indicator in response headers
  const delayHeader = response.headers.get('x-polygon-delayed')
  const entitlementHeader = response.headers.get('x-polygon-entitlement')

  // Check data payload for delay status
  const isDelayed = data.delayed === true || delayHeader === 'true'
  const delayMinutes = data.delay_minutes || (isDelayed ? 15 : 0)

  // Determine source based on delay status
  let source: DataEntitlement['source'] = 'realtime'
  if (isDelayed) {
    source = delayMinutes >= 1440 ? 'eod' : 'delayed' // 1440 = end of day
  }

  return {
    delayed: isDelayed,
    delayMinutes,
    entitlementId: entitlementHeader || undefined,
    source,
  }
}

// -----------------------------------------------------------------------------
// API Functions - Daily Bars (existing, updated with better error handling)
// -----------------------------------------------------------------------------

export async function fetchDailyBars(symbol: string, days = 252): Promise<DailyBar[]> {
  const apiKey = getApiKey()

  if (!apiKey) {
    console.error('[API] Daily bars fetch failed: API key not configured')
    throw new Error('MASSIVE_API_KEY is not configured')
  }

  const normalizedSymbol = normalizeSymbol(symbol)

  const toDate = new Date()
  const fromDate = new Date()
  fromDate.setDate(toDate.getDate() - days * 1.5)

  const fromStr = formatDate(fromDate)
  const toStr = formatDate(toDate)

  try {
    const url = `${BASE_URL}/v2/aggs/ticker/${normalizedSymbol}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=50000&apiKey=${apiKey}`

    const response = await fetch(url, {
      next: { revalidate: getCacheRevalidation() },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] Daily bars error for ${symbol}: ${response.status} - ${errorText}`)
      throw new Error(`Failed to fetch data for ${symbol}: ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.results || data.results.length === 0) {
      throw new Error(`No data returned for ${symbol}`)
    }

    const bars: DailyBar[] = data.results.map((bar: any) => ({
      date: new Date(bar.t).toISOString().split('T')[0],
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v || 0,
    }))

    return bars.slice(0, days)
  } catch (error) {
    console.error(`[API] Error fetching ${symbol}:`, error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}

// -----------------------------------------------------------------------------
// Computation Functions (existing, preserved)
// -----------------------------------------------------------------------------

export function computeEnhancedMetrics(
  bars: DailyBar[],
  lookback: number,
  basis: 'close' | 'intraday'
): HeatmapMetrics[] {
  if (bars.length < lookback) {
    return bars.map(() => ({
      daysSinceHigh: lookback,
      daysSinceLow: lookback,
      pctFromHigh: 0,
      pctFromLow: 0,
      rollingHigh: 0,
      rollingLow: 0,
      currentValue: 0,
    }))
  }

  const metrics: HeatmapMetrics[] = []

  for (let i = 0; i < bars.length; i++) {
    const startIdx = Math.max(0, i - lookback + 1)
    const window = bars.slice(startIdx, i + 1)

    const rollingHigh = Math.max(...window.map((b) => b.high))
    const rollingLow = Math.min(...window.map((b) => b.low))

    const currentValue = basis === 'close' ? bars[i].close : bars[i].high
    const currentLowValue = basis === 'close' ? bars[i].close : bars[i].low

    // Calculate days since high
    let daysSinceHigh = 0
    if (basis === 'close' ? bars[i].close < rollingHigh : bars[i].high < rollingHigh) {
      for (let j = i - 1; j >= startIdx; j--) {
        daysSinceHigh++
        if (basis === 'close' ? bars[j].close >= rollingHigh : bars[j].high >= rollingHigh) {
          break
        }
      }
    }

    // Calculate days since low
    let daysSinceLow = 0
    if (basis === 'close' ? bars[i].close > rollingLow : bars[i].low > rollingLow) {
      for (let j = i - 1; j >= startIdx; j--) {
        daysSinceLow++
        if (basis === 'close' ? bars[j].close <= rollingLow : bars[j].low <= rollingLow) {
          break
        }
      }
    }

    const pctFromHigh = ((rollingHigh - currentValue) / rollingHigh) * 100
    const pctFromLow = ((currentLowValue - rollingLow) / rollingLow) * 100

    metrics.push({
      daysSinceHigh: Math.min(daysSinceHigh, lookback),
      daysSinceLow: Math.min(daysSinceLow, lookback),
      pctFromHigh,
      pctFromLow,
      rollingHigh,
      rollingLow,
      currentValue,
    })
  }

  return metrics
}

export function computeHeatmap(bars: DailyBar[], lookback: number, basis: 'close' | 'intraday'): number[] {
  if (bars.length < lookback) {
    return new Array(bars.length).fill(lookback)
  }

  // 'intraday' uses daily high, 'close' uses closing price
  const values = bars.map((bar) => (basis === 'intraday' ? bar.high : bar.close))
  const daysSince: number[] = []

  for (let i = 0; i < bars.length; i++) {
    const startIdx = Math.max(0, i - lookback + 1)
    const rollingMax = Math.max(...values.slice(startIdx, i + 1))
    const currentValue = values[i]

    if (currentValue >= rollingMax) {
      daysSince.push(0)
    } else {
      let days = 1
      for (let j = i - 1; j >= startIdx && days < lookback; j--) {
        if (values[j] >= rollingMax) {
          break
        }
        days++
      }
      daysSince.push(Math.min(days, lookback))
    }
  }

  return daysSince
}

// -----------------------------------------------------------------------------
// Mock/Fallback Data (existing, preserved)
// -----------------------------------------------------------------------------

export function getMockHeatmapData(symbols: string[], days: number): HeatmapData {
  const dates: string[] = []
  const today = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    dates.push(date.toISOString().split('T')[0])
  }

  const data: Record<string, number[]> = {}
  symbols.forEach((symbol) => {
    data[symbol] = Array.from({ length: days }, () => Math.floor(Math.random() * 64))
  })

  return { dates, data }
}

// -----------------------------------------------------------------------------
// Sector ETF Mapping
// -----------------------------------------------------------------------------

export const SECTOR_ETFS = {
  XLK: 'Technology',
  XLF: 'Financials',
  XLV: 'Healthcare',
  XLE: 'Energy',
  XLI: 'Industrials',
  XLP: 'Consumer Staples',
  XLY: 'Consumer Discretionary',
  XLB: 'Materials',
  XLU: 'Utilities',
  XLRE: 'Real Estate',
  XLC: 'Communication Services',
} as const

export type SectorETF = keyof typeof SECTOR_ETFS

// Stock to sector mapping (common large caps)
export const STOCK_SECTOR_MAP: Record<string, SectorETF> = {
  // Technology
  AAPL: 'XLK', MSFT: 'XLK', NVDA: 'XLK', AVGO: 'XLK', AMD: 'XLK', INTC: 'XLK',
  CRM: 'XLK', ORCL: 'XLK', ADBE: 'XLK', CSCO: 'XLK', IBM: 'XLK', TXN: 'XLK',
  QCOM: 'XLK', MU: 'XLK', AMAT: 'XLK', LRCX: 'XLK', KLAC: 'XLK', MRVL: 'XLK',
  // Financials
  JPM: 'XLF', BAC: 'XLF', WFC: 'XLF', GS: 'XLF', MS: 'XLF', C: 'XLF',
  AXP: 'XLF', BLK: 'XLF', SCHW: 'XLF', USB: 'XLF', PNC: 'XLF', BK: 'XLF',
  // Healthcare
  UNH: 'XLV', JNJ: 'XLV', LLY: 'XLV', PFE: 'XLV', MRK: 'XLV', ABBV: 'XLV',
  TMO: 'XLV', ABT: 'XLV', DHR: 'XLV', BMY: 'XLV', AMGN: 'XLV', GILD: 'XLV',
  // Energy
  XOM: 'XLE', CVX: 'XLE', COP: 'XLE', SLB: 'XLE', EOG: 'XLE', OXY: 'XLE',
  PSX: 'XLE', MPC: 'XLE', VLO: 'XLE', HAL: 'XLE', DVN: 'XLE', HES: 'XLE',
  // Consumer Discretionary
  AMZN: 'XLY', TSLA: 'XLY', HD: 'XLY', MCD: 'XLY', NKE: 'XLY', SBUX: 'XLY',
  LOW: 'XLY', TJX: 'XLY', BKNG: 'XLY', CMG: 'XLY', MAR: 'XLY', ORLY: 'XLY',
  // Communication Services
  GOOGL: 'XLC', GOOG: 'XLC', META: 'XLC', NFLX: 'XLC', DIS: 'XLC', CMCSA: 'XLC',
  VZ: 'XLC', TMUS: 'XLC', T: 'XLC', CHTR: 'XLC', EA: 'XLC', TTWO: 'XLC',
  // Industrials
  CAT: 'XLI', GE: 'XLI', HON: 'XLI', UNP: 'XLI', BA: 'XLI', RTX: 'XLI',
  DE: 'XLI', LMT: 'XLI', MMM: 'XLI', UPS: 'XLI', FDX: 'XLI', WM: 'XLI',
  // Consumer Staples
  PG: 'XLP', KO: 'XLP', PEP: 'XLP', COST: 'XLP', WMT: 'XLP', PM: 'XLP',
  MO: 'XLP', CL: 'XLP', MDLZ: 'XLP', KHC: 'XLP', GIS: 'XLP', SYY: 'XLP',
  // Materials
  LIN: 'XLB', APD: 'XLB', SHW: 'XLB', ECL: 'XLB', FCX: 'XLB', NEM: 'XLB',
  NUE: 'XLB', VMC: 'XLB', MLM: 'XLB', DOW: 'XLB', DD: 'XLB', PPG: 'XLB',
  // Utilities
  NEE: 'XLU', DUK: 'XLU', SO: 'XLU', D: 'XLU', AEP: 'XLU', EXC: 'XLU',
  SRE: 'XLU', XEL: 'XLU', WEC: 'XLU', ED: 'XLU', PEG: 'XLU', ES: 'XLU',
  // Real Estate
  PLD: 'XLRE', AMT: 'XLRE', EQIX: 'XLRE', PSA: 'XLRE', CCI: 'XLRE', O: 'XLRE',
  SPG: 'XLRE', WELL: 'XLRE', DLR: 'XLRE', AVB: 'XLRE', EQR: 'XLRE', VTR: 'XLRE',
}

// -----------------------------------------------------------------------------
// Sector Performance Types
// -----------------------------------------------------------------------------

export interface SectorPerformance {
  symbol: SectorETF
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  avgVolume?: number
  relativeStrength: number // vs SPY
  signal: 'strong' | 'neutral' | 'weak'
}

export interface SectorPerformanceResponse {
  success: boolean
  sectors: SectorPerformance[]
  spyPrice: number
  spyChangePercent: number
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Movers Types
// -----------------------------------------------------------------------------

export interface Mover {
  ticker: string
  price: number
  change: number
  changePercent: number
  volume: number
  direction: 'up' | 'down'
}

export interface MoversResponse {
  success: boolean
  gainers: Mover[]
  losers: Mover[]
  mostActive: Mover[]
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Risk On/Off Types
// -----------------------------------------------------------------------------

export type RiskRegime = 'risk_on' | 'risk_off' | 'neutral' | 'mixed'

export interface RiskMetrics {
  regime: RiskRegime
  confidence: number // 0-100
  signals: {
    spyTrend: 'bullish' | 'bearish' | 'neutral'
    qqqTrend: 'bullish' | 'bearish' | 'neutral'
    iwmTrend: 'bullish' | 'bearish' | 'neutral'
    vixLevel: 'low' | 'elevated' | 'high' | 'extreme'
    breadth: 'healthy' | 'mixed' | 'poor'
  }
  details: {
    spyPctFromHigh: number
    qqqPctFromHigh: number
    iwmPctFromHigh: number
    vixValue: number
    qqqVsIwm: number // QQQ outperformance vs IWM (growth vs value)
  }
}

export interface RiskRegimeResponse {
  success: boolean
  metrics: RiskMetrics | null
  error?: ApiError
}

// -----------------------------------------------------------------------------
// Relative Strength Types
// -----------------------------------------------------------------------------

export interface RelativeStrengthMetrics {
  symbol: string
  vsSpyRS: number // Relative strength vs SPY
  vsSectorRS: number // Relative strength vs sector ETF
  sectorETF: SectorETF | null
  spyCorrelation: number // Rolling correlation with SPY
  beta: number // Beta vs SPY
  rsRating: 'leader' | 'laggard' | 'inline'
}

export interface RelativeStrengthResponse {
  success: boolean
  metrics: RelativeStrengthMetrics | null
  spyBars: DailyBar[]
  sectorBars: DailyBar[]
  symbolBars: DailyBar[]
  error?: ApiError
}

// -----------------------------------------------------------------------------
// API Functions - Sector Performance
// -----------------------------------------------------------------------------

export async function fetchSectorPerformance(): Promise<SectorPerformanceResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      success: false,
      sectors: [],
      spyPrice: 0,
      spyChangePercent: 0,
      error: createError('API_KEY_MISSING', 'API key is not configured'),
    }
  }

  try {
    const sectorSymbols = Object.keys(SECTOR_ETFS)
    const allSymbols = ['SPY', ...sectorSymbols]

    // Fetch snapshots for all sector ETFs + SPY
    const response = await fetchUniversalSnapshot({
      symbols: allSymbols,
      assetClass: 'stocks',
    })

    if (!response.success) {
      return {
        success: false,
        sectors: [],
        spyPrice: 0,
        spyChangePercent: 0,
        error: response.error,
      }
    }

    const snapshots = new Map(response.results.map((s) => [s.ticker, s]))
    const spySnapshot = snapshots.get('SPY')

    if (!spySnapshot?.session) {
      return {
        success: false,
        sectors: [],
        spyPrice: 0,
        spyChangePercent: 0,
        error: createError('INVALID_RESPONSE', 'SPY data not available'),
      }
    }

    const spyChangePercent = spySnapshot.session.change_percent

    const sectors: SectorPerformance[] = sectorSymbols
      .map((symbol) => {
        const snapshot = snapshots.get(symbol)
        if (!snapshot?.session) return null

        const changePercent = snapshot.session.change_percent
        const relativeStrength = changePercent - spyChangePercent

        let signal: SectorPerformance['signal'] = 'neutral'
        if (relativeStrength > 1) signal = 'strong'
        else if (relativeStrength < -1) signal = 'weak'

        return {
          symbol: symbol as SectorETF,
          name: SECTOR_ETFS[symbol as SectorETF],
          price: snapshot.session.close,
          change: snapshot.session.change,
          changePercent,
          volume: snapshot.session.volume,
          relativeStrength,
          signal,
        }
      })
      .filter((s): s is SectorPerformance => s !== null)
      .sort((a, b) => b.relativeStrength - a.relativeStrength)

    return {
      success: true,
      sectors,
      spyPrice: spySnapshot.session.close,
      spyChangePercent,
    }
  } catch {
    return {
      success: false,
      sectors: [],
      spyPrice: 0,
      spyChangePercent: 0,
      error: createError('FETCH_FAILED', 'Failed to fetch sector performance'),
    }
  }
}

// -----------------------------------------------------------------------------
// API Functions - Movers (Gainers/Losers/Most Active)
// -----------------------------------------------------------------------------

export async function fetchMovers(
  direction: 'gainers' | 'losers' = 'gainers'
): Promise<MoversResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      success: false,
      gainers: [],
      losers: [],
      mostActive: [],
      error: createError('API_KEY_MISSING', 'API key is not configured'),
    }
  }

  try {
    // Use the snapshot gainers/losers endpoint
    const url = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/${direction}?apiKey=${apiKey}`

    const response = await fetch(url, {
      next: { revalidate: isMarketOpen() ? 60 : 300 },
    })

    if (!response.ok) {
      return {
        success: false,
        gainers: [],
        losers: [],
        mostActive: [],
        error: createError('FETCH_FAILED', `HTTP ${response.status}`),
      }
    }

    const data = await response.json()

    if (!data.tickers || !Array.isArray(data.tickers)) {
      return {
        success: true,
        gainers: [],
        losers: [],
        mostActive: [],
      }
    }

    const movers: Mover[] = data.tickers.slice(0, 20).map((t: any) => ({
      ticker: t.ticker,
      price: t.day?.c || t.prevDay?.c || 0,
      change: t.todaysChange || 0,
      changePercent: t.todaysChangePerc || 0,
      volume: t.day?.v || 0,
      direction: (t.todaysChangePerc || 0) >= 0 ? 'up' : 'down',
    }))

    // Sort for most active by volume
    const mostActive = [...movers].sort((a, b) => b.volume - a.volume).slice(0, 10)

    return {
      success: true,
      gainers: direction === 'gainers' ? movers : [],
      losers: direction === 'losers' ? movers : [],
      mostActive,
    }
  } catch {
    return {
      success: false,
      gainers: [],
      losers: [],
      mostActive: [],
      error: createError('FETCH_FAILED', 'Failed to fetch movers'),
    }
  }
}

// Combined function to fetch both gainers and losers
export async function fetchAllMovers(): Promise<MoversResponse> {
  const [gainersRes, losersRes] = await Promise.all([
    fetchMovers('gainers'),
    fetchMovers('losers'),
  ])

  return {
    success: gainersRes.success && losersRes.success,
    gainers: gainersRes.gainers,
    losers: losersRes.losers,
    mostActive: gainersRes.mostActive.length > 0 ? gainersRes.mostActive : losersRes.mostActive,
    error: gainersRes.error || losersRes.error,
  }
}

// -----------------------------------------------------------------------------
// API Functions - Risk On/Off Classifier
// -----------------------------------------------------------------------------

export async function classifyRiskRegime(): Promise<RiskRegimeResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      success: false,
      metrics: null,
      error: createError('API_KEY_MISSING', 'API key is not configured'),
    }
  }

  try {
    // Fetch 63-day data for SPY, QQQ, IWM, VXX (VIX proxy)
    const lookback = 63
    const [spyBars, qqqBars, iwmBars, vxxBars] = await Promise.all([
      fetchDailyBars('SPY', lookback),
      fetchDailyBars('QQQ', lookback),
      fetchDailyBars('IWM', lookback),
      fetchDailyBars('VXX', lookback).catch(() => [] as DailyBar[]), // VXX may not be available
    ])

    if (spyBars.length < 21 || qqqBars.length < 21 || iwmBars.length < 21) {
      return {
        success: false,
        metrics: null,
        error: createError('INVALID_RESPONSE', 'Insufficient data for risk analysis'),
      }
    }

    // Compute rolling high metrics
    const spyMetrics = computeEnhancedMetrics([...spyBars].reverse(), 21, 'close')
    const qqqMetrics = computeEnhancedMetrics([...qqqBars].reverse(), 21, 'close')
    const iwmMetrics = computeEnhancedMetrics([...iwmBars].reverse(), 21, 'close')

    const latestSpy = spyMetrics[spyMetrics.length - 1]
    const latestQqq = qqqMetrics[qqqMetrics.length - 1]
    const latestIwm = iwmMetrics[iwmMetrics.length - 1]

    // Calculate trends
    const classifyTrend = (pctFromHigh: number): 'bullish' | 'bearish' | 'neutral' => {
      if (pctFromHigh < 2) return 'bullish'
      if (pctFromHigh > 5) return 'bearish'
      return 'neutral'
    }

    const spyTrend = classifyTrend(latestSpy.pctFromHigh)
    const qqqTrend = classifyTrend(latestQqq.pctFromHigh)
    const iwmTrend = classifyTrend(latestIwm.pctFromHigh)

    // VIX level classification (using VXX as proxy)
    let vixValue = 20 // Default if VXX not available
    let vixLevel: RiskMetrics['signals']['vixLevel'] = 'low'

    if (vxxBars.length > 0) {
      vixValue = vxxBars[0].close // Most recent
      if (vixValue < 15) vixLevel = 'low'
      else if (vixValue < 20) vixLevel = 'elevated'
      else if (vixValue < 30) vixLevel = 'high'
      else vixLevel = 'extreme'
    }

    // QQQ vs IWM relative performance (growth vs value)
    const qqqReturn = (qqqBars[0].close - qqqBars[qqqBars.length - 1].close) / qqqBars[qqqBars.length - 1].close * 100
    const iwmReturn = (iwmBars[0].close - iwmBars[iwmBars.length - 1].close) / iwmBars[iwmBars.length - 1].close * 100
    const qqqVsIwm = qqqReturn - iwmReturn

    // Breadth signal (simplified - based on relative moves)
    let breadth: RiskMetrics['signals']['breadth'] = 'mixed'
    if (spyTrend === 'bullish' && (qqqTrend === 'bullish' || iwmTrend === 'bullish')) {
      breadth = 'healthy'
    } else if (spyTrend === 'bearish' && (qqqTrend === 'bearish' || iwmTrend === 'bearish')) {
      breadth = 'poor'
    }

    // Determine regime
    let regime: RiskRegime = 'neutral'
    let confidence = 50

    const bullishSignals = [
      spyTrend === 'bullish',
      qqqTrend === 'bullish',
      iwmTrend === 'bullish',
      vixLevel === 'low',
      breadth === 'healthy',
    ].filter(Boolean).length

    const bearishSignals = [
      spyTrend === 'bearish',
      qqqTrend === 'bearish',
      iwmTrend === 'bearish',
      vixLevel === 'high' || vixLevel === 'extreme',
      breadth === 'poor',
    ].filter(Boolean).length

    if (bullishSignals >= 4) {
      regime = 'risk_on'
      confidence = 70 + (bullishSignals - 4) * 10
    } else if (bearishSignals >= 4) {
      regime = 'risk_off'
      confidence = 70 + (bearishSignals - 4) * 10
    } else if (bullishSignals >= 3 && bearishSignals <= 1) {
      regime = 'risk_on'
      confidence = 60
    } else if (bearishSignals >= 3 && bullishSignals <= 1) {
      regime = 'risk_off'
      confidence = 60
    } else {
      regime = 'mixed'
      confidence = 50
    }

    return {
      success: true,
      metrics: {
        regime,
        confidence: Math.min(confidence, 95),
        signals: {
          spyTrend,
          qqqTrend,
          iwmTrend,
          vixLevel,
          breadth,
        },
        details: {
          spyPctFromHigh: latestSpy.pctFromHigh,
          qqqPctFromHigh: latestQqq.pctFromHigh,
          iwmPctFromHigh: latestIwm.pctFromHigh,
          vixValue,
          qqqVsIwm,
        },
      },
    }
  } catch {
    return {
      success: false,
      metrics: null,
      error: createError('FETCH_FAILED', 'Failed to classify risk regime'),
    }
  }
}

// -----------------------------------------------------------------------------
// API Functions - Relative Strength
// -----------------------------------------------------------------------------

export async function fetchRelativeStrength(
  symbol: string,
  lookback: number = 63
): Promise<RelativeStrengthResponse> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      success: false,
      metrics: null,
      spyBars: [],
      sectorBars: [],
      symbolBars: [],
      error: createError('API_KEY_MISSING', 'API key is not configured'),
    }
  }

  try {
    const normalizedSymbol = symbol.toUpperCase()
    const sectorETF = STOCK_SECTOR_MAP[normalizedSymbol] || null

    // Fetch bars for symbol, SPY, and sector ETF
    const promises: Promise<DailyBar[]>[] = [
      fetchDailyBars(normalizedSymbol, lookback),
      fetchDailyBars('SPY', lookback),
    ]

    if (sectorETF) {
      promises.push(fetchDailyBars(sectorETF, lookback))
    }

    const [symbolBars, spyBars, sectorBars = []] = await Promise.all(promises)

    if (symbolBars.length < 21 || spyBars.length < 21) {
      return {
        success: false,
        metrics: null,
        spyBars: [],
        sectorBars: [],
        symbolBars: [],
        error: createError('INVALID_RESPONSE', 'Insufficient data for relative strength'),
      }
    }

    // Compute relative strength (performance ratio)
    const symbolReturn = (symbolBars[0].close - symbolBars[symbolBars.length - 1].close) / symbolBars[symbolBars.length - 1].close * 100
    const spyReturn = (spyBars[0].close - spyBars[spyBars.length - 1].close) / spyBars[spyBars.length - 1].close * 100
    const vsSpyRS = symbolReturn - spyReturn

    let vsSectorRS = 0
    if (sectorBars.length >= 21) {
      const sectorReturn = (sectorBars[0].close - sectorBars[sectorBars.length - 1].close) / sectorBars[sectorBars.length - 1].close * 100
      vsSectorRS = symbolReturn - sectorReturn
    }

    // Calculate rolling correlation with SPY
    const symbolReturns = computeReturns(symbolBars)
    const spyReturns = computeReturns(spyBars)
    const spyCorrelation = computeCorrelation(symbolReturns, spyReturns)

    // Calculate beta
    const beta = computeBeta(symbolReturns, spyReturns)

    // RS Rating
    let rsRating: RelativeStrengthMetrics['rsRating'] = 'inline'
    if (vsSpyRS > 5) rsRating = 'leader'
    else if (vsSpyRS < -5) rsRating = 'laggard'

    return {
      success: true,
      metrics: {
        symbol: normalizedSymbol,
        vsSpyRS,
        vsSectorRS,
        sectorETF,
        spyCorrelation,
        beta,
        rsRating,
      },
      spyBars,
      sectorBars,
      symbolBars,
    }
  } catch {
    return {
      success: false,
      metrics: null,
      spyBars: [],
      sectorBars: [],
      symbolBars: [],
      error: createError('FETCH_FAILED', 'Failed to fetch relative strength'),
    }
  }
}

// Helper: compute daily returns
function computeReturns(bars: DailyBar[]): number[] {
  const returns: number[] = []
  for (let i = 0; i < bars.length - 1; i++) {
    returns.push((bars[i].close - bars[i + 1].close) / bars[i + 1].close)
  }
  return returns
}

// Helper: compute Pearson correlation
function computeCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 5) return 0

  const xSlice = x.slice(0, n)
  const ySlice = y.slice(0, n)

  const xMean = xSlice.reduce((a, b) => a + b, 0) / n
  const yMean = ySlice.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let xVar = 0
  let yVar = 0

  for (let i = 0; i < n; i++) {
    const xDiff = xSlice[i] - xMean
    const yDiff = ySlice[i] - yMean
    numerator += xDiff * yDiff
    xVar += xDiff * xDiff
    yVar += yDiff * yDiff
  }

  const denominator = Math.sqrt(xVar * yVar)
  return denominator === 0 ? 0 : numerator / denominator
}

// Helper: compute beta (covariance / variance)
function computeBeta(stockReturns: number[], marketReturns: number[]): number {
  const n = Math.min(stockReturns.length, marketReturns.length)
  if (n < 5) return 1

  const stockSlice = stockReturns.slice(0, n)
  const marketSlice = marketReturns.slice(0, n)

  const marketMean = marketSlice.reduce((a, b) => a + b, 0) / n
  const stockMean = stockSlice.reduce((a, b) => a + b, 0) / n

  let covariance = 0
  let marketVariance = 0

  for (let i = 0; i < n; i++) {
    const marketDiff = marketSlice[i] - marketMean
    covariance += (stockSlice[i] - stockMean) * marketDiff
    marketVariance += marketDiff * marketDiff
  }

  return marketVariance === 0 ? 1 : covariance / marketVariance
}

// -----------------------------------------------------------------------------
// API Functions - Health Check
// -----------------------------------------------------------------------------

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: {
    apiKey: { ok: boolean; message: string }
    marketStatus: { ok: boolean; message: string; phase?: MarketPhase }
    sampleSnapshot: { ok: boolean; message: string; latencyMs?: number }
  }
  version: string
}

export async function performHealthCheck(): Promise<HealthCheckResult> {
  const timestamp = new Date().toISOString()
  const version = process.env.npm_package_version || '1.0.0'

  const checks: HealthCheckResult['checks'] = {
    apiKey: { ok: false, message: 'Not configured' },
    marketStatus: { ok: false, message: 'Unknown' },
    sampleSnapshot: { ok: false, message: 'Not tested' },
  }

  // Check API key
  const apiKey = getApiKey()
  if (apiKey) {
    checks.apiKey = { ok: true, message: 'Configured' }
  }

  // Check market status
  try {
    const statusResult = await fetchMarketStatus()
    if (statusResult.success && statusResult.status) {
      checks.marketStatus = {
        ok: true,
        message: `NYSE: ${statusResult.status.exchanges.nyse}`,
        phase: statusResult.status.exchanges.nyse,
      }
    } else {
      checks.marketStatus = {
        ok: false,
        message: statusResult.error?.message || 'Failed to fetch',
      }
    }
  } catch {
    checks.marketStatus = { ok: false, message: 'Exception thrown' }
  }

  // Sample snapshot test
  if (apiKey) {
    try {
      const start = Date.now()
      const snapshotResult = await fetchUniversalSnapshot({
        symbols: ['SPY'],
        assetClass: 'stocks',
      })
      const latencyMs = Date.now() - start

      if (snapshotResult.success && snapshotResult.results.length > 0) {
        checks.sampleSnapshot = {
          ok: true,
          message: `SPY snapshot OK`,
          latencyMs,
        }
      } else {
        checks.sampleSnapshot = {
          ok: false,
          message: snapshotResult.error?.message || 'Empty result',
          latencyMs,
        }
      }
    } catch {
      checks.sampleSnapshot = { ok: false, message: 'Exception thrown' }
    }
  }

  // Determine overall status
  const allOk = Object.values(checks).every((c) => c.ok)
  const someOk = Object.values(checks).some((c) => c.ok)

  return {
    status: allOk ? 'healthy' : someOk ? 'degraded' : 'unhealthy',
    timestamp,
    checks,
    version,
  }
}

// -----------------------------------------------------------------------------
// Options Analysis Helpers
// -----------------------------------------------------------------------------

export function filterOptionsChain(
  chain: OptionSnapshot[],
  filters: {
    minDelta?: number
    maxDelta?: number
    minIV?: number
    maxIV?: number
    minOpenInterest?: number
    daysToExpiration?: { min?: number; max?: number }
  }
): OptionSnapshot[] {
  return chain.filter((opt) => {
    if (filters.minDelta !== undefined && Math.abs(opt.greeks.delta) < filters.minDelta) return false
    if (filters.maxDelta !== undefined && Math.abs(opt.greeks.delta) > filters.maxDelta) return false
    if (filters.minIV !== undefined && opt.implied_volatility < filters.minIV) return false
    if (filters.maxIV !== undefined && opt.implied_volatility > filters.maxIV) return false
    if (filters.minOpenInterest !== undefined && opt.open_interest < filters.minOpenInterest) return false

    if (filters.daysToExpiration) {
      const expDate = new Date(opt.contract.expiration_date)
      const today = new Date()
      const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      if (filters.daysToExpiration.min !== undefined && dte < filters.daysToExpiration.min) return false
      if (filters.daysToExpiration.max !== undefined && dte > filters.daysToExpiration.max) return false
    }

    return true
  })
}

export function calculateOptionsMetrics(chain: OptionSnapshot[]): {
  totalVolume: number
  totalOpenInterest: number
  putCallRatio: number
  avgIV: number
  maxPainStrike: number
} {
  if (chain.length === 0) {
    return { totalVolume: 0, totalOpenInterest: 0, putCallRatio: 0, avgIV: 0, maxPainStrike: 0 }
  }

  let callVolume = 0
  let putVolume = 0
  let callOI = 0
  let putOI = 0
  let ivSum = 0
  let ivCount = 0

  const strikeOI: Record<number, { calls: number; puts: number }> = {}

  chain.forEach((opt) => {
    const strike = opt.contract.strike_price

    if (!strikeOI[strike]) {
      strikeOI[strike] = { calls: 0, puts: 0 }
    }

    if (opt.contract.contract_type === 'call') {
      callVolume += opt.day.volume
      callOI += opt.open_interest
      strikeOI[strike].calls += opt.open_interest
    } else {
      putVolume += opt.day.volume
      putOI += opt.open_interest
      strikeOI[strike].puts += opt.open_interest
    }

    if (opt.implied_volatility > 0) {
      ivSum += opt.implied_volatility
      ivCount++
    }
  })

  // Calculate max pain (strike with maximum pain for option holders)
  let maxPainStrike = 0
  let maxPainValue = Infinity

  Object.entries(strikeOI).forEach(([strikeStr, { calls, puts }]) => {
    const strike = parseFloat(strikeStr)
    // Total value lost by option holders if stock settles at this strike
    const painValue = calls * strike + puts * strike
    if (painValue < maxPainValue) {
      maxPainValue = painValue
      maxPainStrike = strike
    }
  })

  return {
    totalVolume: callVolume + putVolume,
    totalOpenInterest: callOI + putOI,
    putCallRatio: callVolume > 0 ? putVolume / callVolume : 0,
    avgIV: ivCount > 0 ? ivSum / ivCount : 0,
    maxPainStrike,
  }
}
