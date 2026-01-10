import { streamText, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import {
  fetchDailyBars,
  fetchIntradayBars,
  fetchOptionsChain,
  computeEnhancedMetrics,
  calculateOptionsMetrics,
} from '@/lib/massive-api'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// Model Selection Strategy
// -----------------------------------------------------------------------------

function getModel() {
  // Prefer Anthropic for complex financial data analysis
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic('claude-sonnet-4-20250514')
  }
  // Fallback to OpenAI
  return openai('gpt-4-turbo')
}

// -----------------------------------------------------------------------------
// System Persona - Elite Trading Copilot
// -----------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an elite Trading Copilot. You are concise, data-driven, and skeptical.

## Core Principles:
1. **Macro First:** When asked about a stock, briefly check its Sector (e.g. XLK for Tech) or Index (NDX) context before diving into specifics.
2. **Terminology Mapping:**
   - 'Semis' or 'Semiconductors' = SOX index
   - 'Tech' = NDX (Nasdaq 100)
   - 'Small Caps' = RUT (Russell 2000)
   - 'Large Caps' = SPX (S&P 500)
   - 'Fear Index' or 'Vol' = VIX
3. **Proactive Analysis:** When analyzing a significant move, check Volatility (IV) via options tools to understand if the move is priced in.
4. **Data Presentation:** Always use the available tools to show visual data. Don't just describe - SHOW the data.

## Response Style:
- Be concise. Traders don't have time for fluff.
- Lead with the conclusion, then support with data.
- Flag anomalies and divergences immediately.
- Use precise numbers with appropriate decimal places.

## Tool Usage:
- Use show_market_dashboard for multi-symbol comparisons and heatmaps
- Use analyze_options_chain for sentiment analysis via put/call ratios and gamma exposure
- Use show_price_chart for trend visualization and support/resistance analysis`

// -----------------------------------------------------------------------------
// API Route Handler
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      // Tool 1: Market Dashboard
      show_market_dashboard: tool({
        description:
          'Display a market dashboard showing rolling high/low analysis for multiple symbols. Use this for comparing indices or a watchlist.',
        parameters: z.object({
          symbols: z
            .array(z.string())
            .default(['SPX', 'NDX', 'RUT', 'VIX'])
            .describe('Array of ticker symbols to analyze'),
          lookback: z
            .number()
            .default(63)
            .describe('Lookback period in trading days (21=1mo, 63=quarter, 252=year)'),
        }),
        execute: async ({ symbols, lookback }) => {
          const results: Array<{
            symbol: string
            daysSinceHigh: number | null
            pctFromHigh: number | null
            daysSinceLow: number | null
            pctFromLow: number | null
            close: number | null
            rollingHigh: number | null
            rollingLow: number | null
          }> = []

          for (const symbol of symbols) {
            try {
              const bars = await fetchDailyBars(symbol, lookback + 30)
              const metrics = computeEnhancedMetrics(bars, lookback, 'close')
              const latest = metrics[metrics.length - 1]
              const latestBar = bars[bars.length - 1]

              results.push({
                symbol,
                daysSinceHigh: latest?.daysSinceHigh ?? null,
                pctFromHigh: latest?.pctFromHigh ?? null,
                daysSinceLow: latest?.daysSinceLow ?? null,
                pctFromLow: latest?.pctFromLow ?? null,
                close: latestBar?.close ?? null,
                rollingHigh: latest?.rollingHigh ?? null,
                rollingLow: latest?.rollingLow ?? null,
              })
            } catch {
              results.push({
                symbol,
                daysSinceHigh: null,
                pctFromHigh: null,
                daysSinceLow: null,
                pctFromLow: null,
                close: null,
                rollingHigh: null,
                rollingLow: null,
              })
            }
          }

          return {
            type: 'market_dashboard' as const,
            lookback,
            symbols: results,
          }
        },
      }),

      // Tool 2: Options Chain Analysis
      analyze_options_chain: tool({
        description:
          'Analyze options flow for a symbol. Shows put/call ratio, highest activity strike, and implied volatility. Use this to gauge market sentiment.',
        parameters: z.object({
          symbol: z.string().describe('The ticker symbol to analyze options for (e.g., SPY, AAPL)'),
        }),
        execute: async ({ symbol }) => {
          const response = await fetchOptionsChain(symbol, {
            limit: 500,
          })

          if (!response.success || response.results.length === 0) {
            return {
              type: 'options_chain' as const,
              symbol,
              error: `No options data available for ${symbol}. This may be an index (try SPY instead of SPX) or the market may be closed.`,
              data: null,
            }
          }

          const metrics = calculateOptionsMetrics(response.results)

          // Find highest activity strike (by volume + OI)
          const strikeActivity: Record<number, number> = {}
          response.results.forEach((opt) => {
            const strike = opt.contract.strike_price
            strikeActivity[strike] = (strikeActivity[strike] || 0) + opt.day.volume + opt.open_interest
          })

          let topStrike = 0
          let topActivity = 0
          Object.entries(strikeActivity).forEach(([strike, activity]) => {
            if (activity > topActivity) {
              topActivity = activity
              topStrike = parseFloat(strike)
            }
          })

          const pcr = metrics.putCallRatio
          const sentiment = pcr > 1.2 ? 'Bearish' : pcr < 0.8 ? 'Bullish' : 'Neutral'

          return {
            type: 'options_chain' as const,
            symbol,
            error: null,
            data: {
              putCallRatio: pcr,
              sentiment,
              topStrike: topStrike || metrics.maxPainStrike,
              totalVolume: metrics.totalVolume,
              totalOpenInterest: metrics.totalOpenInterest,
              avgIV: metrics.avgIV,
              maxPainStrike: metrics.maxPainStrike,
              underlyingPrice: response.underlying_price,
              strikeDistance: topStrike
                ? ((Math.abs(topStrike - response.underlying_price) / response.underlying_price) * 100)
                : 0,
            },
          }
        },
      }),

      // Tool 3: Price Chart
      show_price_chart: tool({
        description:
          'Display a price chart for a symbol. Use daily for trend analysis, intraday for recent action.',
        parameters: z.object({
          symbol: z.string().describe('The ticker symbol to chart'),
          timeframe: z
            .enum(['daily', 'intraday'])
            .default('daily')
            .describe('Chart timeframe: daily for trend, intraday for today'),
        }),
        execute: async ({ symbol, timeframe }) => {
          let chartData: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }> = []

          try {
            if (timeframe === 'intraday') {
              const response = await fetchIntradayBars(symbol, '5m')
              if (response.success && response.results.length > 0) {
                chartData = response.results.map((bar) => ({
                  time: bar.timestamp,
                  open: bar.open,
                  high: bar.high,
                  low: bar.low,
                  close: bar.close,
                  volume: bar.volume,
                }))
              }
            } else {
              const bars = await fetchDailyBars(symbol, 63)
              chartData = bars.map((bar) => ({
                time: bar.date,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume,
              }))
            }
          } catch {
            // Return empty data on error
          }

          if (chartData.length === 0) {
            return {
              type: 'price_chart' as const,
              symbol,
              timeframe,
              error: `No ${timeframe} data available for ${symbol}`,
              data: null,
            }
          }

          const latest = chartData[chartData.length - 1]
          const first = chartData[0]
          const change = latest.close - first.close
          const changePercent = (change / first.close) * 100
          const periodHigh = Math.max(...chartData.map((d) => d.high))
          const periodLow = Math.min(...chartData.map((d) => d.low))

          return {
            type: 'price_chart' as const,
            symbol,
            timeframe,
            error: null,
            data: {
              bars: chartData,
              summary: {
                latestClose: latest.close,
                change,
                changePercent,
                periodHigh,
                periodLow,
                periodRange: periodHigh - periodLow,
                dataPoints: chartData.length,
                positionInRange: ((latest.close - periodLow) / (periodHigh - periodLow)) * 100,
              },
            },
          }
        },
      }),
    },
    maxSteps: 5,
  })

  return result.toDataStreamResponse()
}
