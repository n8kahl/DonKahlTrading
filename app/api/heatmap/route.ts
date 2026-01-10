import { type NextRequest, NextResponse } from "next/server"
import { fetchDailyBars, computeHeatmap, getMockHeatmapData } from "@/lib/massive-api"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbolsParam = searchParams.get("symbols") || "DJI,SPX,IXIC,NDX,RUT,SOX"
  const lookback = Number.parseInt(searchParams.get("lookback") || "63")
  const basis = (searchParams.get("basis") || "high") as "high" | "close"
  const days = Number.parseInt(searchParams.get("days") || "63")

  const symbols = symbolsParam.split(",").map((s) => s.trim())

  // Check if API key is configured
  if (!process.env.MASSIVE_API_KEY) {
    console.warn("MASSIVE_API_KEY not configured, returning mock data")
    const mockData = getMockHeatmapData(symbols, days)
    return NextResponse.json({
      ...mockData,
      isMock: true,
      error: "MASSIVE_API_KEY not configured",
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
        const bars = result.value.slice(0, days).reverse() // Most recent first
        const heatmapValues = computeHeatmap(bars, lookback, basis).reverse()

        if (dates.length === 0) {
          dates.push(...bars.map((bar) => bar.date))
        }

        data[symbol] = heatmapValues
      } else {
        // Symbol failed, use mock data
        console.warn(`Failed to fetch ${symbol}, using mock data`)
        data[symbol] = Array.from({ length: days }, () => Math.floor(Math.random() * 64))
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

    return NextResponse.json({ dates, data, isMock: false })
  } catch (error) {
    console.error("Error in heatmap API:", error)

    // Return mock data on error
    const mockData = getMockHeatmapData(symbols, days)
    return NextResponse.json({
      ...mockData,
      isMock: true,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
