import { type NextRequest, NextResponse } from "next/server"
import {
  fetchDailyBars,
  computeEnhancedMetrics,
  buildResponseMeta,
  type HeatmapMetrics,
  type DailyBar,
} from "@/lib/massive-api"

// =============================================================================
// Market Extremes API - Returns BOTH High and Close Bases
// =============================================================================
//
// Trader Semantics:
// - HIGH basis: Uses intraday highs to detect peaks. A "high basis" breakout
//   means price touched a new rolling high intraday, even if it closed lower.
// - CLOSE basis: Uses closing prices only. A "close basis" breakout means
//   price actually closed at the rolling high.
//
// Signal Logic:
// - Confirmed Breakout: Both HIGH=0 AND CLOSE=0 days. Strong bullish signal.
// - Rejected Breakout: HIGH=0 but CLOSE>0 days. Intraday high touched but
//   sellers pushed it down by close. Potential reversal warning.
// - Lagging: Neither at high. Look at delta for momentum divergence.
// =============================================================================

export interface MarketExtremesResponse {
  dates: string[]
  symbols: string[]
  basis: {
    high: Record<string, MetricRow[]>
    close: Record<string, MetricRow[]>
  }
  rawBars: Record<string, DailyBar[]>
  summary: {
    confirmedBreakouts: string[] // Symbols with both bases = 0
    rejectedBreakouts: string[] // Symbols with high=0, close>0
    divergences: DivergenceAlert[]
    marketBreadth: {
      atHighsCount: number
      totalSymbols: number
      avgDaysSinceHigh: number
    }
  }
  meta: ReturnType<typeof buildResponseMeta>
}

export interface MetricRow {
  date: string
  daysSinceHigh: number
  currentValue: number
  rollingHigh: number
  pctFromHigh: number
}

export interface DivergenceAlert {
  type: "large_vs_small" | "tech_vs_broad"
  message: string
  symbols: [string, string]
  delta: number
}

// Market hours check (simplified - doesn't account for holidays)
function isMarketOpen(): boolean {
  const now = new Date()
  const hour = now.getUTCHours()
  const day = now.getUTCDay()

  // Market is closed on weekends
  if (day === 0 || day === 6) return false

  // NYSE hours: 9:30 AM - 4:00 PM ET = 14:30 - 21:00 UTC
  return hour >= 14 && hour < 21
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbolsParam = searchParams.get("symbols") || "DJI,SPX,IXIC,NDX,RUT,SOX"
  const lookback = Number.parseInt(searchParams.get("lookback") || "63")
  const days = Number.parseInt(searchParams.get("days") || "20")

  const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase())

  if (!process.env.MASSIVE_API_KEY) {
    return NextResponse.json({ error: "MASSIVE_API_KEY not configured" }, { status: 500 })
  }

  try {
    // Fetch bars with buffer for lookback window computation
    const fetchDays = Math.max(days + lookback + 30, 252)
    const barsPromises = symbols.map((symbol) =>
      fetchDailyBars(symbol, fetchDays).catch(() => [] as DailyBar[])
    )

    const barsResults = await Promise.all(barsPromises)

    // Build response structures
    const dates: string[] = []
    const basisHigh: Record<string, MetricRow[]> = {}
    const basisClose: Record<string, MetricRow[]> = {}
    const rawBars: Record<string, DailyBar[]> = {}

    // Track latest values for summary calculations
    const latestHighDays: Record<string, number> = {}
    const latestCloseDays: Record<string, number> = {}

    barsResults.forEach((bars, index) => {
      const symbol = symbols[index]

      if (bars.length === 0) {
        basisHigh[symbol] = []
        basisClose[symbol] = []
        rawBars[symbol] = []
        return
      }

      // Compute metrics for both bases on FULL dataset
      // 'intraday' uses high/low prices, 'close' uses close prices
      const metricsHigh = computeEnhancedMetrics(bars, lookback, "intraday")
      const metricsClose = computeEnhancedMetrics(bars, lookback, "close")

      // Slice to display window
      const displayBars = bars.slice(-days)
      const displayMetricsHigh = metricsHigh.slice(-days)
      const displayMetricsClose = metricsClose.slice(-days)

      // Set dates from first symbol with data
      if (dates.length === 0) {
        dates.push(...displayBars.map((bar) => bar.date))
      }

      // Transform to MetricRow format
      basisHigh[symbol] = displayMetricsHigh.map((m, i) => ({
        date: displayBars[i]?.date || "",
        daysSinceHigh: m.daysSinceHigh,
        currentValue: displayBars[i]?.high || 0,
        rollingHigh: m.rollingHigh,
        pctFromHigh: m.pctFromHigh,
      }))

      basisClose[symbol] = displayMetricsClose.map((m, i) => ({
        date: displayBars[i]?.date || "",
        daysSinceHigh: m.daysSinceHigh,
        currentValue: displayBars[i]?.close || 0,
        rollingHigh: m.rollingHigh,
        pctFromHigh: m.pctFromHigh,
      }))

      rawBars[symbol] = displayBars

      // Store latest for summary
      const latestHigh = displayMetricsHigh[displayMetricsHigh.length - 1]
      const latestClose = displayMetricsClose[displayMetricsClose.length - 1]
      if (latestHigh) latestHighDays[symbol] = latestHigh.daysSinceHigh
      if (latestClose) latestCloseDays[symbol] = latestClose.daysSinceHigh
    })

    // Calculate summary statistics
    const confirmedBreakouts: string[] = []
    const rejectedBreakouts: string[] = []

    symbols.forEach((symbol) => {
      const highDays = latestHighDays[symbol]
      const closeDays = latestCloseDays[symbol]

      if (highDays === undefined || closeDays === undefined) return

      if (highDays === 0 && closeDays === 0) {
        confirmedBreakouts.push(symbol)
      } else if (highDays === 0 && closeDays > 0) {
        rejectedBreakouts.push(symbol)
      }
    })

    // Detect divergences (trader alerts)
    const divergences: DivergenceAlert[] = []

    // Large caps vs small caps divergence
    const spxDays = latestCloseDays["SPX"]
    const rutDays = latestCloseDays["RUT"]
    if (spxDays !== undefined && rutDays !== undefined) {
      const delta = Math.abs(spxDays - rutDays)
      if (delta >= 10) {
        divergences.push({
          type: "large_vs_small",
          message:
            spxDays < rutDays
              ? `Large caps leading: SPX ${spxDays}d vs RUT ${rutDays}d from highs`
              : `Small caps leading: RUT ${rutDays}d vs SPX ${spxDays}d from highs`,
          symbols: ["SPX", "RUT"],
          delta,
        })
      }
    }

    // Tech vs broad market divergence
    const ndxDays = latestCloseDays["NDX"]
    if (spxDays !== undefined && ndxDays !== undefined) {
      const delta = Math.abs(spxDays - ndxDays)
      if (delta >= 10) {
        divergences.push({
          type: "tech_vs_broad",
          message:
            ndxDays < spxDays
              ? `Tech leading: NDX ${ndxDays}d vs SPX ${spxDays}d from highs`
              : `Broad market leading: SPX ${spxDays}d vs NDX ${ndxDays}d from highs`,
          symbols: ["NDX", "SPX"],
          delta,
        })
      }
    }

    // Market breadth
    const validDays = Object.values(latestCloseDays).filter((d) => d !== undefined)
    const atHighsCount = validDays.filter((d) => d === 0).length
    const avgDaysSinceHigh =
      validDays.length > 0 ? validDays.reduce((a, b) => a + b, 0) / validDays.length : 0

    const response: MarketExtremesResponse = {
      dates,
      symbols,
      basis: {
        high: basisHigh,
        close: basisClose,
      },
      rawBars,
      summary: {
        confirmedBreakouts,
        rejectedBreakouts,
        divergences,
        marketBreadth: {
          atHighsCount,
          totalSymbols: symbols.length,
          avgDaysSinceHigh: Math.round(avgDaysSinceHigh * 10) / 10,
        },
      },
      meta: buildResponseMeta(),
    }

    // Set cache headers based on market hours
    const cacheSeconds = isMarketOpen() ? 30 : 900 // 30s open, 15min closed

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
      },
    })
  } catch (error) {
    console.error("Market extremes error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
