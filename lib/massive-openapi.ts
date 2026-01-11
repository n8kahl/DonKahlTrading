// =============================================================================
// Tucson Trader - Massive/Polygon OpenAPI Client
// Loads OpenAPI spec and executes validated requests
// =============================================================================

// Simplified OpenAPI types for Polygon.io API
interface OpenAPIOperation {
  operationId: string
  summary?: string
  description?: string
  parameters?: Array<{
    name: string
    in: 'path' | 'query' | 'header'
    required?: boolean
    schema?: {
      type: string
      enum?: string[]
      default?: any
    }
    description?: string
  }>
}

interface OpenAPISpec {
  paths: Record<string, Record<string, OpenAPIOperation>>
  servers?: Array<{ url: string }>
}

// Cache for OpenAPI spec
let cachedSpec: OpenAPISpec | null = null

// -----------------------------------------------------------------------------
// Supported Operations (subset of Polygon.io API)
// -----------------------------------------------------------------------------

// Define supported operations with their paths and parameters
const SUPPORTED_OPERATIONS: Record<string, {
  path: string
  method: 'GET' | 'POST'
  description: string
  parameters: Array<{
    name: string
    in: 'path' | 'query'
    required: boolean
    type: string
    description: string
    default?: any
  }>
}> = {
  // Aggregates (OHLCV bars)
  'get_aggs': {
    path: '/v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}',
    method: 'GET',
    description: 'Get aggregate bars for a stock over a given date range',
    parameters: [
      { name: 'stocksTicker', in: 'path', required: true, type: 'string', description: 'Stock ticker symbol (e.g., AAPL)' },
      { name: 'multiplier', in: 'path', required: true, type: 'number', description: 'Size of the timespan multiplier' },
      { name: 'timespan', in: 'path', required: true, type: 'string', description: 'Size of the time window (minute, hour, day, week, month, quarter, year)' },
      { name: 'from', in: 'path', required: true, type: 'string', description: 'Start date (YYYY-MM-DD)' },
      { name: 'to', in: 'path', required: true, type: 'string', description: 'End date (YYYY-MM-DD)' },
      { name: 'adjusted', in: 'query', required: false, type: 'boolean', description: 'Whether results are adjusted for splits', default: true },
      { name: 'sort', in: 'query', required: false, type: 'string', description: 'Sort order (asc or desc)', default: 'asc' },
      { name: 'limit', in: 'query', required: false, type: 'number', description: 'Limit the number of results', default: 5000 },
    ],
  },

  // Snapshot - all tickers
  'get_snapshot_all': {
    path: '/v2/snapshot/locale/us/markets/stocks/tickers',
    method: 'GET',
    description: 'Get the most up-to-date market data for all US stocks',
    parameters: [
      { name: 'tickers', in: 'query', required: false, type: 'string', description: 'Comma-separated list of tickers to filter' },
      { name: 'include_otc', in: 'query', required: false, type: 'boolean', description: 'Include OTC securities', default: false },
    ],
  },

  // Snapshot - single ticker
  'get_snapshot_ticker': {
    path: '/v2/snapshot/locale/us/markets/stocks/tickers/{stocksTicker}',
    method: 'GET',
    description: 'Get the most up-to-date market data for a single stock',
    parameters: [
      { name: 'stocksTicker', in: 'path', required: true, type: 'string', description: 'Stock ticker symbol' },
    ],
  },

  // Gainers/Losers
  'get_snapshot_gainers_losers': {
    path: '/v2/snapshot/locale/us/markets/stocks/{direction}',
    method: 'GET',
    description: 'Get the current top gainers or losers',
    parameters: [
      { name: 'direction', in: 'path', required: true, type: 'string', description: 'Direction (gainers or losers)' },
      { name: 'include_otc', in: 'query', required: false, type: 'boolean', description: 'Include OTC securities', default: false },
    ],
  },

  // Previous close
  'get_previous_close': {
    path: '/v2/aggs/ticker/{stocksTicker}/prev',
    method: 'GET',
    description: 'Get the previous day\'s OHLCV for a stock',
    parameters: [
      { name: 'stocksTicker', in: 'path', required: true, type: 'string', description: 'Stock ticker symbol' },
      { name: 'adjusted', in: 'query', required: false, type: 'boolean', description: 'Whether results are adjusted', default: true },
    ],
  },

  // Market status
  'get_market_status': {
    path: '/v1/marketstatus/now',
    method: 'GET',
    description: 'Get the current trading status of the US markets',
    parameters: [],
  },
}

// -----------------------------------------------------------------------------
// API Functions
// -----------------------------------------------------------------------------

const BASE_URL = 'https://api.polygon.io'

function getApiKey(): string {
  return process.env.MASSIVE_API_KEY || ''
}

/**
 * Get list of available operations
 */
export function getAvailableOperations(): Array<{
  operationId: string
  description: string
  parameters: typeof SUPPORTED_OPERATIONS[string]['parameters']
}> {
  return Object.entries(SUPPORTED_OPERATIONS).map(([operationId, op]) => ({
    operationId,
    description: op.description,
    parameters: op.parameters,
  }))
}

/**
 * Get operation details by ID
 */
export function getOperationById(operationId: string) {
  return SUPPORTED_OPERATIONS[operationId] || null
}

/**
 * Validate parameters against operation schema
 */
export function validateParams(
  operationId: string,
  params: Record<string, any>
): { valid: boolean; errors: string[] } {
  const operation = SUPPORTED_OPERATIONS[operationId]
  if (!operation) {
    return { valid: false, errors: [`Unknown operation: ${operationId}`] }
  }

  const errors: string[] = []

  // Check required parameters
  for (const param of operation.parameters) {
    if (param.required && !(param.name in params)) {
      errors.push(`Missing required parameter: ${param.name}`)
    }
  }

  // Check parameter types
  for (const [key, value] of Object.entries(params)) {
    const paramDef = operation.parameters.find((p) => p.name === key)
    if (!paramDef) {
      // Skip unknown parameters (could be intentional)
      continue
    }

    if (paramDef.type === 'number' && typeof value !== 'number') {
      errors.push(`Parameter ${key} should be a number`)
    }
    if (paramDef.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Parameter ${key} should be a boolean`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Build URL from operation and parameters
 */
function buildUrl(operationId: string, params: Record<string, any>): string {
  const operation = SUPPORTED_OPERATIONS[operationId]
  if (!operation) {
    throw new Error(`Unknown operation: ${operationId}`)
  }

  let path = operation.path

  // Replace path parameters
  for (const param of operation.parameters.filter((p) => p.in === 'path')) {
    const value = params[param.name]
    if (value !== undefined) {
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)))
    }
  }

  // Build query string
  const queryParams: string[] = []
  for (const param of operation.parameters.filter((p) => p.in === 'query')) {
    const value = params[param.name] ?? param.default
    if (value !== undefined) {
      queryParams.push(`${param.name}=${encodeURIComponent(String(value))}`)
    }
  }

  // Add API key
  queryParams.push(`apiKey=${getApiKey()}`)

  return `${BASE_URL}${path}?${queryParams.join('&')}`
}

/**
 * Execute a Massive API request
 */
export async function massiveRequest(
  operationId: string,
  params: Record<string, any>
): Promise<{
  success: boolean
  data?: any
  error?: string
  operationId: string
  params: Record<string, any>
}> {
  // Validate parameters
  const validation = validateParams(operationId, params)
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join(', ')}`,
      operationId,
      params,
    }
  }

  try {
    const url = buildUrl(operationId, params)
    const response = await fetch(url)

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `API error ${response.status}: ${errorText}`,
        operationId,
        params,
      }
    }

    const data = await response.json()
    return {
      success: true,
      data,
      operationId,
      params,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      operationId,
      params,
    }
  }
}

// -----------------------------------------------------------------------------
// Result Types for Visualization
// -----------------------------------------------------------------------------

export interface AggregateBar {
  t: number // Timestamp
  o: number // Open
  h: number // High
  l: number // Low
  c: number // Close
  v: number // Volume
  vw?: number // VWAP
  n?: number // Number of trades
}

export interface SnapshotTicker {
  ticker: string
  todaysChangePerc: number
  todaysChange: number
  updated: number
  day: {
    o: number
    h: number
    l: number
    c: number
    v: number
    vw: number
  }
  prevDay: {
    o: number
    h: number
    l: number
    c: number
    v: number
    vw: number
  }
}

/**
 * Transform API response for visualization
 */
export function transformForVisualization(
  operationId: string,
  data: any
): {
  type: 'chart' | 'table' | 'value'
  title: string
  chartData?: Array<{ date: string; value: number; [key: string]: any }>
  tableData?: Array<Record<string, any>>
  value?: { label: string; value: string | number }
} {
  switch (operationId) {
    case 'get_aggs': {
      const bars = data.results as AggregateBar[]
      return {
        type: 'chart',
        title: `${data.ticker} Price History`,
        chartData: bars.map((bar) => ({
          date: new Date(bar.t).toISOString().split('T')[0],
          value: bar.c,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v,
        })),
      }
    }

    case 'get_snapshot_ticker': {
      const ticker = data.ticker as SnapshotTicker
      return {
        type: 'value',
        title: `${ticker.ticker} Snapshot`,
        value: {
          label: `${ticker.ticker} Today`,
          value: `${ticker.todaysChangePerc >= 0 ? '+' : ''}${ticker.todaysChangePerc.toFixed(2)}%`,
        },
      }
    }

    case 'get_snapshot_gainers_losers': {
      const tickers = data.tickers as SnapshotTicker[]
      return {
        type: 'table',
        title: 'Top Movers',
        tableData: tickers.slice(0, 10).map((t) => ({
          ticker: t.ticker,
          change: `${t.todaysChangePerc >= 0 ? '+' : ''}${t.todaysChangePerc.toFixed(2)}%`,
          price: t.day.c.toFixed(2),
          volume: (t.day.v / 1000000).toFixed(2) + 'M',
        })),
      }
    }

    case 'get_market_status': {
      return {
        type: 'value',
        title: 'Market Status',
        value: {
          label: 'Current Status',
          value: data.market || 'Unknown',
        },
      }
    }

    default:
      return {
        type: 'table',
        title: 'API Response',
        tableData: [data],
      }
  }
}
