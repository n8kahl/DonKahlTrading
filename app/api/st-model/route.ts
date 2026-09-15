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
  type STBreadthMode,
  type STDailyBar,
  type STRegimePoint,
} from '@/lib/st-model'
import { assessBreadthHistory } from '@/lib/st-model/breadth-history'
import { loadBreadthHistory, upsertBreadthSnapshot } from '@/lib/st-model/breadth-store'
import { fetchWorkbookDailyBars } from '@/lib/st-model/workbook-data'
import { fetchWsjNasdaqBreadth, WSJ_BREADTH_VARIANT } from '@/lib/st-model/wsj-breadth'

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

interface BreadthResolution {
  regime?: STRegimePoint[]
  dataThrough: string | null
  mode: STBreadthMode
  notes: string[]
}

async function resolveNhnlBreadth(qqqBars: STDailyBar[]): Promise<BreadthResolution> {
  const notes: string[] = []
  const completedSessions = qqqBars.map((bar) => bar.date)
  const priceThrough = latestDate(qqqBars)
  let observedThrough: string | null = null

  try {
    const snapshot = await fetchWsjNasdaqBreadth()
    observedThrough = snapshot.date
    notes.push(`WSJ/Dow Jones Nasdaq breadth observed ${snapshot.date}: ${snapshot.newHighs} new highs / ${snapshot.newLows} new lows.`)

    if (process.env.DATABASE_URL) {
      try {
        await upsertBreadthSnapshot(snapshot)
      } catch (error) {
        console.error('[ST Model] failed to persist WSJ breadth snapshot', error)
        notes.push('WSJ breadth was fetched, but snapshot persistence failed; NH/NL remains fail-closed unless stored history is sufficient.')
      }
    } else {
      notes.push('DATABASE_URL is not configured, so WSJ breadth history cannot accumulate.')
    }
  } catch (error) {
    console.error('[ST Model] WSJ breadth fetch failed', error)
    notes.push('WSJ/Dow Jones Nasdaq breadth is temporarily unavailable; stored history will be used only if it is current and contiguous.')
  }

  if (!process.env.DATABASE_URL) {
    return { dataThrough: observedThrough, mode: 'unavailable', notes }
  }

  try {
    const history = await loadBreadthHistory(WSJ_BREADTH_VARIANT)
    const storedThrough = history.at(-1)?.date ?? null
    const assessment = assessBreadthHistory(history, completedSessions, priceThrough)
    const dataThrough = storedThrough ?? observedThrough

    if (assessment.ready) {
      notes.push(`WSJ/Dow Jones NH/NL history is current with ${assessment.contiguousSessions} contiguous completed sessions.`)
      return {
        regime: assessment.regime,
        dataThrough: assessment.throughDate,
        mode: 'wsj-dow-jones',
        notes,
      }
    }

    const progress = Math.min(assessment.contiguousSessions, assessment.requiredSessions)
    const missing = assessment.missingRequiredDates.length
      ? ` Missing required sessions: ${assessment.missingRequiredDates.join(', ')}.`
      : ''
    notes.push(`WSJ/Dow Jones NH/NL is warming up: ${progress}/${assessment.requiredSessions} contiguous completed sessions.${missing}`)
    return { dataThrough, mode: 'unavailable', notes }
  } catch (error) {
    console.error('[ST Model] failed to load WSJ breadth history', error)
    notes.push('Stored WSJ breadth history could not be read; NH/NL remains fail-closed.')
    return { dataThrough: observedThrough, mode: 'unavailable', notes }
  }
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
    const breadth = await resolveNhnlBreadth(barsBySymbol[QQQ_CONTEXT_SYMBOL] || [])

    const model = computeSTModel({
      barsBySymbol,
      smaRegime,
      dbeRegime,
      nhnlRegime: breadth.regime,
      breadthDataThrough: breadth.dataThrough,
      breadthMode: breadth.mode,
      displayDays,
      staleSymbols: stale,
      unavailableSources,
      healthNotes: breadth.notes,
    })

    return NextResponse.json({
      ...model,
      meta: buildResponseMeta(),
      methodology: {
        workbookParity: 'formula-faithful-v1',
        specVersion: ST_MODEL_SPEC_VERSION,
        sourceWorkbookSha256: ST_MODEL_REFERENCE_SHA256,
        dbe: 'same-workbook-instruments; IXF resolved as I:IXF; unavailable instruments fail closed',
        nhnl: breadth.mode === 'wsj-dow-jones'
          ? `WSJ/Dow Jones Market Diary ${WSJ_BREADTH_VARIANT}; contiguous completed-session history`
          : `WSJ/Dow Jones Market Diary ${WSJ_BREADTH_VARIANT}; unavailable/warming-up and Bull remains gated`,
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
