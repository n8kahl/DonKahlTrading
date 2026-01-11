import { NextResponse } from 'next/server'
import { classifyRiskRegime, buildResponseMeta } from '@/lib/massive-api'
import { logger, startTiming, endTiming } from '@/lib/logger'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/risk
 * Returns current market risk regime classification (risk on/off/mixed)
 */
export async function GET(request: Request) {
  const ctx = startTiming('/api/risk')

  // Rate limiting (heavy computation)
  const rateLimit = withRateLimit(request, RATE_LIMITS.heavy)
  if (rateLimit.response) {
    logger.warn('Rate limit exceeded', { requestId: ctx.requestId, endpoint: ctx.endpoint })
    return rateLimit.response
  }

  try {
    logger.apiRequest(ctx.endpoint, 'GET', { requestId: ctx.requestId })

    const result = await classifyRiskRegime()
    const durationMs = endTiming(ctx)

    if (!result.success || !result.metrics) {
      logger.apiError(ctx.endpoint, result.error?.code || 'UNKNOWN', result.error?.message || 'Failed', {
        requestId: ctx.requestId,
        durationMs,
      })

      return NextResponse.json(
        { error: result.error?.message || 'Failed to classify risk regime' },
        {
          status: 500,
          headers: {
            'X-Request-Id': ctx.requestId,
            'X-Response-Time': `${durationMs}ms`,
          },
        }
      )
    }

    logger.apiResponse(ctx.endpoint, 200, durationMs, {
      requestId: ctx.requestId,
      regime: result.metrics.regime,
      confidence: result.metrics.confidence,
    })

    return NextResponse.json(
      {
        regime: result.metrics.regime,
        confidence: result.metrics.confidence,
        signals: result.metrics.signals,
        details: result.metrics.details,
        meta: buildResponseMeta(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
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
