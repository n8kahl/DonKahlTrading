export const WSJ_BREADTH_VARIANT = 'wsj-market-diary-live-v1' as const
export const WSJ_BREADTH_SOURCE = 'WSJ/Dow Jones Market Data' as const

const WSJ_MARKET_DIARY_URL = 'https://www.wsj.com/market-data/stocks/marketsdiary'
const FETCH_TIMEOUT_MS = 5_000

export interface WsjBreadthSnapshot {
  date: string
  newHighs: number
  newLows: number
  source: typeof WSJ_BREADTH_SOURCE
  variant: typeof WSJ_BREADTH_VARIANT
  sourceTimestamp: string
  capturedAt: string
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function integerCount(value: unknown, field: string): number {
  const parsed = numeric(value)
  if (parsed == null || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`WSJ Market Diary returned invalid ${field}`)
  }
  return parsed
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

export function wsjTimestampToDate(timestamp: string): string {
  const match = timestamp.trim().match(/^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/)
  if (!match) throw new Error(`Unrecognized WSJ Market Diary timestamp: ${timestamp}`)
  const month = MONTHS[match[1].toLowerCase()]
  const day = Number(match[2])
  const year = Number(match[3])
  if (!month || day < 1 || day > 31 || year < 1900) {
    throw new Error(`Invalid WSJ Market Diary timestamp: ${timestamp}`)
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function rowId(row: JsonRecord): string {
  return String(row.id ?? row.name ?? '').toLowerCase().replace(/\s+/g, '')
}

function exchangeLabel(set: JsonRecord): string {
  const headers = asArray(set.headerFields).map(asRecord).filter((value): value is JsonRecord => Boolean(value))
  return headers.map((header) => String(header.label ?? header.value ?? '')).join(' ')
}

function valueForExchange(row: JsonRecord, set: JsonRecord): unknown {
  if (row.latestClose != null) return row.latestClose
  const headers = asArray(set.headerFields).map(asRecord).filter((value): value is JsonRecord => Boolean(value))
  const nasdaq = headers.find((header) => /nasdaq/i.test(String(header.label ?? header.value ?? '')))
  const key = nasdaq?.value
  if (typeof key === 'string' && row[key] != null) return row[key]
  return row.NASDAQ ?? row.nasdaq
}

/**
 * Parse only the Nasdaq new-high/new-low fields used by Don's legacy model.
 * Any response-shape drift fails closed rather than manufacturing breadth.
 */
export function parseWsjNasdaqBreadth(payload: unknown, capturedAt = new Date().toISOString()): WsjBreadthSnapshot {
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  const sets = asArray(data?.instrumentSets).map(asRecord).filter((value): value is JsonRecord => Boolean(value))
  if (!sets.length) throw new Error('WSJ Market Diary instrumentSets missing')

  for (const set of sets) {
    if (!/nasdaq/i.test(exchangeLabel(set))) continue
    const rows = asArray(set.instruments).map(asRecord).filter((value): value is JsonRecord => Boolean(value))
    const highs = rows.find((row) => ['newhighs', 'new52weekhighs'].includes(rowId(row)))
    const lows = rows.find((row) => ['newlows', 'new52weeklows'].includes(rowId(row)))
    if (!highs || !lows) continue

    const timestamp = String(highs.timestamp ?? lows.timestamp ?? data?.timestamp ?? '').trim()
    if (!timestamp) throw new Error('WSJ Market Diary timestamp missing')

    return {
      date: wsjTimestampToDate(timestamp),
      newHighs: integerCount(valueForExchange(highs, set), 'Nasdaq new highs'),
      newLows: integerCount(valueForExchange(lows, set), 'Nasdaq new lows'),
      source: WSJ_BREADTH_SOURCE,
      variant: WSJ_BREADTH_VARIANT,
      sourceTimestamp: timestamp,
      capturedAt,
    }
  }

  throw new Error('WSJ Market Diary Nasdaq new-high/new-low rows missing')
}

function marketDiaryUrl(): string {
  const url = new URL(WSJ_MARKET_DIARY_URL)
  url.searchParams.set('id', JSON.stringify({ application: 'WSJ', marketsDiaryType: 'diaries' }))
  url.searchParams.set('type', 'mdc_marketsdiary')
  return url.toString()
}

/**
 * Public WSJ Market Diary adapter. This is an externally controlled endpoint,
 * so callers must treat failures or schema drift as source-unavailable.
 */
export async function fetchWsjNasdaqBreadth(): Promise<WsjBreadthSnapshot> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(marketDiaryUrl(), {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'if-modified-since': 'Sat, 1 Jan 2000 00:00:00 GMT',
        'user-agent': 'Mozilla/5.0 (compatible; TucsonTrader/1.0; +https://github.com/n8kahl/DonKahlTrading)',
      },
    })
    if (!response.ok) throw new Error(`WSJ Market Diary request failed: HTTP ${response.status}`)
    const payload: unknown = await response.json()
    return parseWsjNasdaqBreadth(payload)
  } finally {
    clearTimeout(timeout)
  }
}
