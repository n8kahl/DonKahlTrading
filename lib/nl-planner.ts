// =============================================================================
// Tucson Trader - Natural Language Query Planner
// Converts NL queries into Massive API calls using LLM
// =============================================================================

import { getAvailableOperations } from './massive-openapi'

export interface NLPlannerResult {
  operationId: string
  params: Record<string, any>
  desiredVisualization: 'chart' | 'table' | 'value' | 'auto'
  followupQuestions: string[]
  explanation: string
}

// System prompt for the LLM planner
const PLANNER_SYSTEM_PROMPT = `You are a financial data API planner. Your job is to convert natural language queries about stock market data into structured API calls.

Available API operations:
${JSON.stringify(getAvailableOperations(), null, 2)}

Today's date: ${new Date().toISOString().split('T')[0]}

When users ask about stock data, determine:
1. Which operation to use (operationId)
2. What parameters to pass
3. What visualization would be best (chart, table, value)
4. What follow-up questions might help refine the query

For date ranges:
- "last week" = from 7 days ago to today
- "last month" = from 30 days ago to today
- "last quarter" = from 90 days ago to today
- "last year" = from 365 days ago to today
- "YTD" = from January 1 of current year to today

For timespan in aggregates:
- Use "day" for daily data
- Use "hour" for hourly data
- Use "minute" for minute data

Output ONLY valid JSON in this format:
{
  "operationId": "string",
  "params": { ... },
  "desiredVisualization": "chart" | "table" | "value" | "auto",
  "followupQuestions": ["string"],
  "explanation": "Brief explanation of what you're fetching"
}`

/**
 * Parse natural language query into API call plan
 * This is a simplified implementation - in production, use actual LLM
 */
export function parseNLQuery(query: string): NLPlannerResult | null {
  const lowerQuery = query.toLowerCase()

  // Get date range helpers
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  const getDateRange = (daysBack: number) => {
    const from = new Date(today)
    from.setDate(from.getDate() - daysBack)
    return { from: formatDate(from), to: formatDate(today) }
  }

  // Pattern matching for common queries
  // Pattern: "show me [ticker] price/chart"
  const priceMatch = lowerQuery.match(/(?:show|get|fetch|what(?:'s| is))\s+(?:me\s+)?(?:the\s+)?(\w+)\s+(?:stock\s+)?(?:price|chart|data|history)/i)
  if (priceMatch) {
    const ticker = priceMatch[1].toUpperCase()
    const range = getDateRange(30)
    return {
      operationId: 'get_aggs',
      params: {
        stocksTicker: ticker,
        multiplier: 1,
        timespan: 'day',
        from: range.from,
        to: range.to,
        adjusted: true,
        sort: 'asc',
      },
      desiredVisualization: 'chart',
      followupQuestions: [
        `Would you like to see ${ticker} over a different time period?`,
        `Should I compare ${ticker} with another stock?`,
      ],
      explanation: `Fetching daily price data for ${ticker} over the last 30 days`,
    }
  }

  // Pattern: "[ticker] [timeframe]" e.g., "AAPL last month"
  const tickerTimeMatch = lowerQuery.match(/(\w{1,5})\s+(?:for\s+)?(?:the\s+)?(?:last|past)\s+(week|month|quarter|year|90 days|30 days|7 days)/i)
  if (tickerTimeMatch) {
    const ticker = tickerTimeMatch[1].toUpperCase()
    const timeframe = tickerTimeMatch[2].toLowerCase()
    let days = 30
    if (timeframe.includes('week') || timeframe.includes('7')) days = 7
    if (timeframe.includes('month') || timeframe.includes('30')) days = 30
    if (timeframe.includes('quarter') || timeframe.includes('90')) days = 90
    if (timeframe.includes('year')) days = 365

    const range = getDateRange(days)
    return {
      operationId: 'get_aggs',
      params: {
        stocksTicker: ticker,
        multiplier: 1,
        timespan: 'day',
        from: range.from,
        to: range.to,
        adjusted: true,
        sort: 'asc',
      },
      desiredVisualization: 'chart',
      followupQuestions: [
        `Would you like to see volume data for ${ticker}?`,
        `Should I calculate any technical indicators?`,
      ],
      explanation: `Fetching ${ticker} daily data for the ${timeframe}`,
    }
  }

  // Pattern: "top gainers/losers"
  if (lowerQuery.includes('gainer') || (lowerQuery.includes('top') && lowerQuery.includes('up'))) {
    return {
      operationId: 'get_snapshot_gainers_losers',
      params: { direction: 'gainers', include_otc: false },
      desiredVisualization: 'table',
      followupQuestions: [
        'Would you like to see the top losers as well?',
        'Should I show more details for any specific stock?',
      ],
      explanation: 'Fetching today\'s top gaining stocks',
    }
  }

  if (lowerQuery.includes('loser') || (lowerQuery.includes('top') && lowerQuery.includes('down'))) {
    return {
      operationId: 'get_snapshot_gainers_losers',
      params: { direction: 'losers', include_otc: false },
      desiredVisualization: 'table',
      followupQuestions: [
        'Would you like to see the top gainers as well?',
        'Should I show more details for any specific stock?',
      ],
      explanation: 'Fetching today\'s top losing stocks',
    }
  }

  // Pattern: "market status" or "is market open"
  if (lowerQuery.includes('market') && (lowerQuery.includes('status') || lowerQuery.includes('open') || lowerQuery.includes('close'))) {
    return {
      operationId: 'get_market_status',
      params: {},
      desiredVisualization: 'value',
      followupQuestions: [
        'Would you like to see the market schedule?',
        'Should I show upcoming market holidays?',
      ],
      explanation: 'Checking current market status',
    }
  }

  // Pattern: "[ticker] snapshot" or "how is [ticker] doing"
  const snapshotMatch = lowerQuery.match(/(?:how(?:'s| is)\s+)?(\w{1,5})\s+(?:doing|today|snapshot|current|now)/i)
  if (snapshotMatch) {
    const ticker = snapshotMatch[1].toUpperCase()
    return {
      operationId: 'get_snapshot_ticker',
      params: { stocksTicker: ticker },
      desiredVisualization: 'value',
      followupQuestions: [
        `Would you like to see ${ticker}'s price history?`,
        `Should I compare ${ticker} with the market?`,
      ],
      explanation: `Getting current snapshot for ${ticker}`,
    }
  }

  // Pattern: just a ticker symbol
  const justTicker = lowerQuery.match(/^(\w{1,5})$/i)
  if (justTicker) {
    const ticker = justTicker[1].toUpperCase()
    const range = getDateRange(30)
    return {
      operationId: 'get_aggs',
      params: {
        stocksTicker: ticker,
        multiplier: 1,
        timespan: 'day',
        from: range.from,
        to: range.to,
        adjusted: true,
        sort: 'asc',
      },
      desiredVisualization: 'chart',
      followupQuestions: [
        `Would you like to see ${ticker}'s current price?`,
        `Should I show a longer time period?`,
      ],
      explanation: `Fetching ${ticker} daily data for the last 30 days`,
    }
  }

  // No match found
  return null
}

/**
 * Generate a human-readable description of an API plan
 */
export function describePlan(plan: NLPlannerResult): string {
  const opNames: Record<string, string> = {
    'get_aggs': 'fetching historical price data',
    'get_snapshot_ticker': 'getting current market snapshot',
    'get_snapshot_gainers_losers': 'finding top market movers',
    'get_snapshot_all': 'scanning all market data',
    'get_previous_close': 'getting yesterday\'s closing data',
    'get_market_status': 'checking market status',
  }

  return `I'm ${opNames[plan.operationId] || 'executing API call'}. ${plan.explanation}`
}
