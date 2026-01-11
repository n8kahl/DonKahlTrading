// =============================================================================
// Massive/Polygon API - Universal Client
// =============================================================================
//
// Provides a type-safe, cached, rate-limited interface to the Massive API.
// All requests are validated against the operations allowlist.
// =============================================================================

import { z } from 'zod'
import {
  MASSIVE_BASE_URL,
  ALLOWED_OPERATIONS,
  PARAM_SCHEMAS,
  type MassiveOperationId,
  isAllowedOperation,
} from './operations'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CachePolicy {
  /** Cache TTL in seconds. 0 = no cache. */
  ttl: number
  /** Whether to use stale-while-revalidate */
  swr?: boolean
}

export interface RequestOptions {
  cachePolicy?: CachePolicy
  signal?: AbortSignal
}

export interface MassiveResponse<T> {
  success: boolean
  data: T | null
  error: MassiveError | null
  cached: boolean
  latencyMs: number
}

export interface MassiveError {
  code: string
  message: string
  details?: unknown
}

// -----------------------------------------------------------------------------
// In-Memory Cache (simple implementation)
// -----------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

const cache = new Map<string, CacheEntry<unknown>>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null

  const now = Date.now()
  const age = (now - entry.timestamp) / 1000

  if (age > entry.ttl) {
    cache.delete(key)
    return null
  }

  return entry.data
}

function setCache<T>(key: string, data: T, ttl: number): void {
  if (ttl <= 0) return

  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  })

  // Cleanup old entries periodically
  if (cache.size > 500) {
    const now = Date.now()
    for (const [k, v] of cache.entries()) {
      if ((now - v.timestamp) / 1000 > v.ttl) {
        cache.delete(k)
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Rate Limiting (simple in-memory)
// -----------------------------------------------------------------------------

interface RateLimitState {
  count: number
  windowStart: number
}

const rateLimits = new Map<string, RateLimitState>()

const RATE_LIMIT = {
  windowMs: 60000, // 1 minute
  maxRequests: 60, // 60 requests per minute (conservative)
}

function checkRateLimit(): boolean {
  const key = 'global'
  const now = Date.now()
  const state = rateLimits.get(key)

  if (!state || now - state.windowStart > RATE_LIMIT.windowMs) {
    rateLimits.set(key, { count: 1, windowStart: now })
    return true
  }

  if (state.count >= RATE_LIMIT.maxRequests) {
    return false
  }

  state.count++
  return true
}

// -----------------------------------------------------------------------------
// URL Builder
// -----------------------------------------------------------------------------

function buildUrl(
  pathTemplate: string,
  params: Record<string, unknown>
): string {
  let path = pathTemplate

  // Replace path parameters
  const pathParamRegex = /\{(\w+)\}/g
  path = path.replace(pathParamRegex, (_, key) => {
    const value = params[key]
    if (value === undefined) {
      throw new Error(`Missing required path parameter: ${key}`)
    }
    return encodeURIComponent(String(value))
  })

  // Build query string from remaining params
  const usedParams = new Set(
    [...pathTemplate.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
  )
  const queryParams: string[] = []

  for (const [key, value] of Object.entries(params)) {
    if (!usedParams.has(key) && value !== undefined) {
      queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }

  const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : ''

  return `${MASSIVE_BASE_URL}${path}${queryString}`
}

// -----------------------------------------------------------------------------
// Default Cache Policy (based on market hours)
// -----------------------------------------------------------------------------

export function getDefaultCachePolicy(): CachePolicy {
  const now = new Date()
  const hour = now.getUTCHours()
  const day = now.getUTCDay()

  // Weekend = long cache
  if (day === 0 || day === 6) {
    return { ttl: 3600, swr: true } // 1 hour
  }

  // Market hours (14:30 - 21:00 UTC) = short cache
  if (hour >= 14 && hour < 21) {
    return { ttl: 30, swr: true } // 30 seconds
  }

  // Extended hours = medium cache
  if ((hour >= 9 && hour < 14) || (hour >= 21 && hour < 24)) {
    return { ttl: 120, swr: true } // 2 minutes
  }

  // Overnight = long cache
  return { ttl: 900, swr: true } // 15 minutes
}

// -----------------------------------------------------------------------------
// Main Request Function
// -----------------------------------------------------------------------------

export async function massiveRequest<T>(
  opId: MassiveOperationId,
  params: Record<string, unknown>,
  opts?: RequestOptions
): Promise<MassiveResponse<T>> {
  const startTime = performance.now()

  // Validate operation is allowed
  if (!isAllowedOperation(opId)) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_OPERATION',
        message: `Operation '${opId}' is not in the allowlist`,
      },
      cached: false,
      latencyMs: performance.now() - startTime,
    }
  }

  const op = ALLOWED_OPERATIONS[opId]

  // Validate parameters
  const paramSchema = PARAM_SCHEMAS[opId]
  const paramResult = paramSchema.safeParse(params)

  if (!paramResult.success) {
    return {
      success: false,
      data: null,
      error: {
        code: 'INVALID_PARAMS',
        message: 'Parameter validation failed',
        details: paramResult.error.errors,
      },
      cached: false,
      latencyMs: performance.now() - startTime,
    }
  }

  // Check rate limit
  if (!checkRateLimit()) {
    return {
      success: false,
      data: null,
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded. Please wait and try again.',
      },
      cached: false,
      latencyMs: performance.now() - startTime,
    }
  }

  // Build URL
  const url = buildUrl(op.pathTemplate, params)
  const cacheKey = `${opId}:${url}`

  // Check cache
  const cachePolicy = opts?.cachePolicy ?? getDefaultCachePolicy()
  const cachedData = getCached<T>(cacheKey)

  if (cachedData !== null) {
    return {
      success: true,
      data: cachedData,
      error: null,
      cached: true,
      latencyMs: performance.now() - startTime,
    }
  }

  // Make request
  const apiKey = process.env.MASSIVE_API_KEY

  if (!apiKey) {
    return {
      success: false,
      data: null,
      error: {
        code: 'NO_API_KEY',
        message: 'MASSIVE_API_KEY environment variable is not set',
      },
      cached: false,
      latencyMs: performance.now() - startTime,
    }
  }

  try {
    const separator = url.includes('?') ? '&' : '?'
    const response = await fetch(`${url}${separator}apiKey=${apiKey}`, {
      method: op.method,
      signal: opts?.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      return {
        success: false,
        data: null,
        error: {
          code: `HTTP_${response.status}`,
          message: `API request failed: ${response.status}`,
          details: errorText,
        },
        cached: false,
        latencyMs: performance.now() - startTime,
      }
    }

    const rawData = await response.json()

    // Validate response schema
    const validationResult = op.responseSchema.safeParse(rawData)

    if (!validationResult.success) {
      // Log but don't fail - API responses can be inconsistent
      console.warn(`[MassiveClient] Response validation warning for ${opId}:`, validationResult.error.errors)
    }

    const data = rawData as T

    // Cache the result
    setCache(cacheKey, data, cachePolicy.ttl)

    return {
      success: true,
      data,
      error: null,
      cached: false,
      latencyMs: performance.now() - startTime,
    }
  } catch (err) {
    const isAborted = err instanceof Error && err.name === 'AbortError'

    return {
      success: false,
      data: null,
      error: {
        code: isAborted ? 'ABORTED' : 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Unknown fetch error',
      },
      cached: false,
      latencyMs: performance.now() - startTime,
    }
  }
}

// -----------------------------------------------------------------------------
// Convenience Methods for Common Operations
// -----------------------------------------------------------------------------

export async function fetchAggregates(
  ticker: string,
  multiplier: number,
  timespan: 'minute' | 'hour' | 'day' | 'week' | 'month',
  from: string,
  to: string,
  opts?: RequestOptions
) {
  return massiveRequest<z.infer<typeof ALLOWED_OPERATIONS.aggregates.responseSchema>>(
    'aggregates',
    { ticker, multiplier, timespan, from, to, adjusted: true, sort: 'asc' },
    opts
  )
}

export async function fetchSnapshot(ticker: string, opts?: RequestOptions) {
  return massiveRequest<z.infer<typeof ALLOWED_OPERATIONS.snapshotTicker.responseSchema>>(
    'snapshotTicker',
    { ticker },
    opts
  )
}

export async function fetchOptionsChain(
  underlying: string,
  options?: {
    strike_price?: number
    expiration_date?: string
    contract_type?: 'call' | 'put'
    limit?: number
  },
  opts?: RequestOptions
) {
  return massiveRequest<z.infer<typeof ALLOWED_OPERATIONS.optionsChain.responseSchema>>(
    'optionsChain',
    { underlying, ...options },
    opts
  )
}

export async function fetchMarketStatus(opts?: RequestOptions) {
  return massiveRequest<z.infer<typeof ALLOWED_OPERATIONS.marketStatus.responseSchema>>(
    'marketStatus',
    {},
    opts
  )
}

export async function fetchGainers(opts?: RequestOptions) {
  return massiveRequest<z.infer<typeof ALLOWED_OPERATIONS.snapshotGainers.responseSchema>>(
    'snapshotGainers',
    {},
    opts
  )
}

export async function fetchLosers(opts?: RequestOptions) {
  return massiveRequest<z.infer<typeof ALLOWED_OPERATIONS.snapshotLosers.responseSchema>>(
    'snapshotLosers',
    {},
    opts
  )
}
