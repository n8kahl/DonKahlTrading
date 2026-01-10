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

const BASE_URL = 'https://api.polygon.io'

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

function getApiKey(): string | null {
  return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || null
}

function normalizeSymbol(symbol: string, isIndex = false): string {
  if (TICKER_MAPPING[symbol]) {
    return TICKER_MAPPING[symbol]
  }
  if (isIndex && !symbol.startsWith('I:')) {
    return `I:${symbol}`
  }
  return symbol
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
    console.error('[API] Snapshot fetch error:', error instanceof Error ? error.message : 'Unknown error')
    return {
      success: false,
      ticker: null,
      error: createError('FETCH_FAILED', 'Failed to fetch snapshot', symbol, 'snapshot'),
    }
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

  const normalizedSymbol = normalizeSymbol(symbol, true)

  const toDate = new Date()
  const fromDate = new Date()
  fromDate.setDate(toDate.getDate() - days * 1.5)

  const fromStr = formatDate(fromDate)
  const toStr = formatDate(toDate)

  try {
    // Try Polygon first, fall back to Massive
    const baseUrl = process.env.POLYGON_API_KEY ? 'https://api.polygon.io' : 'https://api.massive.com'
    const url = `${baseUrl}/v2/aggs/ticker/${normalizedSymbol}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=50000&apiKey=${apiKey}`

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

export function computeHeatmap(bars: DailyBar[], lookback: number, basis: 'high' | 'close'): number[] {
  if (bars.length < lookback) {
    return new Array(bars.length).fill(lookback)
  }

  const values = bars.map((bar) => (basis === 'high' ? bar.high : bar.close))
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
