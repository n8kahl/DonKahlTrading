// =============================================================================
// AI Card Types - Shared types for generative UI components
// =============================================================================

export interface PinConfig {
  type: string
  title: string
  config: Record<string, unknown>
  pinnedAt: string
}

export interface CardProps {
  onPin?: (config: PinConfig) => void
  className?: string
}

// Result envelope types from AI tools
export type ResultType =
  | 'market_dashboard'
  | 'options_chain'
  | 'price_chart'
  | 'heatmap'
  | 'breadth'
  | 'pulse'
  | 'error'

export interface MarketDashboardData {
  type: 'market_dashboard'
  lookback: number
  symbols: Array<{
    symbol: string
    daysSinceHigh: number | null
    pctFromHigh: number | null
    daysSinceLow: number | null
    pctFromLow: number | null
    close: number | null
    rollingHigh: number | null
    rollingLow: number | null
  }>
}

export interface OptionsChainData {
  type: 'options_chain'
  symbol: string
  error: string | null
  data: {
    putCallRatio: number
    sentiment: string
    topStrike: number
    totalVolume: number
    totalOpenInterest: number
    avgIV: number
    maxPainStrike: number
    underlyingPrice: number
    strikeDistance: number
  } | null
}

export interface PriceChartData {
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
      periodRange: number
      dataPoints: number
      positionInRange: number
    }
  } | null
}

export interface HeatmapData {
  type: 'heatmap'
  lookback: number
  dates: string[]
  data: Record<string, number[]>
}

export interface BreadthData {
  type: 'breadth'
  advancers: number
  decliners: number
  unchanged: number
  newHighs: number
  newLows: number
  upVolume: number
  downVolume: number
}

export interface MarketPulseData {
  type: 'pulse'
  symbols: Array<{
    symbol: string
    price: number
    change: number
    changePercent: number
    volume: number
    signal: 'bullish' | 'bearish' | 'neutral'
  }>
  marketStatus: 'open' | 'closed' | 'pre-market' | 'after-hours'
  lastUpdated: string
}

export interface ErrorData {
  type: 'error'
  title: string
  message: string
  recoverable?: boolean
}

export type ResultEnvelope =
  | MarketDashboardData
  | OptionsChainData
  | PriceChartData
  | HeatmapData
  | BreadthData
  | MarketPulseData
  | ErrorData
