import { type NextRequest, NextResponse } from "next/server"
import { fetchDailyBars, computeEnhancedMetrics } from "@/lib/massive-api"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbolsParam = searchParams.get("symbols") || "DJI,SPX,IXIC,NDX,RUT,SOX"
  const lookback = Number.parseInt(searchParams.get("lookback") || "63")
  const basis = (searchParams.get("basis") || "close") as "close" | "intraday"
  const days = Number.parseInt(searchParams.get("days") || "30")

  const symbols = symbolsParam.split(",").map((s) => s.trim())

  if (!process.env.MASSIVE_API_KEY) {
    return NextResponse.json({ error: "MASSIVE_API_KEY not configured" }, { status: 500 })
  }

  try {
    const barsPromises = symbols.map((symbol) => fetchDailyBars(symbol, Math.max(days + lookback, 252)))

    const barsResults = await Promise.allSettled(barsPromises)

    const dates: string[] = []
    const data: Record<string, any[]> = {}
    const rawBars: Record<string, any[]> = {}

    barsResults.forEach((result, index) => {
      const symbol = symbols[index]

      if (result.status === "fulfilled" && result.value.length > 0) {
        console.log(`[v0] Processing ${symbol}:`, {
          totalBars: result.value.length,
          firstBar: result.value[0],
          lastBar: result.value[result.value.length - 1],
        })

        const bars = result.value.slice(0, days).reverse()
        console.log(`[v0] After slice and reverse for ${symbol}:`, {
          barsCount: bars.length,
          firstDate: bars[0]?.date,
          lastDate: bars[bars.length - 1]?.date,
        })

        const metrics = computeEnhancedMetrics(bars, lookback, basis).reverse()

        console.log(`[v0] Metrics for ${symbol}:`, {
          metricsCount: metrics.length,
          firstMetric: metrics[0],
          lastMetric: metrics[metrics.length - 1],
        })

        if (dates.length === 0) {
          dates.push(...bars.map((bar) => bar.date))
        }

        data[symbol] = metrics
        rawBars[symbol] = bars
      } else {
        console.warn(`Failed to fetch ${symbol}`)
        data[symbol] = []
        rawBars[symbol] = []
      }
    })

    return NextResponse.json({ dates, data, rawBars })
  } catch (error) {
    console.error("Error in extremes API:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
