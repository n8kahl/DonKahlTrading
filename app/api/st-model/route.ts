import { NextResponse, type NextRequest } from 'next/server'
import {
  buildResponseMeta,
  fetchMarketStatus,
  type DailyBar,
} from '@/lib/massive-api'
import {
  DBE_SYMBOLS,
  QQQ_CONTEXT_SYMBOL,
  SMA_SYMBOL,
  ST_MODEL_SPEC_VERSION,
  ST_MODEL_REFERENCE_SHA256,
  ST_MODEL_SYMBOLS,
  computeDbeRegime,
  computeSmaRegime,
  computeSTModel,
  type STDailyBar,
} from '@/lib/st-model'
import { fetchWorkbookDailyBars } from '@/lib/st-model/workbook-data'

const FETCH_BARS = 600
const MAX_CONCURRENCY = 5

function easternDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function toSTBars(bars: DailyBar[], marketOpen: boolean): STDailyBar[] {
  const today = easternDate()
  return bars
    .filter((bar) => !(marketOpen && bar.date === today))
    .map((bar) => ({
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }))
}

async function fetchInBatches(symbols: string[], marketOpen: boolean): Promise<Record<string, STDailyBar[]>> {
  const out: Record<string, STDailyBar[]> = {}
  for (let start = 0; start < symbols.length; start += MAX_CONCURRENCY) {
    const batch = symbols.slice(start, start + MAX_CONCURRENCY)
    const settled = await Promise.allSettled(batch.map((symbol) => fetchWorkbookDailyBars(symbol, FETCH_BARS)))
    settled.forEach((result, index) => {
      const symbol = batch[index]
      out[symbol] = result.status === 'fulfilled' ? toSTBars(result.value, marketOpen) : []
    })
  }
  return out
}

function latestDate(bars: STDailyBar[]): string | null {
  return bars.length ? bars[bars.length - 1].date : null
}

function staleSymbols(barsBySymbol: Record<string, STDailyBar[]>): string[] {
  const populated = Object.entries(barsBySymbol).filter(([, bars]) => bars.length > 0)
  const dates = populated.map(([, bars]) => latestDate(bars)).filter((value): value is string => Boolean(value))
  if (!dates.length) return []
  const newest = dates.slice().sort().at(-1)!
  return populated
    .filter(([, bars]) => latestDate(bars) !== newest)
    .map(([symbol]) => symbol)
}

export async function GET(request: NextRequest) {
  if (!process.env.MASSIVE_API_KEY && !process.env.POLYGON_API_KEY) {
    return NextResponse.json({ error: 'Market data service not configured' }, { status: 503 })
  }

  const requestedDays = Number.parseInt(request.nextUrl.searchParams.get('days') || '90', 10)
  const displayDays = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 20), 252) : 90

  try {
    const statusResult = await fetchMarketStatus().catch(() => null)
    const marketOpen = statusResult?.success === true && statusResult.status?.exchanges
      ? statusResult.status.exchanges.nyse === 'open' || statusResult.status.exchanges.nasdaq === 'open'
      : false

    const symbols = [...new Set([
      ...ST_MODEL_SYMBOLS.map(({ symbol }) => symbol),
      SMA_SYMBOL,
      QQQ_CONTEXT_SYMBOL,
      ...DBE_SYMBOLS,
    ])]

    const barsBySymbol = await fetchInBatches(symbols, marketOpen)
    const smaRegime = computeSmaRegime(barsBySymbol[SMA_SYMBOL] || [])
    const dbeRegime = computeDbeRegime(barsBySymbol)
    const unavailableSources = symbols.filter((symbol) => !(barsBySymbol[symbol]?.length))
    const stale = staleSymbols(barsBySymbol)

    // Legacy Nasdaq 52-week NH/NL is intentionally NOT replaced with ETF-proxy breadth here.
    // Until an exact/approved source is wired, the engine reports NHNL as unavailable and
    // gates the workbook's three-regime Bull composite off.
    const model = computeSTModel({
      barsBySymbol,
      smaRegime,
      dbeRegime,
      nhnlRegime: undefined,
      breadthDataThrough: '2024-02-15',
      displayDays,
      staleSymbols: stale,
      unavailableSources,
    })

    return NextResponse.json({
      ...model,
      meta: buildResponseMeta(),
      methodology: {
        workbookParity: 'formula-faithful-v1',
        specVersion: ST_MODEL_SPEC_VERSION,
        sourceWorkbookSha256: ST_MODEL_REFERENCE_SHA256,
        dbE: 'same-workbook-instruments; IXF resolved as I:IXF; unavailable instruments fail closed',
        nhnl: 'unavailable-not-substituted',
        partialDailyBarPolicy: marketOpen ? 'current session excluded' : 'latest returned daily bar accepted',
      },
    })
  } catch (error) {
    console.error('[ST Model] failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compute ST Model' },
      { status: 500 }
    )
  }
}
