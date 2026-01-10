'use server'

// -----------------------------------------------------------------------------
// Types - Exported for use across the app
// -----------------------------------------------------------------------------

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolInvocations?: ToolInvocation[]
}

export interface ToolInvocation {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
}

export type AIState = Message[]

export type UIState = {
  id: string
  role: 'user' | 'assistant'
  content: string
  display?: React.ReactNode
}[]

// -----------------------------------------------------------------------------
// Tool Result Types
// -----------------------------------------------------------------------------

export interface MarketDashboardResult {
  type: 'market_dashboard'
  lookback: number
  symbols: Array<{
    symbol: string
    daysSinceHigh: number | null
    pctFromHigh: number | null
    daysSinceLow: number | null
    pctFromLow: number | null
    close: number | null
  }>
}

export interface OptionsChainResult {
  type: 'options_chain'
  symbol: string
  error: string | null
  data: {
    putCallRatio: number
    sentiment: 'Bullish' | 'Bearish' | 'Neutral'
    totalVolume: number
    avgIV: number
    maxPainStrike: number
    underlyingPrice: number
  } | null
}

export interface PriceChartResult {
  type: 'price_chart'
  symbol: string
  timeframe: 'daily' | 'intraday'
  error: string | null
  data: {
    bars: Array<{
      time: string
      open: number
      high: number
      low: number
      close: number
      volume: number
    }>
    summary: {
      latestClose: number
      change: number
      changePercent: number
      periodHigh: number
      periodLow: number
    }
  } | null
}

export type ToolResult = MarketDashboardResult | OptionsChainResult | PriceChartResult

// -----------------------------------------------------------------------------
// Server Action - Submit message via API route
// -----------------------------------------------------------------------------

export async function submitUserMessage(
  userMessage: string,
  history: Message[] = []
): Promise<{ id: string; role: 'assistant'; stream: ReadableStream<Uint8Array> }> {
  const messages = [
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Chat API error: ${response.status}`)
  }

  return {
    id: `assistant_${Date.now()}`,
    role: 'assistant' as const,
    stream: response.body,
  }
}

// -----------------------------------------------------------------------------
// Helper - Generate unique ID
// -----------------------------------------------------------------------------

export async function generateId(): Promise<string> {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
