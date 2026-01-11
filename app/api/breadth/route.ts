import { type NextRequest, NextResponse } from 'next/server'
import { resolveUniverse, type Universe } from '@/lib/universes'
import { fetchBulkDailyBars, alignBarsByDate } from '@/lib/breadth/fetch-bulk'
import { computeBreadthSeries, type BreadthEntry } from '@/lib/breadth/compute'
import { findPeakDay, findWindowAroundPeak, findTopPeaks, type PeakResult, type WindowResult } from '@/lib/breadth/extremes'
import { buildResponseMeta, fetchMarketStatus } from '@/lib/massive-api'
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

// =============================================================================
// Breadth Analysis API
// =============================================================================
// Computes breadth metrics (% new lows / highs) for an ETF-proxy universe
// and finds peak days/windows for extreme readings.
// =============================================================================

export interface BreadthResponse {
  success: true
  data: {
    asOf: string
    universe: {
      id: string
      label: string
      disclosureText: string
      etfProxy: string
    }
    params: {
      lookbackDays: number
      searchDays: number
      windowDays: number
      metric: 'new_lows' | 'new_highs'
    }
    constituentsUsed: number
    failedTickers: string[]
    series: BreadthEntry[]
    peak: PeakResult | null
    window: WindowResult | null
    topPeaks: PeakResult[]
    meta: {
      dataDelayed: boolean
      marketStatus: string
      fetchTimeMs: number
    }
  }
}

export interface BreadthError {
  success: false
  error: {
    code: string
    message: string
  }
}

export async function GET(request: NextRequest) {
  // Rate limiting - this is an expensive operation
  const rateLimit = withRateLimit(request, RATE_LIMITS.heavy)
  if (rateLimit.response) {
    return rateLimit.response
  }

  const searchParams = request.nextUrl.searchParams

  // Parse parameters
  const universeId = searchParams.get('universe') || 'soxx'
  const lookbackDays = parseInt(searchParams.get('lookback') || '100', 10)
  const searchDays = parseInt(searchParams.get('searchDays') || '500', 10)
  const windowDays = parseInt(searchParams.get('windowDays') || '100', 10)
  const metric = (searchParams.get('metric') || 'new_lows') as 'new_lows' | 'new_highs'

  // Validate parameters
  if (lookbackDays < 10 || lookbackDays > 252) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'lookback must be between 10 and 252 trading days',
        },
      } satisfies BreadthError,
      { status: 400 }
    )
  }

  if (searchDays < 100 || searchDays > 1000) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'searchDays must be between 100 and 1000',
        },
      } satisfies BreadthError,
      { status: 400 }
    )
  }

  // Resolve universe
  const universe = resolveUniverse(universeId)
  if (!universe) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_UNIVERSE',
          message: `Unknown universe: ${universeId}. Valid options: soxx, smh, qqq, spy, iwm, dia`,
        },
      } satisfies BreadthError,
      { status: 400 }
    )
  }

  // Check API key
  if (!process.env.MASSIVE_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'MASSIVE_API_KEY_MISSING',
          message: 'Market data service not configured',
        },
      } satisfies BreadthError,
      { status: 503 }
    )
  }

  try {
    // Refresh market status (non-blocking)
    fetchMarketStatus().catch(() => {})

    // Fetch data for all symbols in the universe
    // Need extra days for lookback window calculation
    const fetchDays = searchDays + lookbackDays + 30

    const fetchResult = await fetchBulkDailyBars(
      universe.symbols,
      fetchDays
    )

    // Check if we got enough data
    if (fetchResult.succeeded.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_DATA',
            message: 'Failed to fetch data for any symbols in the universe',
          },
        } satisfies BreadthError,
        { status: 502 }
      )
    }

    // Align bars by date
    const { dates, alignedBars, validSymbols } = alignBarsByDate(fetchResult.barsBySymbol)

    // Slice to search window
    const slicedDates = dates.slice(-searchDays - lookbackDays)
    const slicedAlignedBars: Record<string, (typeof alignedBars)[string]> = {}
    for (const symbol of validSymbols) {
      slicedAlignedBars[symbol] = alignedBars[symbol].slice(-searchDays - lookbackDays)
    }

    // Compute breadth series
    const breadthSeries = computeBreadthSeries(slicedAlignedBars, slicedDates, lookbackDays)

    // Find peak and window
    const peak = findPeakDay(breadthSeries, metric)
    const window = peak ? findWindowAroundPeak(breadthSeries, metric, windowDays) : null
    const topPeaks = findTopPeaks(breadthSeries, metric, 5)

    const meta = buildResponseMeta()

    const response: BreadthResponse = {
      success: true,
      data: {
        asOf: new Date().toISOString(),
        universe: {
          id: universe.id,
          label: universe.label,
          disclosureText: universe.disclosureText,
          etfProxy: universe.etfProxy,
        },
        params: {
          lookbackDays,
          searchDays,
          windowDays,
          metric,
        },
        constituentsUsed: validSymbols.length,
        failedTickers: fetchResult.failed,
        series: breadthSeries.entries,
        peak,
        window,
        topPeaks,
        meta: {
          dataDelayed: meta.isDelayed,
          marketStatus: meta.marketStatus,
          fetchTimeMs: fetchResult.fetchTimeMs,
        },
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Breadth API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to compute breadth',
        },
      } satisfies BreadthError,
      { status: 500 }
    )
  }
}
