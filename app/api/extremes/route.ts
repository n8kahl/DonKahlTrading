import { type NextRequest, NextResponse } from "next/server"
import {
  fetchDailyBars,
  computeEnhancedMetrics,
  buildResponseMeta,
  fetchMarketStatus,
  type HeatmapMetrics,
  type DailyBar,
} from "@/lib/massive-api"

// =============================================================================
// Enhanced Extremes API - Returns BOTH High and Close Bases
// =============================================================================
// Now returns both bases for dual-view comparison in the main heatmap table.
// Includes sanity checks for data quality and delta calculations.
// =============================================================================

export interface ExtremesResponse {
  dates: string[]
  symbols: string[]
  // Data for both bases
  basisHigh: Record<string, HeatmapMetrics[]>
  basisClose: Record<string, HeatmapMetrics[]>
  // For backward compat: the currently selected basis (defaults to close)
  data: Record<string, HeatmapMetrics[]>
  rawBars: Record<string, DailyBar[]>
  // Sanity check flags
  sanity: {
    staleSymbols: string[] // Symbols with potentially stale data
    constantDays: string[] // Symbols where daysSinceHigh is constant across all days (suspicious)
  }
  meta: ReturnType<typeof buildResponseMeta>
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbolsParam = searchParams.get("symbols") || "DJI,SPX,IXIC,NDX,RUT,SOX"
  const lookback = Number.parseInt(searchParams.get("lookback") || "63")
  const basis = (searchParams.get("basis") || "close") as "close" | "intraday"
  const days = Number.parseInt(searchParams.get("days") || "30")

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0)

  if (symbols.length === 0) {
    return NextResponse.json(
      { error: "No valid symbols provided" },
      { status: 400 }
    )
  }

  if (!process.env.MASSIVE_API_KEY) {
    return NextResponse.json({ error: "MASSIVE_API_KEY not configured" }, { status: 500 })
  }

  try {
    // Refresh market status cache (non-blocking, failure is OK)
    fetchMarketStatus().catch(() => {})

    // Fetch with extra buffer for lookback computation
    const fetchDays = Math.max(days + lookback + 30, 252)
    const barsPromises = symbols.map((symbol) =>
      fetchDailyBars(symbol, fetchDays).catch(() => [] as DailyBar[])
    )

    const barsResults = await Promise.all(barsPromises)

    const dates: string[] = []
    const basisHigh: Record<string, HeatmapMetrics[]> = {}
    const basisClose: Record<string, HeatmapMetrics[]> = {}
    const data: Record<string, HeatmapMetrics[]> = {}
    const rawBars: Record<string, DailyBar[]> = {}

    // Sanity check tracking
    const staleSymbols: string[] = []
    const constantDays: string[] = []

    barsResults.forEach((bars, index) => {
      const symbol = symbols[index]

      if (bars.length === 0) {
        basisHigh[symbol] = []
        basisClose[symbol] = []
        data[symbol] = []
        rawBars[symbol] = []
        return
      }

      // Compute metrics for BOTH bases on full dataset
      const metricsHigh = computeEnhancedMetrics(bars, lookback, "intraday")
      const metricsClose = computeEnhancedMetrics(bars, lookback, "close")

      // Slice to display window (last N days)
      const displayBars = bars.slice(-days)
      const displayMetricsHigh = metricsHigh.slice(-days)
      const displayMetricsClose = metricsClose.slice(-days)

      // Set dates from first symbol with data
      if (dates.length === 0) {
        dates.push(...displayBars.map((bar) => bar.date))
      }

      basisHigh[symbol] = displayMetricsHigh
      basisClose[symbol] = displayMetricsClose
      data[symbol] = basis === "intraday" ? displayMetricsHigh : displayMetricsClose
      rawBars[symbol] = displayBars

      // Sanity checks
      // 1. Check for stale data (latest bar more than 3 days old)
      if (displayBars.length > 0) {
        const latestDate = new Date(displayBars[displayBars.length - 1].date)
        const now = new Date()
        const daysDiff = Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysDiff > 3) {
          staleSymbols.push(symbol)
        }
      }

      // 2. Check for constant daysSinceHigh values (suspicious)
      if (displayMetricsClose.length > 5) {
        const daysSinceValues = displayMetricsClose.map((m) => m.daysSinceHigh)
        const uniqueValues = new Set(daysSinceValues)
        // If all values are the same and equal to lookback-1, something is wrong
        if (uniqueValues.size === 1 && daysSinceValues[0] === lookback - 1) {
          constantDays.push(symbol)
        }
      }
    })

    const response: ExtremesResponse = {
      dates,
      symbols,
      basisHigh,
      basisClose,
      data,
      rawBars,
      sanity: {
        staleSymbols,
        constantDays,
      },
      meta: buildResponseMeta(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Extremes API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
