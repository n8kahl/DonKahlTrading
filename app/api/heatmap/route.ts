import { type NextRequest, NextResponse } from "next/server"
import { fetchDailyBars, computeHeatmap, getMockHeatmapData, buildResponseMeta } from "@/lib/massive-api"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbolsParam = searchParams.get("symbols") || "DJI,SPX,IXIC,NDX,RUT,SOX"
  const lookback = Number.parseInt(searchParams.get("lookback") || "63")
  const basis = (searchParams.get("basis") || "close") as "close" | "intraday"
  const days = Number.parseInt(searchParams.get("days") || "63")

  const symbols = symbolsParam.split(",").map((s) => s.trim())

  if (!process.env.MASSIVE_API_KEY) {
    const mockData = getMockHeatmapData(symbols, days)
    return NextResponse.json({
      ...mockData,
      isMock: true,
      error: "MASSIVE_API_KEY not configured",
      meta: buildResponseMeta(),
    })
  }

  try {
    // Fetch data for all symbols in parallel
    const barsPromises = symbols.map((symbol) => fetchDailyBars(symbol, Math.max(days + lookback, 252)))

    const barsResults = await Promise.allSettled(barsPromises)

    const dates: string[] = []
    const data: Record<string, number[]> = {}

    barsResults.forEach((result, index) => {
      const symbol = symbols[index]

      if (result.status === "fulfilled" && result.value.length > 0) {
        // Bars arrive in descending order (most recent first)
        // Reverse to chronological for proper rolling window computation
        const allBarsChronological = [...result.value].reverse()

        // Compute heatmap on full dataset (has lookback + days + buffer)
        const allHeatmapValues = computeHeatmap(allBarsChronological, lookback, basis)

        // Slice last `days` for response
        const displayBars = allBarsChronological.slice(-days)
        const displayValues = allHeatmapValues.slice(-days)

        if (dates.length === 0) {
          dates.push(...displayBars.map((bar) => bar.date))
        }

        data[symbol] = displayValues
      } else {
        // Symbol failed, use empty array
        data[symbol] = []
      }
    })

    // If no dates were populated, use mock dates
    if (dates.length === 0) {
      const today = new Date()
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        dates.push(date.toISOString().split("T")[0])
      }
    }

    return NextResponse.json({ dates, data, isMock: false, meta: buildResponseMeta() })
  } catch (error) {
    // Return mock data on error
    const mockData = getMockHeatmapData(symbols, days)
    return NextResponse.json({
      ...mockData,
      isMock: true,
      error: error instanceof Error ? error.message : "Unknown error",
      meta: buildResponseMeta(),
    })
  }
}
