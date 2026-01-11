import { NextResponse } from 'next/server'
import { fetchAllMovers, buildResponseMeta } from '@/lib/massive-api'
import { logger, startTiming, endTiming } from '@/lib/logger'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/movers
 * Returns top gainers, losers, and most active stocks
 */
export async function GET(request: Request) {
  const ctx = startTiming('/api/movers')

  // Rate limiting
  const rateLimit = withRateLimit(request, RATE_LIMITS.standard)
  if (rateLimit.response) {
    logger.warn('Rate limit exceeded', { requestId: ctx.requestId, endpoint: ctx.endpoint })
    return rateLimit.response
  }

  try {
    logger.apiRequest(ctx.endpoint, 'GET', { requestId: ctx.requestId })

    const result = await fetchAllMovers()
    const durationMs = endTiming(ctx)

    if (!result.success) {
      logger.apiError(ctx.endpoint, result.error?.code || 'UNKNOWN', result.error?.message || 'Failed', {
        requestId: ctx.requestId,
        durationMs,
      })

      return NextResponse.json(
        { error: result.error?.message || 'Failed to fetch movers' },
        {
          status: 500,
          headers: {
            'X-Request-Id': ctx.requestId,
            'X-Response-Time': `${durationMs}ms`,
          },
        }
      )
    }

    logger.apiResponse(ctx.endpoint, 200, durationMs, { requestId: ctx.requestId })

    return NextResponse.json(
      {
        gainers: result.gainers,
        losers: result.losers,
        mostActive: result.mostActive,
        meta: buildResponseMeta(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
          'X-Request-Id': ctx.requestId,
          'X-Response-Time': `${durationMs}ms`,
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    )
  } catch (error) {
    const durationMs = endTiming(ctx)
    logger.apiError(ctx.endpoint, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', {
      requestId: ctx.requestId,
      durationMs,
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: {
          'X-Request-Id': ctx.requestId,
          'X-Response-Time': `${durationMs}ms`,
        },
      }
    )
  }
}
