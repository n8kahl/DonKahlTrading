import { streamText, tool, zodSchema, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import {
  executePlan,
  type QueryPlan,
  createMarketPulsePlan,
  createExtremesHeatmapPlan,
  createOptionsChainPlan,
} from '@/lib/ai/query-plan'
import type { ResultEnvelope } from '@/lib/ai/query-plan'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// Model Selection Strategy
// -----------------------------------------------------------------------------

function getModel() {
  // Prefer Anthropic for complex financial data analysis
  if (process.env.ANTHROPIC_API_KEY) {
    // Use Claude Sonnet 4 - latest stable model
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
   - 'Dow' = DJI
3. **Proactive Analysis:** When analyzing a significant move, check Volatility (IV) via options tools to understand if the move is priced in.
4. **Data Presentation:** Always use the available tools to show visual data. Don't just describe - SHOW the data.

## Response Style:
- Be concise. Traders don't have time for fluff.
- Lead with the conclusion, then support with data.
- Flag anomalies and divergences immediately.
- Use precise numbers with appropriate decimal places.

## Tool Usage:
- Use universal_query for any market data request - it handles routing automatically
- For market pulse/status: use the "snapshot" dataset with relevant symbols
- For extremes/heatmaps: use the "heatmap" or "extremes" dataset
- For options analysis: use the "options_chain" dataset
- For price charts: use the "aggregates" dataset

## Trader Semantics:
- "Days since high" measures recency of strength - 0 = at new highs (bullish)
- "% from high" measures drawdown - lower is better
- "Confirmed breakout" = HIGH basis AND CLOSE basis both at 0 days (strong signal)
- "Rejected breakout" = HIGH at 0 but CLOSE not at 0 (potential reversal warning)
- Risk regime: determined by market breadth and VIX levels`

// -----------------------------------------------------------------------------
// Tool Schemas
// -----------------------------------------------------------------------------

// Universal query tool - routes all data requests through QueryPlan
const universalQuerySchema = z.object({
  symbols: z
    .array(z.string())
    .min(1)
    .max(12)
    .describe('Array of ticker symbols (e.g., ["SPY", "QQQ", "AAPL"])'),
  datasets: z
    .array(z.enum(['aggregates', 'snapshot', 'options_chain', 'heatmap', 'extremes', 'movers', 'market_status']))
    .describe('Data types to fetch: aggregates (price bars), snapshot (current quotes), heatmap (rolling high/low)'),
  lookback: z
    .number()
    .int()
    .min(5)
    .max(504)
    .default(63)
    .describe('Lookback period in trading days (21=1mo, 63=quarter, 252=year)'),
  visualization: z
    .enum(['chart', 'heatmap', 'table', 'dashboard', 'pulse', 'options_chain'])
    .default('dashboard')
    .describe('How to display the data'),
  basis: z
    .enum(['close', 'intraday'])
    .default('close')
    .describe('Price basis: close (EOD prices) or intraday (includes highs/lows)'),
  optionsExpiration: z
    .string()
    .optional()
    .describe('Options expiration date (YYYY-MM-DD) or "this_friday"'),
})

// Quick action shortcuts
const quickMarketPulseSchema = z.object({
  symbols: z
    .array(z.string())
    .default(['SPY', 'QQQ', 'IWM', 'DIA'])
    .describe('Symbols for market pulse'),
})

const quickExtremesSchema = z.object({
  symbols: z
    .array(z.string())
    .default(['SPX', 'NDX', 'RUT', 'DJI', 'SOX', 'VIX'])
    .describe('Symbols for extremes heatmap'),
  lookback: z.number().default(63).describe('Lookback period'),
})

const quickOptionsSchema = z.object({
  symbol: z.string().describe('Symbol to analyze options for'),
  expiration: z.string().optional().describe('Expiration date or "this_friday"'),
})

// -----------------------------------------------------------------------------
// Result Type Mapping for Client Renderer
// -----------------------------------------------------------------------------

function mapEnvelopeToClientType(envelope: ResultEnvelope): Record<string, unknown> {
  switch (envelope.type) {
    case 'pulse':
      return {
        type: 'pulse',
        symbols: envelope.symbols,
        marketStatus: envelope.marketStatus,
        lastUpdated: envelope.meta.lastUpdated,
      }

    case 'heatmap':
      return {
        type: 'heatmap',
        lookback: envelope.meta.lookback,
        dates: envelope.dates,
        data: envelope.symbols.reduce((acc, symbol, idx) => {
          acc[symbol] = envelope.matrix.map((row) => row[idx])
          return acc
        }, {} as Record<string, number[]>),
      }

    case 'options_chain':
      return {
        type: 'options_chain',
        symbol: envelope.underlying,
        error: null,
        data: {
          putCallRatio: envelope.meta.putCallRatio,
          sentiment: envelope.meta.putCallRatio > 1.2 ? 'Bearish' : envelope.meta.putCallRatio < 0.8 ? 'Bullish' : 'Neutral',
          topStrike: envelope.meta.maxPainStrike || 0,
          totalVolume: envelope.meta.totalVolume,
          totalOpenInterest: envelope.contracts.reduce((sum, c) => sum + c.openInterest, 0),
          avgIV: envelope.meta.avgIV,
          maxPainStrike: envelope.meta.maxPainStrike || 0,
          underlyingPrice: envelope.underlyingPrice,
          strikeDistance: envelope.meta.maxPainStrike
            ? ((Math.abs(envelope.meta.maxPainStrike - envelope.underlyingPrice) / envelope.underlyingPrice) * 100)
            : 0,
        },
      }

    case 'timeseries':
      // Map to market dashboard format for compatibility
      return {
        type: 'market_dashboard',
        lookback: envelope.meta.lookback,
        symbols: envelope.symbols.map((symbol) => ({
          symbol,
          daysSinceHigh: null,
          pctFromHigh: null,
          daysSinceLow: null,
          pctFromLow: null,
          close: envelope.data[envelope.data.length - 1]?.[symbol] as number | null,
          rollingHigh: null,
          rollingLow: null,
        })),
      }

    case 'snapshot':
      return {
        type: 'pulse',
        symbols: envelope.rows.map((row) => ({
          symbol: row.label,
          price: typeof row.value === 'number' ? row.value : parseFloat(String(row.value).replace(/[^0-9.-]/g, '')) || 0,
          change: 0,
          changePercent: row.changePct || 0,
          volume: 0,
          signal: row.signal || 'neutral',
        })),
        marketStatus: 'open',
        lastUpdated: envelope.meta.lastUpdated,
      }

    case 'error':
      return {
        type: 'error',
        title: envelope.title,
        message: envelope.message,
        recoverable: envelope.meta.recoverable,
      }

    default:
      return envelope as Record<string, unknown>
  }
}

// -----------------------------------------------------------------------------
// API Route Handler
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  // Check for required API keys
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AI service not configured. Missing ANTHROPIC_API_KEY or OPENAI_API_KEY.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Check for Massive/Polygon API key
  if (!process.env.MASSIVE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Market data service not configured. Missing MASSIVE_API_KEY.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { messages } = await req.json()
    console.log('[Chat API] Processing request with', messages.length, 'messages')
    console.log('[Chat API] Using Anthropic:', !!process.env.ANTHROPIC_API_KEY)

    const result = streamText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        // Universal Query Tool - Routes through QueryPlan
        universal_query: tool({
          description:
            'Universal market data query. Fetches and displays any combination of market data (prices, options, heatmaps). ' +
            'Use this as the primary tool for all data requests.',
          inputSchema: zodSchema(universalQuerySchema),
          execute: async (params) => {
            const plan: QueryPlan = {
              symbols: params.symbols.map((s: string) => s.toUpperCase()),
              assetClass: params.datasets.includes('options_chain') ? 'options' : 'stocks',
              timeframe: { mode: 'lookback', days: params.lookback },
              granularity: '1d',
              datasets: params.datasets,
              transforms: ['none'],
              benchmark: 'SPY',
              visualization: params.visualization,
              lookback: params.lookback,
              basis: params.basis,
              optionsExpiration: params.optionsExpiration,
            }

            try {
              const results = await executePlan(plan)

              // Return first result mapped to client format
              if (results.length > 0) {
                return mapEnvelopeToClientType(results[0])
              }

              return {
                type: 'error',
                title: 'No Data',
                message: 'Query returned no results',
                recoverable: true,
              }
            } catch (error) {
              return {
                type: 'error',
                title: 'Query Failed',
                message: error instanceof Error ? error.message : 'Unknown error',
                recoverable: true,
              }
            }
          },
        }),

        // Quick Action: Market Pulse
        show_market_pulse: tool({
          description:
            'Quick view of current market status with real-time prices and signals. ' +
            'Shows key indices or specified symbols with change %, volume, and sentiment.',
          inputSchema: zodSchema(quickMarketPulseSchema),
          execute: async ({ symbols }) => {
            const plan = createMarketPulsePlan()
            plan.symbols = symbols.map((s: string) => s.toUpperCase())

            try {
              const results = await executePlan(plan)
              if (results.length > 0) {
                return mapEnvelopeToClientType(results[0])
              }
              return { type: 'error', title: 'No Data', message: 'No pulse data available', recoverable: true }
            } catch (error) {
              return { type: 'error', title: 'Error', message: String(error), recoverable: true }
            }
          },
        }),

        // Quick Action: Extremes Heatmap
        show_extremes_heatmap: tool({
          description:
            'Show the "days since rolling high" heatmap for market indices. ' +
            'Green = at/near highs (bullish), Red = far from highs (weak). ' +
            'Use to identify divergences between large caps, small caps, and tech.',
          inputSchema: zodSchema(quickExtremesSchema),
          execute: async ({ symbols, lookback }) => {
            const plan = createExtremesHeatmapPlan(
              symbols.map((s: string) => s.toUpperCase()),
              lookback
            )

            try {
              const results = await executePlan(plan)
              if (results.length > 0) {
                return mapEnvelopeToClientType(results[0])
              }
              return { type: 'error', title: 'No Data', message: 'No heatmap data available', recoverable: true }
            } catch (error) {
              return { type: 'error', title: 'Error', message: String(error), recoverable: true }
            }
          },
        }),

        // Quick Action: Options Analysis
        analyze_options: tool({
          description:
            'Analyze options flow for a symbol. Shows put/call ratio, implied volatility, max pain, ' +
            'and sentiment signals. Use to gauge whether a move is priced in.',
          inputSchema: zodSchema(quickOptionsSchema),
          execute: async ({ symbol, expiration }) => {
            const plan = createOptionsChainPlan(symbol.toUpperCase(), expiration)

            try {
              const results = await executePlan(plan)
              if (results.length > 0) {
                return mapEnvelopeToClientType(results[0])
              }
              return {
                type: 'options_chain',
                symbol,
                error: 'No options data available. Try using the ETF equivalent (e.g., SPY instead of SPX).',
                data: null,
              }
            } catch (error) {
              return {
                type: 'options_chain',
                symbol,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: null,
              }
            }
          },
        }),

        // Market Status
        get_market_status: tool({
          description: 'Check if markets are currently open, in pre-market, after-hours, or closed.',
          inputSchema: zodSchema(z.object({})),
          execute: async () => {
            const plan: QueryPlan = {
              symbols: ['SPY'],
              assetClass: 'stocks',
              timeframe: { mode: 'lookback', days: 1 },
              granularity: '1d',
              datasets: ['market_status'],
              transforms: ['none'],
              benchmark: 'SPY',
              visualization: 'pulse',
              lookback: 1,
              basis: 'close',
            }

            try {
              const results = await executePlan(plan)
              if (results.length > 0) {
                return mapEnvelopeToClientType(results[0])
              }
              return { type: 'error', title: 'Unknown', message: 'Could not determine market status', recoverable: true }
            } catch (error) {
              return { type: 'error', title: 'Error', message: String(error), recoverable: true }
            }
          },
        }),

        // Market Movers
        show_market_movers: tool({
          description: 'Show top gainers and losers in the market. Useful for identifying momentum plays.',
          inputSchema: zodSchema(z.object({})),
          execute: async () => {
            const plan: QueryPlan = {
              symbols: [],
              assetClass: 'stocks',
              timeframe: { mode: 'lookback', days: 1 },
              granularity: '1d',
              datasets: ['movers'],
              transforms: ['none'],
              benchmark: 'SPY',
              visualization: 'table',
              lookback: 1,
              basis: 'close',
            }

            try {
              const results = await executePlan(plan)
              if (results.length > 0) {
                return mapEnvelopeToClientType(results[0])
              }
              return { type: 'error', title: 'No Data', message: 'No movers data available', recoverable: true }
            } catch (error) {
              return { type: 'error', title: 'Error', message: String(error), recoverable: true }
            }
          },
        }),
      },
      stopWhen: stepCountIs(5),
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('[Chat API] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Chat API] Error details:', errorMessage)
    return new Response(
      JSON.stringify({ error: `Chat error: ${errorMessage}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
