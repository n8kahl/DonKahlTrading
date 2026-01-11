// =============================================================================
// Tucson Trader - Natural Language Query Engine
// Transforms user queries into validated, executable data plans
// =============================================================================

import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import {
  fetchDailyBars,
  fetchIntradayBars,
  fetchOptionsChain,
  fetchUniversalSnapshot,
  fetchIndexSnapshot,
  computeEnhancedMetrics,
  computeHeatmap,
  calculateOptionsMetrics,
  normalizeSymbol,
  type DailyBar,
  type IntradayBar,
  type IntradayInterval,
  type OptionSnapshot,
  type UniversalSnapshotItem,
  type IndexSnapshotItem,
  type DataEntitlement,
} from './massive-api'

// =============================================================================
// Safety Constraints
// =============================================================================

const SAFETY_LIMITS = {
  maxSymbols: 20,
  maxDateRangeDays: 365,
  maxConcurrency: 5,
  maxLookback: 252,
  allowedEndpoints: [
    'daily_bars',
    'intraday_bars',
    'universal_snapshot',
    'index_snapshot',
    'options_chain',
    'heatmap',
    'extremes',
  ] as const,
} as const

// ETF fallbacks for indices that may not be entitled
const INDEX_ETF_FALLBACK: Record<string, string> = {
  'I:SPX': 'SPY',
  'I:NDX': 'QQQ',
  'I:RUT': 'IWM',
  'I:DJI': 'DIA',
  'I:SOX': 'SOXX',
  'I:VIX': 'VXX',
  SPX: 'SPY',
  NDX: 'QQQ',
  RUT: 'IWM',
  DJI: 'DIA',
  SOX: 'SOXX',
  VIX: 'VXX',
}

// =============================================================================
// Zod Schemas
// =============================================================================

export const QueryIntentSchema = z.enum([
  'compare_symbols',
  'analyze_symbol',
  'options_flow',
  'price_chart',
  'heatmap',
  'extremes',
  'snapshot',
  'intraday',
])

export const AssetClassSchema = z.enum([
  'stocks',
  'indices',
  'etf',
  'options',
  'mixed',
])

export const TimeframeSchema = z.enum([
  '1d',
  '5d',
  '1mo',
  '3mo',
  '6mo',
  '1y',
  'ytd',
  'intraday',
])

export const GranularitySchema = z.enum([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '1d',
])

export const IndicatorSchema = z.enum([
  'sma_20',
  'sma_50',
  'sma_200',
  'ema_9',
  'ema_21',
  'rsi',
  'macd',
  'bollinger',
  'vwap',
  'atr',
  'rolling_high',
  'rolling_low',
  'pct_from_high',
  'days_since_high',
])

export const OutputTypeSchema = z.enum([
  'table',
  'chart',
  'summary',
  'raw_data',
  'heatmap',
  'options_grid',
])

export const QueryPlanSchema = z.object({
  intent: QueryIntentSchema.describe('The primary intent of the query'),
  symbols: z
    .array(z.string())
    .min(1)
    .max(SAFETY_LIMITS.maxSymbols)
    .describe('Array of ticker symbols to query'),
  assetClass: AssetClassSchema.describe('The asset class of the symbols'),
  timeframe: TimeframeSchema.describe('The time period to analyze'),
  granularity: GranularitySchema.describe('Data granularity/interval'),
  indicators: z
    .array(IndicatorSchema)
    .default([])
    .describe('Technical indicators to compute'),
  compareTo: z
    .string()
    .nullable()
    .default(null)
    .describe('Optional benchmark symbol to compare against'),
  outputs: z
    .array(OutputTypeSchema)
    .default(['table'])
    .describe('Desired output formats'),
  lookback: z
    .number()
    .min(1)
    .max(SAFETY_LIMITS.maxLookback)
    .default(63)
    .describe('Lookback period in trading days'),
  endpoint: z
    .enum(SAFETY_LIMITS.allowedEndpoints)
    .describe('The API endpoint to use'),
})

export type QueryIntent = z.infer<typeof QueryIntentSchema>
export type AssetClass = z.infer<typeof AssetClassSchema>
export type Timeframe = z.infer<typeof TimeframeSchema>
export type Granularity = z.infer<typeof GranularitySchema>
export type Indicator = z.infer<typeof IndicatorSchema>
export type OutputType = z.infer<typeof OutputTypeSchema>
export type QueryPlan = z.infer<typeof QueryPlanSchema>

// =============================================================================
// Execution Result Types
// =============================================================================

export interface ExecutionResult {
  success: boolean
  plan: QueryPlan
  data: ExecutionData
  entitlement?: DataEntitlement
  errors: string[]
  executionTimeMs: number
}

export type ExecutionData =
  | DailyBarsResult
  | IntradayBarsResult
  | SnapshotResult
  | IndexSnapshotResult
  | OptionsChainResult
  | HeatmapResult
  | ExtremesResult

export interface DailyBarsResult {
  type: 'daily_bars'
  bars: Record<string, DailyBar[]>
}

export interface IntradayBarsResult {
  type: 'intraday_bars'
  bars: Record<string, IntradayBar[]>
}

export interface SnapshotResult {
  type: 'universal_snapshot'
  snapshots: UniversalSnapshotItem[]
}

export interface IndexSnapshotResult {
  type: 'index_snapshot'
  snapshots: IndexSnapshotItem[]
}

export interface OptionsChainResult {
  type: 'options_chain'
  chain: OptionSnapshot[]
  metrics: ReturnType<typeof calculateOptionsMetrics> | null
  underlyingPrice: number
}

export interface HeatmapResult {
  type: 'heatmap'
  dates: string[]
  data: Record<string, number[]>
}

export interface ExtremesResult {
  type: 'extremes'
  dates: string[]
  data: Record<string, ReturnType<typeof computeEnhancedMetrics>>
}

// =============================================================================
// Model Selection
// =============================================================================

function getModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic('claude-sonnet-4-20250514')
  }
  return openai('gpt-4-turbo')
}

// =============================================================================
// Plan Generation from Natural Language
// =============================================================================

const PLANNING_SYSTEM_PROMPT = `You are a query planner for a trading dashboard. Given a user's natural language query, you must create a structured execution plan.

## Symbol Mapping Rules:
- 'Semis' or 'Semiconductors' = SOX
- 'Tech' or 'Tech sector' = NDX
- 'Small caps' = RUT
- 'Large caps' = SPX
- 'Nasdaq' = IXIC or NDX depending on context
- 'Dow' = DJI
- 'S&P' or 'S&P 500' = SPX
- 'Fear index' or 'VIX' = VIX
- Common ETFs: SPY (tracks SPX), QQQ (tracks NDX), IWM (tracks RUT)

## Timeframe Mapping:
- 'today' or 'intraday' = intraday
- 'this week' = 5d
- 'this month' = 1mo
- 'quarter' or '3 months' = 3mo
- 'half year' = 6mo
- 'year' or 'annual' = 1y
- 'year to date' = ytd

## Intent Detection:
- Comparing multiple symbols = compare_symbols
- Analyzing a single stock = analyze_symbol
- Options, put/call, gamma, IV = options_flow
- Chart, trend, price action = price_chart
- Heatmap, rolling high matrix = heatmap
- Days since high, % from high = extremes
- Current price, snapshot = snapshot
- Intraday, today's action = intraday

## Asset Class Detection:
- SPX, NDX, RUT, VIX, DJI, SOX = indices
- AAPL, NVDA, TSLA = stocks
- SPY, QQQ, IWM = etf
- If asking about options = options
- Mix of types = mixed

## Output Selection:
- 'show me', 'display' = table or chart
- 'compare' = table
- 'heatmap' = heatmap
- 'options grid' = options_grid
- 'summary', 'brief' = summary

Always prefer more specific intents over generic ones. If unsure between indices and ETFs, prefer ETFs for options queries (options only exist on ETFs, not indices).`

export interface PlanningMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * Transforms natural language messages into a validated QueryPlan.
 * Uses an LLM to understand intent and extract structured parameters.
 */
export async function planFromNaturalLanguage(
  messages: PlanningMessage[]
): Promise<{ success: true; plan: QueryPlan } | { success: false; error: string }> {
  try {
    const result = await generateObject({
      model: getModel(),
      system: PLANNING_SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      schema: QueryPlanSchema,
    })

    // Validate the generated plan
    const parsed = QueryPlanSchema.safeParse(result.object)

    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid plan generated: ${parsed.error.message}`,
      }
    }

    // Apply safety constraints
    const plan = applySafetyConstraints(parsed.data)

    return { success: true, plan }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate plan',
    }
  }
}

// =============================================================================
// Safety Constraint Application
// =============================================================================

function applySafetyConstraints(plan: QueryPlan): QueryPlan {
  // Cap symbol count
  const symbols = plan.symbols.slice(0, SAFETY_LIMITS.maxSymbols)

  // Cap lookback
  const lookback = Math.min(plan.lookback, SAFETY_LIMITS.maxLookback)

  // Normalize all symbols
  const normalizedSymbols = symbols.map((s) => {
    // For options queries, use ETF fallback for indices
    if (plan.intent === 'options_flow') {
      const etfFallback = INDEX_ETF_FALLBACK[s.toUpperCase()]
      if (etfFallback) {
        return etfFallback
      }
    }
    return s.toUpperCase()
  })

  return {
    ...plan,
    symbols: normalizedSymbols,
    lookback,
  }
}

// =============================================================================
// Ticker Normalization with ETF Fallback
// =============================================================================

interface NormalizedTicker {
  original: string
  normalized: string
  isIndex: boolean
  etfFallback: string | null
}

function normalizeTickers(
  symbols: string[],
  useEtfFallback: boolean = false
): NormalizedTicker[] {
  return symbols.map((symbol) => {
    const upper = symbol.toUpperCase().trim()
    const normalized = normalizeSymbol(upper)
    const isIndex = normalized.startsWith('I:')
    const etfFallback = INDEX_ETF_FALLBACK[upper] || INDEX_ETF_FALLBACK[normalized] || null

    return {
      original: symbol,
      normalized: useEtfFallback && isIndex && etfFallback ? etfFallback : normalized,
      isIndex,
      etfFallback,
    }
  })
}

// =============================================================================
// Plan Execution
// =============================================================================

/**
 * Executes a validated QueryPlan by routing to appropriate Massive API wrappers.
 * Applies concurrency limits and handles errors gracefully.
 */
export async function executePlan(plan: QueryPlan): Promise<ExecutionResult> {
  const startTime = Date.now()
  const errors: string[] = []

  // Validate endpoint is allowed
  if (!SAFETY_LIMITS.allowedEndpoints.includes(plan.endpoint)) {
    return {
      success: false,
      plan,
      data: { type: 'daily_bars', bars: {} },
      errors: [`Endpoint '${plan.endpoint}' is not allowed`],
      executionTimeMs: Date.now() - startTime,
    }
  }

  try {
    const result = await executeByEndpoint(plan, errors)

    return {
      success: errors.length === 0,
      plan,
      data: result.data,
      entitlement: result.entitlement,
      errors,
      executionTimeMs: Date.now() - startTime,
    }
  } catch (error) {
    return {
      success: false,
      plan,
      data: { type: 'daily_bars', bars: {} },
      errors: [error instanceof Error ? error.message : 'Unknown execution error'],
      executionTimeMs: Date.now() - startTime,
    }
  }
}

async function executeByEndpoint(
  plan: QueryPlan,
  errors: string[]
): Promise<{ data: ExecutionData; entitlement?: DataEntitlement }> {
  switch (plan.endpoint) {
    case 'daily_bars':
      return executeDailyBars(plan, errors)

    case 'intraday_bars':
      return executeIntradayBars(plan, errors)

    case 'universal_snapshot':
      return executeUniversalSnapshot(plan, errors)

    case 'index_snapshot':
      return executeIndexSnapshot(plan, errors)

    case 'options_chain':
      return executeOptionsChain(plan, errors)

    case 'heatmap':
      return executeHeatmap(plan, errors)

    case 'extremes':
      return executeExtremes(plan, errors)

    default:
      errors.push(`Unknown endpoint: ${plan.endpoint}`)
      return { data: { type: 'daily_bars', bars: {} } }
  }
}

// =============================================================================
// Endpoint Executors
// =============================================================================

async function executeDailyBars(
  plan: QueryPlan,
  errors: string[]
): Promise<{ data: DailyBarsResult }> {
  const days = timeframeToDays(plan.timeframe)
  const normalizedTickers = normalizeTickers(plan.symbols)
  const bars: Record<string, DailyBar[]> = {}

  // Execute with concurrency limit
  const chunks = chunkArray(normalizedTickers, SAFETY_LIMITS.maxConcurrency)

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (ticker) => {
        const data = await fetchDailyBars(ticker.normalized, days + plan.lookback)
        return { ticker, data }
      })
    )

    results.forEach((result, i) => {
      const ticker = chunk[i]
      if (result.status === 'fulfilled') {
        bars[ticker.original] = result.value.data
      } else {
        // Try ETF fallback for indices
        if (ticker.isIndex && ticker.etfFallback) {
          errors.push(
            `Index ${ticker.original} failed, will use ETF fallback ${ticker.etfFallback}`
          )
        } else {
          errors.push(`Failed to fetch ${ticker.original}: ${result.reason}`)
        }
        bars[ticker.original] = []
      }
    })
  }

  return { data: { type: 'daily_bars', bars } }
}

async function executeIntradayBars(
  plan: QueryPlan,
  errors: string[]
): Promise<{ data: IntradayBarsResult }> {
  const normalizedTickers = normalizeTickers(plan.symbols)
  const bars: Record<string, IntradayBar[]> = {}
  // Default to '5m' if granularity is '1d' (daily should use executeDailyBars instead)
  const interval: IntradayInterval = plan.granularity === '1d' ? '5m' : plan.granularity

  const chunks = chunkArray(normalizedTickers, SAFETY_LIMITS.maxConcurrency)

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (ticker) => {
        const response = await fetchIntradayBars(ticker.normalized, interval)
        return { ticker, response }
      })
    )

    results.forEach((result, i) => {
      const ticker = chunk[i]
      if (result.status === 'fulfilled' && result.value.response.success) {
        bars[ticker.original] = result.value.response.results
      } else {
        errors.push(`Failed to fetch intraday for ${ticker.original}`)
        bars[ticker.original] = []
      }
    })
  }

  return { data: { type: 'intraday_bars', bars } }
}

async function executeUniversalSnapshot(
  plan: QueryPlan,
  errors: string[]
): Promise<{ data: SnapshotResult; entitlement?: DataEntitlement }> {
  const response = await fetchUniversalSnapshot({
    symbols: plan.symbols,
    assetClass: plan.assetClass === 'indices' ? 'indices' : 'stocks',
  })

  if (!response.success) {
    errors.push(response.error?.message || 'Universal snapshot failed')
  }

  return {
    data: { type: 'universal_snapshot', snapshots: response.results },
    entitlement: response.entitlement,
  }
}

async function executeIndexSnapshot(
  plan: QueryPlan,
  errors: string[]
): Promise<{ data: IndexSnapshotResult; entitlement?: DataEntitlement }> {
  const response = await fetchIndexSnapshot(plan.symbols)

  if (!response.success) {
    errors.push(response.error?.message || 'Index snapshot failed')
  }

  // If index snapshot failed due to entitlement, suggest ETF fallbacks
  if (!response.success && response.entitlement?.delayed) {
    const fallbacks = plan.symbols
      .map((s) => INDEX_ETF_FALLBACK[s.toUpperCase()])
      .filter(Boolean)
    if (fallbacks.length > 0) {
      errors.push(`Consider using ETF equivalents: ${fallbacks.join(', ')}`)
    }
  }

  return {
    data: { type: 'index_snapshot', snapshots: response.results },
    entitlement: response.entitlement,
  }
}

async function executeOptionsChain(
  plan: QueryPlan,
  errors: string[]
): Promise<{ data: OptionsChainResult }> {
  // Options only exist on ETFs/stocks, not indices
  const normalizedTickers = normalizeTickers(plan.symbols, true) // Use ETF fallback
  const symbol = normalizedTickers[0]?.normalized || plan.symbols[0]

  const response = await fetchOptionsChain(symbol, { limit: 500 })

  if (!response.success) {
    errors.push(response.error?.message || `Options chain failed for ${symbol}`)
    return {
      data: {
        type: 'options_chain',
        chain: [],
        metrics: null,
        underlyingPrice: 0,
      },
    }
  }

  const metrics = response.results.length > 0 ? calculateOptionsMetrics(response.results) : null

  return {
    data: {
      type: 'options_chain',
      chain: response.results,
      metrics,
      underlyingPrice: response.underlying_price,
    },
  }
}

async function executeHeatmap(
  plan: QueryPlan,
  errors: string[]
): Promise<{ data: HeatmapResult }> {
  const days = timeframeToDays(plan.timeframe)
  const normalizedTickers = normalizeTickers(plan.symbols)

  const dates: string[] = []
  const data: Record<string, number[]> = {}

  const chunks = chunkArray(normalizedTickers, SAFETY_LIMITS.maxConcurrency)

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (ticker) => {
        const bars = await fetchDailyBars(ticker.normalized, days + plan.lookback)
        const chronological = [...bars].reverse()
        const heatmapValues = computeHeatmap(chronological, plan.lookback, 'close')
        return { ticker, bars: chronological, heatmapValues }
      })
    )

    results.forEach((result, i) => {
      const ticker = chunk[i]
      if (result.status === 'fulfilled') {
        const displayBars = result.value.bars.slice(-days)
        const displayValues = result.value.heatmapValues.slice(-days)

        if (dates.length === 0) {
          dates.push(...displayBars.map((bar) => bar.date))
        }

        data[ticker.original] = displayValues
      } else {
        errors.push(`Heatmap failed for ${ticker.original}`)
        data[ticker.original] = []
      }
    })
  }

  return { data: { type: 'heatmap', dates, data } }
}

async function executeExtremes(
  plan: QueryPlan,
  errors: string[]
): Promise<{ data: ExtremesResult }> {
  const days = timeframeToDays(plan.timeframe)
  const normalizedTickers = normalizeTickers(plan.symbols)

  const dates: string[] = []
  const data: Record<string, ReturnType<typeof computeEnhancedMetrics>> = {}

  const chunks = chunkArray(normalizedTickers, SAFETY_LIMITS.maxConcurrency)

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (ticker) => {
        const bars = await fetchDailyBars(ticker.normalized, days + plan.lookback)
        const chronological = [...bars].reverse()
        const metrics = computeEnhancedMetrics(chronological, plan.lookback, 'close')
        return { ticker, bars: chronological, metrics }
      })
    )

    results.forEach((result, i) => {
      const ticker = chunk[i]
      if (result.status === 'fulfilled') {
        const displayBars = result.value.bars.slice(-days)
        const displayMetrics = result.value.metrics.slice(-days)

        if (dates.length === 0) {
          dates.push(...displayBars.map((bar) => bar.date))
        }

        data[ticker.original] = displayMetrics
      } else {
        errors.push(`Extremes failed for ${ticker.original}`)
        data[ticker.original] = []
      }
    })
  }

  return { data: { type: 'extremes', dates, data } }
}

// =============================================================================
// Utility Functions
// =============================================================================

function timeframeToDays(timeframe: Timeframe): number {
  const mapping: Record<Timeframe, number> = {
    '1d': 1,
    '5d': 5,
    '1mo': 21,
    '3mo': 63,
    '6mo': 126,
    '1y': 252,
    ytd: Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
        (1000 * 60 * 60 * 24)
    ),
    intraday: 1,
  }
  return Math.min(mapping[timeframe] || 63, SAFETY_LIMITS.maxDateRangeDays)
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * One-shot function: takes a natural language query and returns execution results.
 */
export async function queryFromNaturalLanguage(
  query: string
): Promise<ExecutionResult | { success: false; error: string }> {
  const planResult = await planFromNaturalLanguage([
    { role: 'user', content: query },
  ])

  if (!planResult.success) {
    return { success: false, error: planResult.error }
  }

  return executePlan(planResult.plan)
}
