import { NextResponse } from 'next/server'
import { fetchRelativeStrength, buildResponseMeta, SECTOR_ETFS } from '@/lib/massive-api'
import { logger, startTiming, endTiming } from '@/lib/logger'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/strength/[symbol]
 * Returns relative strength metrics for a single stock:
 * - RS vs SPY
 * - RS vs sector ETF
 * - Correlation with SPY
 * - Beta
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params
  const ctx = startTiming(`/api/strength/${symbol}`)

  // Rate limiting
  const rateLimit = withRateLimit(request, RATE_LIMITS.standard)
  if (rateLimit.response) {
    logger.warn('Rate limit exceeded', { requestId: ctx.requestId, endpoint: ctx.endpoint })
    return rateLimit.response
  }

  // Parse query params
  const url = new URL(request.url)
  const lookback = parseInt(url.searchParams.get('lookback') || '63', 10)

  try {
    logger.apiRequest(ctx.endpoint, 'GET', { requestId: ctx.requestId, symbol })

    const result = await fetchRelativeStrength(symbol, lookback)
    const durationMs = endTiming(ctx)

    if (!result.success || !result.metrics) {
      logger.apiError(ctx.endpoint, result.error?.code || 'UNKNOWN', result.error?.message || 'Failed', {
        requestId: ctx.requestId,
        durationMs,
        symbol,
      })

      return NextResponse.json(
        { error: result.error?.message || 'Failed to calculate relative strength' },
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
      symbol,
      rsRating: result.metrics.rsRating,
    })

    return NextResponse.json(
      {
        symbol: result.metrics.symbol,
        relativeStrength: {
          vsSpy: result.metrics.vsSpyRS,
          vsSector: result.metrics.vsSectorRS,
          sectorETF: result.metrics.sectorETF,
          sectorName: result.metrics.sectorETF
            ? SECTOR_ETFS[result.metrics.sectorETF]
            : null,
        },
        correlation: result.metrics.spyCorrelation,
        beta: result.metrics.beta,
        rating: result.metrics.rsRating,
        lookback,
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
      symbol,
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
