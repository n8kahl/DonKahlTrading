export interface DailyBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HeatmapMetrics {
  daysSinceHigh: number
  daysSinceLow: number
  pctFromHigh: number
  pctFromLow: number
  rollingHigh: number
  rollingLow: number
  currentValue: number
}

export interface EnhancedHeatmapData {
  dates: string[]
  data: Record<string, HeatmapMetrics[]>
  rawBars: Record<string, DailyBar[]>
}

export interface HeatmapData {
  dates: string[]
  data: Record<string, number[]>
}

const TICKER_MAPPING: Record<string, string> = {
  IXIC: "I:COMP", // Nasdaq Composite
  DJI: "I:DJI",
  SPX: "I:SPX",
  NDX: "I:NDX",
  RUT: "I:RUT",
  SOX: "I:SOX",
}

export async function fetchDailyBars(symbol: string, days = 252): Promise<DailyBar[]> {
  const apiKey = process.env.MASSIVE_API_KEY

  if (!apiKey) {
    throw new Error("MASSIVE_API_KEY is not configured")
  }

  const normalizedSymbol = TICKER_MAPPING[symbol] || (symbol.startsWith("I:") ? symbol : `I:${symbol}`)

  const toDate = new Date()
  const fromDate = new Date()
  fromDate.setDate(toDate.getDate() - days * 1.5) // Request extra days to account for weekends/holidays

  const fromStr = fromDate.toISOString().split("T")[0]
  const toStr = toDate.toISOString().split("T")[0]

  try {
    const url = `https://api.massive.com/v2/aggs/ticker/${normalizedSymbol}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=50000&apiKey=${apiKey}`

    console.log("[v0] Fetching from URL:", url.replace(apiKey, "REDACTED"))

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    })

    console.log("[v0] Response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Error response:", errorText)
      throw new Error(`Failed to fetch data for ${symbol}: ${response.statusText}`)
    }

    const data = await response.json()
    console.log("[v0] Full API response:", JSON.stringify(data))

    if (!data.results || data.results.length === 0) {
      throw new Error(`No data returned for ${symbol}`)
    }

    const bars: DailyBar[] = data.results.map((bar: any) => ({
      date: new Date(bar.t).toISOString().split("T")[0],
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }))

    return bars.slice(0, days)
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error)
    throw error
  }
}

export function computeEnhancedMetrics(
  bars: DailyBar[],
  lookback: number,
  basis: "close" | "intraday",
): HeatmapMetrics[] {
  if (bars.length < lookback) {
    return bars.map(() => ({
      daysSinceHigh: lookback,
      daysSinceLow: lookback,
      pctFromHigh: 0,
      pctFromLow: 0,
      rollingHigh: 0,
      rollingLow: 0,
      currentValue: 0,
    }))
  }

  const metrics: HeatmapMetrics[] = []

  for (let i = 0; i < bars.length; i++) {
    const startIdx = Math.max(0, i - lookback + 1)
    const window = bars.slice(startIdx, i + 1)

    const rollingHigh = Math.max(...window.map((b) => b.high))
    const rollingLow = Math.min(...window.map((b) => b.low))

    const currentValue = basis === "close" ? bars[i].close : bars[i].high
    const currentLowValue = basis === "close" ? bars[i].close : bars[i].low

    if (i === bars.length - 1) {
      console.log(`[v0] Latest bar for ${bars[i].date}:`, {
        rollingHigh,
        rollingLow,
        currentValue,
        currentLowValue,
        basis,
      })
    }

    // Calculate days since high
    let daysSinceHigh = 0
    if (basis === "close" ? bars[i].close < rollingHigh : bars[i].high < rollingHigh) {
      for (let j = i - 1; j >= startIdx; j--) {
        daysSinceHigh++
        if (basis === "close" ? bars[j].close >= rollingHigh : bars[j].high >= rollingHigh) {
          break
        }
      }
    }

    // Calculate days since low
    let daysSinceLow = 0
    if (basis === "close" ? bars[i].close > rollingLow : bars[i].low > rollingLow) {
      for (let j = i - 1; j >= startIdx; j--) {
        daysSinceLow++
        if (basis === "close" ? bars[j].close <= rollingLow : bars[j].low <= rollingLow) {
          break
        }
      }
    }

    const pctFromHigh = ((rollingHigh - currentValue) / rollingHigh) * 100
    const pctFromLow = ((currentLowValue - rollingLow) / rollingLow) * 100

    if (i === bars.length - 1) {
      console.log(`[v0] Calculated metrics:`, {
        pctFromHigh,
        pctFromLow,
        daysSinceHigh,
        daysSinceLow,
      })
    }

    metrics.push({
      daysSinceHigh: Math.min(daysSinceHigh, lookback),
      daysSinceLow: Math.min(daysSinceLow, lookback),
      pctFromHigh,
      pctFromLow,
      rollingHigh,
      rollingLow,
      currentValue,
    })
  }

  return metrics
}

export function computeHeatmap(bars: DailyBar[], lookback: number, basis: "high" | "close"): number[] {
  if (bars.length < lookback) {
    return new Array(bars.length).fill(lookback)
  }

  const values = bars.map((bar) => (basis === "high" ? bar.high : bar.close))
  const daysSince: number[] = []

  for (let i = 0; i < bars.length; i++) {
    const startIdx = Math.max(0, i - lookback + 1)
    const rollingMax = Math.max(...values.slice(startIdx, i + 1))
    const currentValue = values[i]

    if (currentValue >= rollingMax) {
      daysSince.push(0)
    } else {
      let days = 1
      for (let j = i - 1; j >= startIdx && days < lookback; j--) {
        if (values[j] >= rollingMax) {
          break
        }
        days++
      }
      daysSince.push(Math.min(days, lookback))
    }
  }

  return daysSince
}

// Mock fallback data for when API fails
export function getMockHeatmapData(symbols: string[], days: number): HeatmapData {
  const dates: string[] = []
  const today = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    dates.push(date.toISOString().split("T")[0])
  }

  const data: Record<string, number[]> = {}
  symbols.forEach((symbol) => {
    data[symbol] = Array.from({ length: days }, () => Math.floor(Math.random() * 64))
  })

  return { dates, data }
}
