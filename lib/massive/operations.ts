// =============================================================================
// Massive/Polygon API - Allowed Operations Registry
// =============================================================================
//
// Security: Only operations defined here can be called by the AI.
// This prevents arbitrary API access and ensures type-safe usage.
// =============================================================================

import { z } from 'zod'

// -----------------------------------------------------------------------------
// Base URL Configuration
// -----------------------------------------------------------------------------

export const MASSIVE_BASE_URL = 'https://api.polygon.io'

// -----------------------------------------------------------------------------
// Response Schemas (for validation)
// -----------------------------------------------------------------------------

export const AggregatesResultSchema = z.object({
  v: z.number().optional(), // volume
  vw: z.number().optional(), // volume weighted average
  o: z.number(), // open
  c: z.number(), // close
  h: z.number(), // high
  l: z.number(), // low
  t: z.number(), // timestamp (ms)
  n: z.number().optional(), // number of transactions
})

export const AggregatesResponseSchema = z.object({
  ticker: z.string(),
  queryCount: z.number().optional(),
  resultsCount: z.number().optional(),
  adjusted: z.boolean().optional(),
  results: z.array(AggregatesResultSchema).optional().default([]),
  status: z.string().optional(),
  request_id: z.string().optional(),
  count: z.number().optional(),
})

export const SnapshotTickerSchema = z.object({
  ticker: z.string(),
  todaysChange: z.number().optional(),
  todaysChangePerc: z.number().optional(),
  updated: z.number().optional(),
  day: z.object({
    o: z.number().optional(),
    h: z.number().optional(),
    l: z.number().optional(),
    c: z.number().optional(),
    v: z.number().optional(),
    vw: z.number().optional(),
  }).optional(),
  prevDay: z.object({
    o: z.number().optional(),
    h: z.number().optional(),
    l: z.number().optional(),
    c: z.number().optional(),
    v: z.number().optional(),
    vw: z.number().optional(),
  }).optional(),
  min: z.object({
    o: z.number().optional(),
    h: z.number().optional(),
    l: z.number().optional(),
    c: z.number().optional(),
    v: z.number().optional(),
    av: z.number().optional(),
    vw: z.number().optional(),
  }).optional(),
})

export const SnapshotResponseSchema = z.object({
  status: z.string().optional(),
  request_id: z.string().optional(),
  ticker: SnapshotTickerSchema.optional(),
})

export const SnapshotAllResponseSchema = z.object({
  status: z.string().optional(),
  tickers: z.array(SnapshotTickerSchema).optional().default([]),
})

export const OptionsContractSchema = z.object({
  ticker: z.string(),
  underlying_ticker: z.string().optional(), // Sometimes missing in Polygon API responses
  contract_type: z.enum(['call', 'put']),
  strike_price: z.number(),
  expiration_date: z.string(),
  shares_per_contract: z.number().optional().default(100),
  exercise_style: z.string().optional(),
})

export const OptionsSnapshotSchema = z.object({
  break_even_price: z.number().optional(),
  day: z.object({
    change: z.number().optional(),
    change_percent: z.number().optional(),
    close: z.number().optional(),
    high: z.number().optional(),
    last_updated: z.number().optional(),
    low: z.number().optional(),
    open: z.number().optional(),
    previous_close: z.number().optional(),
    volume: z.number().optional(),
    vwap: z.number().optional(),
  }).optional(),
  details: OptionsContractSchema.optional(),
  greeks: z.object({
    delta: z.number().optional(),
    gamma: z.number().optional(),
    theta: z.number().optional(),
    vega: z.number().optional(),
  }).optional(),
  implied_volatility: z.number().optional(),
  last_quote: z.object({
    ask: z.number().optional(),
    ask_size: z.number().optional(),
    bid: z.number().optional(),
    bid_size: z.number().optional(),
    last_updated: z.number().optional(),
    midpoint: z.number().optional(),
  }).optional(),
  open_interest: z.number().optional(),
  underlying_asset: z.object({
    change_to_break_even: z.number().optional(),
    last_updated: z.number().optional(),
    price: z.number().optional(),
    ticker: z.string().optional(),
  }).optional(),
})

export const OptionsChainResponseSchema = z.object({
  status: z.string().optional(),
  request_id: z.string().optional(),
  results: z.array(OptionsSnapshotSchema).optional().default([]),
  next_url: z.string().optional(),
})

export const MarketStatusSchema = z.object({
  afterHours: z.boolean().optional(),
  currencies: z.object({
    crypto: z.string().optional(),
    fx: z.string().optional(),
  }).optional(),
  earlyHours: z.boolean().optional(),
  exchanges: z.object({
    nasdaq: z.string().optional(),
    nyse: z.string().optional(),
    otc: z.string().optional(),
  }).optional(),
  market: z.string().optional(),
  serverTime: z.string().optional(),
})

// -----------------------------------------------------------------------------
// Operation Definitions
// -----------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST'

export interface OperationDef {
  operationId: string
  method: HttpMethod
  pathTemplate: string
  description: string
  requiredParams: readonly string[]
  optionalParams: readonly string[]
  responseSchema: z.ZodType<unknown>
  rateWeight: number // For rate limiting (1 = normal, 5 = heavy)
}

// The allowlist of operations the AI can call
export const ALLOWED_OPERATIONS = {
  // Historical aggregates (OHLCV bars)
  aggregates: {
    operationId: 'aggregates',
    method: 'GET' as const,
    pathTemplate: '/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}',
    description: 'Get historical OHLCV bars for a ticker',
    requiredParams: ['ticker', 'multiplier', 'timespan', 'from', 'to'],
    optionalParams: ['adjusted', 'sort', 'limit'],
    responseSchema: AggregatesResponseSchema,
    rateWeight: 1,
  },

  // Single ticker snapshot
  snapshotTicker: {
    operationId: 'snapshotTicker',
    method: 'GET' as const,
    pathTemplate: '/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}',
    description: 'Get current snapshot for a single stock ticker',
    requiredParams: ['ticker'],
    optionalParams: [],
    responseSchema: SnapshotResponseSchema,
    rateWeight: 1,
  },

  // All tickers snapshot (gainers/losers)
  snapshotGainers: {
    operationId: 'snapshotGainers',
    method: 'GET' as const,
    pathTemplate: '/v2/snapshot/locale/us/markets/stocks/gainers',
    description: 'Get top gaining stocks',
    requiredParams: [],
    optionalParams: [],
    responseSchema: SnapshotAllResponseSchema,
    rateWeight: 3,
  },

  snapshotLosers: {
    operationId: 'snapshotLosers',
    method: 'GET' as const,
    pathTemplate: '/v2/snapshot/locale/us/markets/stocks/losers',
    description: 'Get top losing stocks',
    requiredParams: [],
    optionalParams: [],
    responseSchema: SnapshotAllResponseSchema,
    rateWeight: 3,
  },

  // Options chain snapshot
  optionsChain: {
    operationId: 'optionsChain',
    method: 'GET' as const,
    pathTemplate: '/v3/snapshot/options/{underlying}',
    description: 'Get options chain snapshot for an underlying',
    requiredParams: ['underlying'],
    optionalParams: ['strike_price', 'expiration_date', 'contract_type', 'limit', 'order', 'sort'],
    responseSchema: OptionsChainResponseSchema,
    rateWeight: 5,
  },

  // Market status
  marketStatus: {
    operationId: 'marketStatus',
    method: 'GET' as const,
    pathTemplate: '/v1/marketstatus/now',
    description: 'Get current market status (open/closed)',
    requiredParams: [],
    optionalParams: [],
    responseSchema: MarketStatusSchema,
    rateWeight: 1,
  },
} as const

export type MassiveOperationId = keyof typeof ALLOWED_OPERATIONS

// -----------------------------------------------------------------------------
// Parameter Validation Schemas
// -----------------------------------------------------------------------------

export const AggregatesParamsSchema = z.object({
  ticker: z.string().min(1).max(20),
  multiplier: z.number().int().min(1).max(60),
  timespan: z.enum(['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adjusted: z.boolean().optional(),
  sort: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(50000).optional(),
})

export const SnapshotTickerParamsSchema = z.object({
  ticker: z.string().min(1).max(20),
})

export const OptionsChainParamsSchema = z.object({
  underlying: z.string().min(1).max(20),
  strike_price: z.number().optional(),
  expiration_date: z.string().optional(),
  contract_type: z.enum(['call', 'put']).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  sort: z.string().optional(),
})

export const PARAM_SCHEMAS: Record<MassiveOperationId, z.ZodType<unknown>> = {
  aggregates: AggregatesParamsSchema,
  snapshotTicker: SnapshotTickerParamsSchema,
  snapshotGainers: z.object({}),
  snapshotLosers: z.object({}),
  optionsChain: OptionsChainParamsSchema,
  marketStatus: z.object({}),
}

// -----------------------------------------------------------------------------
// Helper: Check if operation is allowed
// -----------------------------------------------------------------------------

export function isAllowedOperation(opId: string): opId is MassiveOperationId {
  return opId in ALLOWED_OPERATIONS
}

// -----------------------------------------------------------------------------
// Helper: Get operation definition
// -----------------------------------------------------------------------------

export function getOperationDef(opId: MassiveOperationId): OperationDef {
  return ALLOWED_OPERATIONS[opId]
}
