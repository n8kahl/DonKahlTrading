// =============================================================================
// AI Query Planner - Universal Data Query System
// =============================================================================
//
// This module provides:
// 1. Structured QueryPlan schema for LLM-generated data requests
// 2. ResultEnvelope schema for typed UI rendering
// 3. Plan executor that routes to Massive API operations
// 4. Trader defaults and guardrails
// =============================================================================

import { z } from 'zod'
import {
  fetchAggregates,
  fetchSnapshot,
  fetchOptionsChain,
  fetchMarketStatus,
  fetchGainers,
  fetchLosers,
} from '@/lib/massive/client'
import {
  normalizeAggregates,
  normalizeSnapshot,
  normalizeOptionsChain,
  normalizeMarketStatus,
  normalizeSnapshotAll,
  getEtfProxy,
  isIndex,
  type NormalizedBar,
  type NormalizedSnapshot,
  type NormalizedOptionsContract,
} from '@/lib/massive/normalize'
import { computeEnhancedMetrics, type HeatmapMetrics } from '@/lib/massive-api'

// -----------------------------------------------------------------------------
// QueryPlan Schema
// -----------------------------------------------------------------------------

export const AssetClassSchema = z.enum(['stocks', 'options', 'indices', 'mixed'])

export const TimeframeSchema = z.object({
  mode: z.enum(['lookback', 'range']),
  days: z.number().int().min(1).max(2000).optional(),
  start: z.string().optional(), // YYYY-MM-DD
  end: z.string().optional(), // YYYY-MM-DD
})

export const GranularitySchema = z.enum(['1m', '5m', '15m', '1h', '1d'])

export const DatasetSchema = z.enum([
  'aggregates', // Historical OHLCV bars
  'snapshot', // Current quotes
  'options_chain', // Options chain snapshot
  'heatmap', // Rolling high/low heatmap
  'extremes', // Market extremes analysis
  'movers', // Gainers/losers
  'market_status', // Market open/closed
])

export const TransformSchema = z.enum([
  'none',
  'pct_change', // Percentage change
  'normalize', // Normalize to 100 base
  'relative_strength', // Relative to benchmark
  'rolling_high_low', // Days since high/low
])

export const VisualizationSchema = z.enum([
  'chart', // Line/candlestick chart
  'heatmap', // Color-coded table
  'table', // Data table
  'dashboard', // Multi-symbol dashboard
  'pulse', // Real-time pulse display
  'options_chain', // Options chain display
])

export const QueryPlanSchema = z.object({
  // Core query parameters
  symbols: z.array(z.string()).min(1).max(12),
  assetClass: AssetClassSchema.default('stocks'),
  timeframe: TimeframeSchema.default({ mode: 'lookback', days: 63 }),
  granularity: GranularitySchema.default('1d'),

  // Data requirements
  datasets: z.array(DatasetSchema).min(1),

  // Transformations
  transforms: z.array(TransformSchema).default(['none']),
  benchmark: z.string().optional().default('SPY'),

  // Display
  visualization: VisualizationSchema.default('dashboard'),
  lookback: z.number().int().min(5).max(504).default(63),

  // Options-specific
  optionsExpiration: z.string().optional(), // YYYY-MM-DD or "this_friday"
  optionsContractType: z.enum(['call', 'put', 'all']).optional(),

  // Metadata
  title: z.string().optional(),
  basis: z.enum(['close', 'intraday']).default('close'),
})

export type QueryPlan = z.infer<typeof QueryPlanSchema>

// -----------------------------------------------------------------------------
// ResultEnvelope Schema
// -----------------------------------------------------------------------------

export const TimeseriesResultSchema = z.object({
  type: z.literal('timeseries'),
  title: z.string(),
  symbols: z.array(z.string()),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  meta: z.object({
    lookback: z.number(),
    basis: z.string(),
    benchmark: z.string().optional(),
    signals: z.object({
      confirmedBreakouts: z.array(z.string()).optional(),
      rejectedBreakouts: z.array(z.string()).optional(),
    }).optional(),
  }),
})

export const SnapshotResultSchema = z.object({
  type: z.literal('snapshot'),
  title: z.string(),
  rows: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    changePct: z.number().optional(),
    signal: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  })),
  meta: z.object({
    lastUpdated: z.string(),
    isDelayed: z.boolean().optional(),
  }),
})

export const OptionsChainResultSchema = z.object({
  type: z.literal('options_chain'),
  title: z.string(),
  underlying: z.string(),
  underlyingPrice: z.number(),
  contracts: z.array(z.object({
    ticker: z.string(),
    contractType: z.enum(['call', 'put']),
    strike: z.number(),
    expiration: z.string(),
    bid: z.number(),
    ask: z.number(),
    last: z.number(),
    volume: z.number(),
    openInterest: z.number(),
    impliedVolatility: z.number(),
    delta: z.number().nullable(),
    gamma: z.number().nullable(),
    theta: z.number().nullable(),
  })),
  meta: z.object({
    putCallRatio: z.number(),
    maxPainStrike: z.number().nullable(),
    totalVolume: z.number(),
    avgIV: z.number(),
  }),
})

export const HeatmapResultSchema = z.object({
  type: z.literal('heatmap'),
  title: z.string(),
  dates: z.array(z.string()),
  symbols: z.array(z.string()),
  matrix: z.array(z.array(z.number())),
  metric: z.enum(['daysSinceHigh', 'daysSinceLow', 'pctFromHigh', 'pctFromLow']),
  meta: z.object({
    lookback: z.number(),
    basis: z.string(),
  }),
})

export const TableResultSchema = z.object({
  type: z.literal('table'),
  title: z.string(),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    align: z.enum(['left', 'center', 'right']).optional(),
    format: z.enum(['number', 'percent', 'currency', 'string']).optional(),
  })),
  rows: z.array(z.record(z.string(), z.unknown())),
  meta: z.object({
    sortBy: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  }),
})

export const PulseResultSchema = z.object({
  type: z.literal('pulse'),
  title: z.string(),
  symbols: z.array(z.object({
    symbol: z.string(),
    price: z.number(),
    change: z.number(),
    changePercent: z.number(),
    volume: z.number(),
    signal: z.enum(['bullish', 'bearish', 'neutral']),
    daysSinceHigh: z.number().optional(),
    pctFromHigh: z.number().optional(),
  })),
  marketStatus: z.enum(['open', 'closed', 'pre-market', 'after-hours']),
  meta: z.object({
    lastUpdated: z.string(),
    riskRegime: z.enum(['risk-on', 'risk-off', 'neutral']).optional(),
  }),
})

export const ErrorResultSchema = z.object({
  type: z.literal('error'),
  title: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  meta: z.object({
    code: z.string(),
    recoverable: z.boolean(),
  }),
})

export const ResultEnvelopeSchema = z.discriminatedUnion('type', [
  TimeseriesResultSchema,
  SnapshotResultSchema,
  OptionsChainResultSchema,
  HeatmapResultSchema,
  TableResultSchema,
  PulseResultSchema,
  ErrorResultSchema,
])

export type ResultEnvelope = z.infer<typeof ResultEnvelopeSchema>

// -----------------------------------------------------------------------------
// Guardrails
// -----------------------------------------------------------------------------

const GUARDRAILS = {
  maxSymbols: 12,
  maxDays: 2000,
  maxIntradayDays: 30,
  maxConcurrency: 5,
  defaultBenchmark: 'SPY',
  defaultLookback: 63,
}

// -----------------------------------------------------------------------------
// Error Message Formatter
// -----------------------------------------------------------------------------

/**
 * Convert technical errors to user-friendly messages.
 */
function formatUserFriendlyError(error: Error | string): string {
  const message = error instanceof Error ? error.message : error

  // Common error patterns and their friendly versions
  const errorMappings: Array<[RegExp | string, string]> = [
    [/Invalid time value/i, 'Market data temporarily unavailable. The API returned incomplete data.'],
    [/fetch failed/i, 'Unable to connect to market data provider. Please try again.'],
    [/network error/i, 'Network connection issue. Check your internet and try again.'],
    [/rate limit/i, 'Too many requests. Please wait a moment and try again.'],
    [/unauthorized|401/i, 'API authentication issue. Please check your API key configuration.'],
    [/not found|404/i, 'No data found for the requested symbol(s).'],
    [/timeout/i, 'Request timed out. The market data provider may be slow.'],
    [/ECONNREFUSED/i, 'Unable to reach market data provider.'],
    [/Invalid symbol/i, 'One or more symbols are invalid. Please check the ticker symbols.'],
  ]

  for (const [pattern, friendly] of errorMappings) {
    if (typeof pattern === 'string' ? message.includes(pattern) : pattern.test(message)) {
      return friendly
    }
  }

  // If no pattern matches, clean up the technical jargon
  return message
    .replace(/Error:/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'An unexpected error occurred. Please try again.'
}

// Trader defaults: always include context
const CONTEXT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA']

// -----------------------------------------------------------------------------
// Plan Executor
// -----------------------------------------------------------------------------

export async function executePlan(plan: QueryPlan): Promise<ResultEnvelope[]> {
  const results: ResultEnvelope[] = []

  // Apply guardrails
  const symbols = plan.symbols.slice(0, GUARDRAILS.maxSymbols)
  const days = Math.min(plan.timeframe.days || plan.lookback, GUARDRAILS.maxDays)

  // Calculate date range
  const today = new Date()
  const endDate = plan.timeframe.end || today.toISOString().split('T')[0]
  const startDate = plan.timeframe.start || (() => {
    const start = new Date(today)
    start.setDate(start.getDate() - days)
    return start.toISOString().split('T')[0]
  })()

  try {
    // Execute based on datasets requested
    for (const dataset of plan.datasets) {
      switch (dataset) {
        case 'aggregates':
          results.push(await executeAggregates(symbols, startDate, endDate, plan))
          break

        case 'snapshot':
          results.push(await executeSnapshots(symbols, plan))
          break

        case 'options_chain':
          for (const symbol of symbols) {
            results.push(await executeOptionsChain(symbol, plan))
          }
          break

        case 'heatmap':
        case 'extremes':
          results.push(await executeHeatmap(symbols, days, plan))
          break

        case 'movers':
          results.push(await executeMovers(plan))
          break

        case 'market_status':
          results.push(await executeMarketStatus(plan))
          break
      }
    }
  } catch (error) {
    results.push({
      type: 'error',
      title: 'Data Unavailable',
      message: formatUserFriendlyError(error instanceof Error ? error : String(error)),
      meta: {
        code: 'EXECUTION_ERROR',
        recoverable: true,
      },
    })
  }

  return results
}

// -----------------------------------------------------------------------------
// Dataset Executors
// -----------------------------------------------------------------------------

async function executeAggregates(
  symbols: string[],
  startDate: string,
  endDate: string,
  plan: QueryPlan
): Promise<ResultEnvelope> {
  const timespan = plan.granularity === '1d' ? 'day' :
    plan.granularity === '1h' ? 'hour' : 'minute'
  const multiplier = plan.granularity === '5m' ? 5 :
    plan.granularity === '15m' ? 15 : 1

  const data: Array<Record<string, string | number>> = []
  const symbolList: string[] = []

  // Fetch data for each symbol
  const fetchPromises = symbols.map(async (symbol) => {
    // Use ETF proxy for indices if needed
    const fetchSymbol = isIndex(symbol) ? getEtfProxy(symbol) : symbol

    const response = await fetchAggregates(fetchSymbol, multiplier, timespan as 'day', startDate, endDate)

    if (response.success && response.data) {
      const bars = normalizeAggregates(response.data)
      return { symbol, bars }
    }
    return { symbol, bars: [] as NormalizedBar[] }
  })

  const results = await Promise.all(fetchPromises)

  // Build unified data structure
  const dateSet = new Set<string>()
  results.forEach(({ bars }) => bars.forEach((b) => dateSet.add(b.date)))
  const dates = Array.from(dateSet).sort()

  // Create data rows
  for (const date of dates) {
    const row: Record<string, string | number> = { date }
    for (const { symbol, bars } of results) {
      const bar = bars.find((b) => b.date === date)
      row[symbol] = bar?.close ?? 0
      if (!symbolList.includes(symbol)) symbolList.push(symbol)
    }
    data.push(row)
  }

  return {
    type: 'timeseries',
    title: `Price Comparison: ${symbolList.join(', ')}`,
    symbols: symbolList,
    data,
    meta: {
      lookback: plan.lookback,
      basis: plan.basis,
      benchmark: plan.benchmark,
    },
  }
}

async function executeSnapshots(
  symbols: string[],
  plan: QueryPlan
): Promise<ResultEnvelope> {
  const pulseSymbols: Array<{
    symbol: string
    price: number
    change: number
    changePercent: number
    volume: number
    signal: 'bullish' | 'bearish' | 'neutral'
  }> = []

  // Fetch snapshots in parallel
  const fetchPromises = symbols.map(async (symbol) => {
    const fetchSymbol = isIndex(symbol) ? getEtfProxy(symbol) : symbol
    const response = await fetchSnapshot(fetchSymbol)

    if (response.success && response.data) {
      const snapshot = normalizeSnapshot(response.data, symbol)
      return { symbol, snapshot }
    }
    return { symbol, snapshot: null }
  })

  const results = await Promise.all(fetchPromises)

  // Get market status
  const statusResponse = await fetchMarketStatus()
  const marketStatus = statusResponse.success && statusResponse.data
    ? normalizeMarketStatus(statusResponse.data)
    : { isOpen: false, phase: 'closed' as const, serverTime: new Date().toISOString(), exchanges: { nyse: 'closed', nasdaq: 'closed' } }

  for (const { symbol, snapshot } of results) {
    if (snapshot) {
      // Trader semantics: determine signal based on change
      const signal: 'bullish' | 'bearish' | 'neutral' =
        snapshot.changePercent > 0.5 ? 'bullish' :
        snapshot.changePercent < -0.5 ? 'bearish' : 'neutral'

      pulseSymbols.push({
        symbol,
        price: snapshot.price,
        change: snapshot.change,
        changePercent: snapshot.changePercent,
        volume: snapshot.volume,
        signal,
      })
    }
  }

  return {
    type: 'pulse',
    title: 'Market Pulse',
    symbols: pulseSymbols,
    marketStatus: marketStatus.phase,
    meta: {
      lastUpdated: marketStatus.serverTime,
      riskRegime: determineRiskRegime(pulseSymbols),
    },
  }
}

async function executeOptionsChain(
  symbol: string,
  plan: QueryPlan
): Promise<ResultEnvelope> {
  const fetchSymbol = isIndex(symbol) ? getEtfProxy(symbol) : symbol

  const options: Parameters<typeof fetchOptionsChain>[1] = {}

  if (plan.optionsExpiration) {
    if (plan.optionsExpiration === 'this_friday') {
      // Find next Friday
      const today = new Date()
      const friday = new Date(today)
      friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7))
      options.expiration_date = friday.toISOString().split('T')[0]
    } else {
      options.expiration_date = plan.optionsExpiration
    }
  }

  if (plan.optionsContractType && plan.optionsContractType !== 'all') {
    options.contract_type = plan.optionsContractType
  }

  options.limit = 250

  const response = await fetchOptionsChain(fetchSymbol, options)

  if (!response.success || !response.data) {
    return {
      type: 'error',
      title: `Options Chain: ${symbol}`,
      message: response.error?.message || 'Failed to fetch options chain',
      meta: {
        code: response.error?.code || 'FETCH_ERROR',
        recoverable: true,
      },
    }
  }

  const contracts = normalizeOptionsChain(response.data)

  // Calculate metrics
  const calls = contracts.filter((c) => c.contractType === 'call')
  const puts = contracts.filter((c) => c.contractType === 'put')
  const totalCallVolume = calls.reduce((sum, c) => sum + c.volume, 0)
  const totalPutVolume = puts.reduce((sum, c) => sum + c.volume, 0)
  const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0

  const totalVolume = totalCallVolume + totalPutVolume
  const avgIV = contracts.length > 0
    ? contracts.reduce((sum, c) => sum + c.impliedVolatility, 0) / contracts.length
    : 0

  // Max pain calculation (simplified)
  const strikeOI: Record<number, number> = {}
  contracts.forEach((c) => {
    strikeOI[c.strike] = (strikeOI[c.strike] || 0) + c.openInterest
  })
  const maxPainStrike = Object.entries(strikeOI).reduce(
    (max, [strike, oi]) => (oi > max.oi ? { strike: Number(strike), oi } : max),
    { strike: 0, oi: 0 }
  ).strike

  return {
    type: 'options_chain',
    title: `Options Chain: ${symbol}`,
    underlying: symbol,
    underlyingPrice: contracts[0]?.underlyingPrice || 0,
    contracts: contracts.slice(0, 50).map((c) => ({
      ticker: c.ticker,
      contractType: c.contractType,
      strike: c.strike,
      expiration: c.expiration,
      bid: c.bid,
      ask: c.ask,
      last: c.last,
      volume: c.volume,
      openInterest: c.openInterest,
      impliedVolatility: c.impliedVolatility,
      delta: c.delta,
      gamma: c.gamma,
      theta: c.theta,
    })),
    meta: {
      putCallRatio,
      maxPainStrike: maxPainStrike || null,
      totalVolume,
      avgIV,
    },
  }
}

async function executeHeatmap(
  symbols: string[],
  days: number,
  plan: QueryPlan
): Promise<ResultEnvelope> {
  const lookback = plan.lookback
  const fetchDays = days + lookback + 30

  // Fetch bars for all symbols
  const today = new Date()
  const endDate = today.toISOString().split('T')[0]
  const startDate = (() => {
    const start = new Date(today)
    start.setDate(start.getDate() - fetchDays)
    return start.toISOString().split('T')[0]
  })()

  const allBars: Record<string, NormalizedBar[]> = {}
  const allMetrics: Record<string, HeatmapMetrics[]> = {}

  const fetchPromises = symbols.map(async (symbol) => {
    const fetchSymbol = isIndex(symbol) ? getEtfProxy(symbol) : symbol
    const response = await fetchAggregates(fetchSymbol, 1, 'day', startDate, endDate)

    if (response.success && response.data) {
      const bars = normalizeAggregates(response.data)
      // Convert to DailyBar format for computeEnhancedMetrics
      const dailyBars = bars.map((b) => ({
        date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }))

      const metrics = computeEnhancedMetrics(dailyBars, lookback, plan.basis === 'close' ? 'close' : 'intraday')

      return { symbol, bars, metrics }
    }
    return { symbol, bars: [] as NormalizedBar[], metrics: [] as HeatmapMetrics[] }
  })

  const results = await Promise.all(fetchPromises)

  // Build unified date list
  const dateSet = new Set<string>()
  results.forEach(({ bars }) => {
    bars.slice(-days).forEach((b) => dateSet.add(b.date))
  })
  const dates = Array.from(dateSet).sort()

  // Build matrix
  const symbolList = results.map((r) => r.symbol)
  const matrix: number[][] = []

  for (let i = 0; i < dates.length; i++) {
    const row: number[] = []
    for (const { symbol, bars, metrics } of results) {
      const displayBars = bars.slice(-days)
      const displayMetrics = metrics.slice(-days)
      const idx = displayBars.findIndex((b) => b.date === dates[i])
      row.push(idx >= 0 && displayMetrics[idx] ? displayMetrics[idx].daysSinceHigh : lookback)
    }
    matrix.push(row)
  }

  // Detect signals
  const confirmedBreakouts: string[] = []
  const rejectedBreakouts: string[] = []

  if (plan.basis === 'close') {
    // For close basis, also compute intraday to detect rejected breakouts
    for (const { symbol, bars, metrics } of results) {
      const displayMetrics = metrics.slice(-days)
      const lastMetric = displayMetrics[displayMetrics.length - 1]
      if (lastMetric?.daysSinceHigh === 0) {
        confirmedBreakouts.push(symbol)
      }
    }
  }

  return {
    type: 'heatmap',
    title: `Days Since ${lookback}d High (${plan.basis} basis)`,
    dates,
    symbols: symbolList,
    matrix,
    metric: 'daysSinceHigh',
    meta: {
      lookback,
      basis: plan.basis,
    },
  }
}

async function executeMovers(_plan: QueryPlan): Promise<ResultEnvelope> {
  const [gainersRes, losersRes] = await Promise.all([
    fetchGainers(),
    fetchLosers(),
  ])

  const rows: Array<{
    label: string
    value: string | number
    changePct?: number
    signal?: 'bullish' | 'bearish' | 'neutral'
  }> = []

  if (gainersRes.success && gainersRes.data) {
    const gainers = normalizeSnapshotAll(gainersRes.data).slice(0, 5)
    gainers.forEach((g) => {
      rows.push({
        label: `📈 ${g.symbol}`,
        value: `$${g.price.toFixed(2)}`,
        changePct: g.changePercent,
        signal: 'bullish',
      })
    })
  }

  if (losersRes.success && losersRes.data) {
    const losers = normalizeSnapshotAll(losersRes.data).slice(0, 5)
    losers.forEach((l) => {
      rows.push({
        label: `📉 ${l.symbol}`,
        value: `$${l.price.toFixed(2)}`,
        changePct: l.changePercent,
        signal: 'bearish',
      })
    })
  }

  return {
    type: 'snapshot',
    title: 'Market Movers',
    rows,
    meta: {
      lastUpdated: new Date().toISOString(),
    },
  }
}

async function executeMarketStatus(_plan: QueryPlan): Promise<ResultEnvelope> {
  const response = await fetchMarketStatus()

  if (!response.success || !response.data) {
    return {
      type: 'error',
      title: 'Market Status',
      message: 'Failed to fetch market status',
      meta: {
        code: 'FETCH_ERROR',
        recoverable: true,
      },
    }
  }

  const status = normalizeMarketStatus(response.data)

  return {
    type: 'snapshot',
    title: 'Market Status',
    rows: [
      { label: 'Status', value: status.phase },
      { label: 'NYSE', value: status.exchanges.nyse },
      { label: 'NASDAQ', value: status.exchanges.nasdaq },
      { label: 'Server Time', value: status.serverTime },
    ],
    meta: {
      lastUpdated: status.serverTime,
    },
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Determine risk regime based on market pulse.
 * Trader semantics:
 * - Risk-on: Most symbols positive, low VIX
 * - Risk-off: Most symbols negative, high VIX
 */
function determineRiskRegime(
  symbols: Array<{ symbol: string; changePercent: number }>
): 'risk-on' | 'risk-off' | 'neutral' {
  const positive = symbols.filter((s) => s.changePercent > 0).length
  const negative = symbols.filter((s) => s.changePercent < 0).length
  const total = symbols.length

  if (total === 0) return 'neutral'

  const positiveRatio = positive / total
  const negativeRatio = negative / total

  if (positiveRatio >= 0.7) return 'risk-on'
  if (negativeRatio >= 0.7) return 'risk-off'
  return 'neutral'
}

/**
 * Create a default query plan for "market pulse".
 */
export function createMarketPulsePlan(): QueryPlan {
  return {
    symbols: ['SPY', 'QQQ', 'IWM', 'DIA'],
    assetClass: 'stocks',
    timeframe: { mode: 'lookback', days: 1 },
    granularity: '1d',
    datasets: ['snapshot'],
    transforms: ['none'],
    benchmark: 'SPY',
    visualization: 'pulse',
    lookback: 63,
    basis: 'close',
  }
}

/**
 * Create a default query plan for "extremes heatmap".
 */
export function createExtremesHeatmapPlan(symbols: string[], lookback = 63): QueryPlan {
  return {
    symbols,
    assetClass: 'mixed',
    timeframe: { mode: 'lookback', days: 30 },
    granularity: '1d',
    datasets: ['heatmap'],
    transforms: ['rolling_high_low'],
    benchmark: 'SPY',
    visualization: 'heatmap',
    lookback,
    basis: 'close',
  }
}

/**
 * Create a query plan for options chain.
 */
export function createOptionsChainPlan(symbol: string, expiration?: string): QueryPlan {
  return {
    symbols: [symbol],
    assetClass: 'options',
    timeframe: { mode: 'lookback', days: 1 },
    granularity: '1d',
    datasets: ['options_chain'],
    transforms: ['none'],
    benchmark: 'SPY',
    visualization: 'options_chain',
    lookback: 63,
    basis: 'close',
    optionsExpiration: expiration || 'this_friday',
  }
}
