import { NextResponse, type NextRequest } from 'next/server'
import {
  buildResponseMeta,
  fetchDailyBars,
  fetchMarketStatus,
  type DailyBar,
} from '@/lib/massive-api'
import {
  MARKET_SIGNAL_CONFIG,
  MARKET_SIGNAL_INDEXES,
  MARKET_SIGNAL_REFERENCE_SHA256,
  MARKET_SIGNAL_REFERENCE_WORKBOOK,
  MARKET_SIGNAL_SPEC_VERSION,
  computeMarketSignal,
  normalizeProviderCloses,
  type MarketSignalClose,
  type MarketSignalIndexKey,
} from '@/lib/market-signal'

const MIN_DISPLAY_DAYS = 20
const MS_PER_DAY = 86_400_000

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

/**
 * `fetchDailyBars(symbol, days)` looks back `days * 1.5` calendar days and
 * keeps the last `days` bars. One bar per weekday since the peak start date is
 * an upper bound on the sessions needed, so nothing is trimmed, and the
 * look-back still starts a few weeks before the start date without asking the
 * provider for much more history than the table uses.
 */
function barsToRequest(peakStartDate: string): number {
  const elapsed = Math.ceil((Date.now() - Date.parse(`${peakStartDate}T00:00:00Z`)) / MS_PER_DAY)
  return Math.ceil((Math.max(elapsed, 0) * 5) / 7) + 10
}

function toCloses(bars: DailyBar[], marketOpen: boolean): { closes: MarketSignalClose[]; droppedDates: string[] } {
  const today = easternDate()
  return normalizeProviderCloses(
    bars
      .filter((bar) => !(marketOpen && bar.date === today))
      .map((bar) => ({ date: bar.date, close: bar.close }))
  )
}

export async function GET(request: NextRequest) {
  if (!process.env.MASSIVE_API_KEY && !process.env.POLYGON_API_KEY) {
    return NextResponse.json({ error: 'Market data service not configured' }, { status: 503 })
  }

  const requestedDays = Number.parseInt(request.nextUrl.searchParams.get('days') || '', 10)
  const displayDays = Number.isFinite(requestedDays) ? Math.max(requestedDays, MIN_DISPLAY_DAYS) : undefined

  try {
    const statusResult = await fetchMarketStatus().catch(() => null)
    const marketOpen = statusResult?.success === true && statusResult.status?.exchanges
      ? statusResult.status.exchanges.nyse === 'open' || statusResult.status.exchanges.nasdaq === 'open'
      : false

    const days = barsToRequest(MARKET_SIGNAL_CONFIG.peakStartDate)
    const settled = await Promise.allSettled(
      MARKET_SIGNAL_INDEXES.map((index) => fetchDailyBars(index.key, days))
    )

    const closesByIndex: Partial<Record<MarketSignalIndexKey, MarketSignalClose[]>> = {}
    const healthNotes: string[] = []
    const droppedWeekendBars: Partial<Record<MarketSignalIndexKey, string[]>> = {}
    settled.forEach((result, position) => {
      const index = MARKET_SIGNAL_INDEXES[position]
      if (result.status === 'fulfilled') {
        const { closes, droppedDates } = toCloses(result.value, marketOpen)
        closesByIndex[index.key] = closes
        if (droppedDates.length) droppedWeekendBars[index.key] = droppedDates.filter((date) => date >= MARKET_SIGNAL_CONFIG.peakStartDate)
      } else {
        console.error(`[Market Signal] failed to fetch ${index.providerSymbol}`, result.reason)
        closesByIndex[index.key] = []
        healthNotes.push(`${index.label} (${index.providerSymbol}) could not be fetched from Massive.`)
      }
    })

    const model = computeMarketSignal({ closesByIndex, displayDays, healthNotes })

    return NextResponse.json({
      ...model,
      meta: buildResponseMeta(),
      methodology: {
        workbookParity: 'formula-faithful-v2',
        specVersion: MARKET_SIGNAL_SPEC_VERSION,
        sourceWorkbook: MARKET_SIGNAL_REFERENCE_WORKBOOK,
        sourceWorkbookSha256: MARKET_SIGNAL_REFERENCE_SHA256,
        dataSource: `Massive daily index closes, rounded to cents: ${MARKET_SIGNAL_INDEXES.map((index) => index.providerSymbol).join(', ')}`,
        droppedWeekendBars,
        partialDailyBarPolicy: marketOpen ? 'current session excluded' : 'latest returned daily bar accepted',
      },
    })
  } catch (error) {
    console.error('[Market Signal] failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compute Market Signal' },
      { status: 500 }
    )
  }
}
