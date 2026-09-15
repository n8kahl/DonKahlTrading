import { fetchDailyBars, type DailyBar } from '../massive-api'

const BASE_URL = process.env.POLYGON_BASE_URL || 'https://api.polygon.io'

/**
 * The Excel workbook's DBE sheet contains a few linked-data instruments whose
 * displayed ticker is ambiguous outside Excel. Keep those workbook semantics
 * explicit here instead of teaching the entire Tucson Trader data layer about
 * model-specific aliases.
 */
const WORKBOOK_PROVIDER_SYMBOLS: Record<string, string> = {
  // Excel rich-data metadata identifies IXF as the NASDAQ Financial 100 Index.
  // Massive requires the index namespace for historical aggregates.
  IXF: 'I:IXF',
}

export function resolveWorkbookProviderSymbol(symbol: string): string {
  const normalized = symbol.toUpperCase().trim()
  return WORKBOOK_PROVIDER_SYMBOLS[normalized] || normalized
}

function apiKey(): string | null {
  return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || null
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Fetch daily history using Tucson Trader's shared data layer whenever the
 * workbook symbol maps cleanly. Workbook-only index aliases are fetched from
 * the same Massive aggregate endpoint with their exact provider identifier.
 */
export async function fetchWorkbookDailyBars(symbol: string, days = 252): Promise<DailyBar[]> {
  const providerSymbol = resolveWorkbookProviderSymbol(symbol)
  if (providerSymbol === symbol.toUpperCase().trim()) {
    return fetchDailyBars(symbol, days)
  }

  const key = apiKey()
  if (!key) throw new Error('MASSIVE_API_KEY is not configured')

  const to = new Date()
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - Math.ceil(days * 1.5))

  const url = `${BASE_URL}/v2/aggs/ticker/${encodeURIComponent(providerSymbol)}/range/1/day/${ymd(from)}/${ymd(to)}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`
  const response = await fetch(url, { next: { revalidate: 3600 } })
  if (!response.ok) {
    throw new Error(`Failed to fetch data for ${symbol}: ${response.statusText}`)
  }

  const data = await response.json()
  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(`No data returned for ${symbol}`)
  }

  return data.results
    .map((bar: { t: number; o: number; h: number; l: number; c: number; v?: number }) => ({
      date: new Date(bar.t).toISOString().slice(0, 10),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v || 0,
    }))
    .slice(-days)
}
