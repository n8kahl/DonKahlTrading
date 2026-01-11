// =============================================================================
// Tucson Trader - Rate Limiting
// In-memory rate limiter with sliding window
// =============================================================================

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterMs?: number
}

// =============================================================================
// In-Memory Store
// =============================================================================

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.windowStart > 3600000) {
        // 1 hour expiry
        rateLimitStore.delete(key)
      }
    }
  }, 300000) // 5 minutes
}

// =============================================================================
// Rate Limiter
// =============================================================================

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  // No existing entry or window expired - create new window
  if (!entry || now - entry.windowStart >= config.windowMs) {
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
    })

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    }
  }

  // Within window - check if limit exceeded
  if (entry.count >= config.maxRequests) {
    const resetAt = entry.windowStart + config.windowMs
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs: resetAt - now,
    }
  }

  // Increment count
  entry.count++
  rateLimitStore.set(key, entry)

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.windowStart + config.windowMs,
  }
}

// =============================================================================
// Preset Configurations
// =============================================================================

export const RATE_LIMITS = {
  // Standard API endpoints
  standard: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  } as RateLimitConfig,

  // Heavy computation endpoints (heatmap, extremes)
  heavy: {
    windowMs: 60 * 1000,
    maxRequests: 20, // 20 per minute
  } as RateLimitConfig,

  // Chat/AI endpoints
  chat: {
    windowMs: 60 * 1000,
    maxRequests: 10, // 10 per minute
  } as RateLimitConfig,

  // Health check (relaxed)
  health: {
    windowMs: 60 * 1000,
    maxRequests: 120, // 2 per second
  } as RateLimitConfig,
} as const

// =============================================================================
// IP Extraction Helper
// =============================================================================

export function getClientIP(request: Request): string {
  // Try various headers in order of priority
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // Fallback for development
  return 'unknown'
}

// =============================================================================
// Middleware Helper
// =============================================================================

import { NextResponse } from 'next/server'

export function withRateLimit(
  request: Request,
  config: RateLimitConfig = RATE_LIMITS.standard
): RateLimitResult & { response?: NextResponse } {
  const ip = getClientIP(request)
  const path = new URL(request.url).pathname
  const key = `${ip}:${path}`

  const result = checkRateLimit(key, config)

  if (!result.allowed) {
    return {
      ...result,
      response: NextResponse.json(
        {
          error: 'Too many requests',
          retryAfterMs: result.retryAfterMs,
          resetAt: new Date(result.resetAt).toISOString(),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((result.retryAfterMs || 0) / 1000)),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
          },
        }
      ),
    }
  }

  return result
}

// =============================================================================
// Cache Tags for Next.js
// =============================================================================

export const CACHE_TAGS = {
  // Market data
  marketStatus: 'market-status',
  sectors: 'sectors',
  movers: 'movers',
  riskRegime: 'risk-regime',

  // Symbol-specific
  symbolPrefix: 'symbol-', // e.g., 'symbol-AAPL'

  // Computed data
  heatmap: 'heatmap',
  extremes: 'extremes',
  relativeStrength: 'relative-strength',

  // Dashboard
  dashboard: 'dashboard',
} as const

export function symbolTag(symbol: string): string {
  return `${CACHE_TAGS.symbolPrefix}${symbol.toUpperCase()}`
}

// Revalidation times based on market status
export function getCacheRevalidation(isMarketOpen: boolean): number {
  return isMarketOpen ? 60 : 300 // 1 min during market, 5 min otherwise
}
