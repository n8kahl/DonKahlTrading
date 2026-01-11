import { type NextRequest, NextResponse } from "next/server"
import { fetchDailyBars, computeEnhancedMetrics, buildResponseMeta } from "@/lib/massive-api"

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
        // Bars arrive in ascending chronological order (oldest to newest)
        const allBars = result.value

        // Compute metrics on full dataset (has lookback + days + buffer)
        const allMetrics = computeEnhancedMetrics(allBars, lookback, basis)

        // Slice last `days` bars and metrics for response
        const displayBars = allBars.slice(-days)
        const displayMetrics = allMetrics.slice(-days)

        if (dates.length === 0) {
          dates.push(...displayBars.map((bar) => bar.date))
        }

        data[symbol] = displayMetrics
        rawBars[symbol] = displayBars
      } else {
        data[symbol] = []
        rawBars[symbol] = []
      }
    })

    return NextResponse.json({ dates, data, rawBars, meta: buildResponseMeta() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
