import { type NextRequest, NextResponse } from "next/server"
import { fetchDailyBars, computeHeatmap, buildResponseMeta } from "@/lib/massive-api"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbolsParam = searchParams.get("symbols") || "DJI,SPX,IXIC,NDX,RUT,SOX"
  const lookback = Number.parseInt(searchParams.get("lookback") || "63")
  const basis = (searchParams.get("basis") || "close") as "close" | "intraday"
  const days = Number.parseInt(searchParams.get("days") || "63")

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
    return NextResponse.json(
      { error: "Market data service not configured. Please contact support." },
      { status: 503 }
    )
  }

  try {
    // Fetch data for all symbols in parallel
    const barsPromises = symbols.map((symbol) => fetchDailyBars(symbol, Math.max(days + lookback, 252)))

    const barsResults = await Promise.allSettled(barsPromises)

    const dates: string[] = []
    const data: Record<string, number[]> = {}
    const failedSymbols: string[] = []

    barsResults.forEach((result, index) => {
      const symbol = symbols[index]

      if (result.status === "fulfilled" && result.value.length > 0) {
        // Bars arrive in ascending chronological order (oldest to newest)
        const allBars = result.value

        // Compute heatmap on full dataset (has lookback + days + buffer)
        const allHeatmapValues = computeHeatmap(allBars, lookback, basis)

        // Slice last `days` for response
        const displayBars = allBars.slice(-days)
        const displayValues = allHeatmapValues.slice(-days)

        if (dates.length === 0) {
          dates.push(...displayBars.map((bar) => bar.date))
        }

        data[symbol] = displayValues
      } else {
        // Symbol failed, track it
        failedSymbols.push(symbol)
        data[symbol] = []
      }
    })

    // If no data was fetched at all, return an error
    if (dates.length === 0) {
      return NextResponse.json(
        {
          error: "Unable to fetch market data. Please try again later.",
          failedSymbols,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      dates,
      data,
      meta: buildResponseMeta(),
      ...(failedSymbols.length > 0 && { warnings: { failedSymbols } })
    })
  } catch (error) {
    console.error("[Heatmap API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch market data" },
      { status: 500 }
    )
  }
}
