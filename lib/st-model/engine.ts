import { QQQ_CONTEXT_SYMBOL, ST_MODEL_SYMBOLS, WORKBOOK_CONSTANTS } from './config'
import { asRegimeMap, presidentialImpact } from './regimes'
import type {
  RegimeSignal,
  STDailyBar,
  STDataHealth,
  STModelResult,
  STRegimePoint,
  STSignalPoint,
  STSymbolConfig,
} from './types'

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function computeWorkbookRsi(bars: STDailyBar[], index: number): number | null {
  const offset = WORKBOOK_CONSTANTS.rsiOffset
  if (index < offset + 1) return null
  const gains: number[] = []
  const losses: number[] = []
  for (let i = index - offset; i <= index; i++) {
    const change = bars[i].close - bars[i - 1].close
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? Math.abs(change) : 0)
  }
  const avgGain = average(gains)
  const avgLoss = average(losses)
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

export function computeWorkbookRiseFall(bars: STDailyBar[], index: number): { pctRise: number | null; pctFall: number | null } {
  const window = WORKBOOK_CONSTANTS.shortWindow
  if (index < window - 1) return { pctRise: null, pctFall: null }
  const slice = bars.slice(index - window + 1, index + 1)
  const minLow = Math.min(...slice.map((bar) => bar.low))
  const maxHigh = Math.max(...slice.map((bar) => bar.high))
  return {
    pctRise: bars[index].low / minLow - 1,
    pctFall: bars[index].low / maxHigh - 1,
  }
}

function regimesAllBull(...signals: RegimeSignal[]): boolean {
  return signals.length > 0 && signals.every((signal) => signal.toLowerCase() === 'bull')
}

export function evaluateSignalSet(
  config: STSymbolConfig,
  metrics: { pctFall: number; pctRise: number; rsi: number; pyImpact: ReturnType<typeof presidentialImpact> },
  regimes: { sma: RegimeSignal; nhnl: RegimeSignal; dbe: RegimeSignal }
): { std: 'EB' | 'B' | ''; alt: 'B' | ''; bull: 'B' | '' } {
  const { pctFall, pctRise, rsi, pyImpact } = metrics
  let std: 'EB' | 'B' | '' = ''
  if (pctFall < WORKBOOK_CONSTANTS.stdFallThreshold && rsi < WORKBOOK_CONSTANTS.stdRsiThreshold) {
    std = config.supportsExtremeBuy && rsi === 0 && pyImpact === 'PY_Thrust' ? 'EB' : 'B'
  }

  const alt: 'B' | '' = pctFall < config.alternateFallThreshold
    && pctRise < WORKBOOK_CONSTANTS.altRiseThreshold
    && rsi < WORKBOOK_CONSTANTS.altRsiThreshold
    ? 'B'
    : ''

  let bull: 'B' | '' = ''
  if (regimesAllBull(regimes.sma, regimes.nhnl, regimes.dbe)) {
    const fast = pctFall < WORKBOOK_CONSTANTS.bullFastFallThreshold
      && rsi < WORKBOOK_CONSTANTS.bullFastRsiThreshold
      && pctRise < WORKBOOK_CONSTANTS.bullRiseThreshold
    const fallback = pctFall < WORKBOOK_CONSTANTS.bullFallbackFallThreshold
      && rsi < WORKBOOK_CONSTANTS.bullFallbackRsiThreshold
      && pctRise < WORKBOOK_CONSTANTS.bullRiseThreshold
    bull = fast || fallback ? 'B' : ''
  }

  return { std, alt, bull }
}

function daysFromHighCounter(bars: STDailyBar[]): Array<number | null> {
  const output: Array<number | null> = Array(bars.length).fill(null)
  const window = WORKBOOK_CONSTANTS.daysFromHighWindow
  for (let index = window - 1; index < bars.length; index++) {
    const slice = bars.slice(index - window + 1, index + 1)
    const maxClose = Math.max(...slice.map((bar) => bar.close))
    if (bars[index].close === maxClose) output[index] = 0
    else output[index] = output[index - 1] == null ? null : output[index - 1]! + 1
  }
  return output
}

export function qqqDaysSince63dHigh(bars: STDailyBar[]): Map<string, number> {
  const result = new Map<string, number>()
  const window = WORKBOOK_CONSTANTS.daysFromHighWindow
  for (let index = window - 1; index < bars.length; index++) {
    const start = index - window + 1
    const highs = bars.slice(start, index + 1).map((bar) => bar.high)
    const maxHigh = Math.max(...highs)
    const firstMaxIndex = highs.indexOf(maxHigh)
    result.set(bars[index].date, highs.length - 1 - firstMaxIndex)
  }
  return result
}

function latestDate(bars: STDailyBar[]): string | null {
  return bars.length ? bars[bars.length - 1].date : null
}

function minDate(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => Boolean(value))
  return present.length ? present.sort()[0] : null
}

export interface ComputeSTModelInput {
  barsBySymbol: Record<string, STDailyBar[]>
  smaRegime: STRegimePoint[]
  dbeRegime: STRegimePoint[]
  nhnlRegime?: STRegimePoint[]
  breadthDataThrough?: string | null
  displayDays?: number
  staleSymbols?: string[]
  unavailableSources?: string[]
}

export function computeSTModel(input: ComputeSTModelInput): STModelResult {
  const sma = asRegimeMap(input.smaRegime)
  const dbe = asRegimeMap(input.dbeRegime)
  const nhnl = asRegimeMap(input.nhnlRegime || [])
  const qqqContext = qqqDaysSince63dHigh(input.barsBySymbol[QQQ_CONTEXT_SYMBOL] || [])
  const rows: STSignalPoint[] = []

  for (const config of ST_MODEL_SYMBOLS) {
    const bars = input.barsBySymbol[config.symbol] || []
    const daysFromHigh = daysFromHighCounter(bars)
    for (let index = 0; index < bars.length; index++) {
      const bar = bars[index]
      const rsi = computeWorkbookRsi(bars, index)
      const { pctRise, pctFall } = computeWorkbookRiseFall(bars, index)
      const smaSignal = sma.get(bar.date) || 'Unavailable'
      const dbeSignal = dbe.get(bar.date) || 'Unavailable'
      const nhnlSignal = nhnl.get(bar.date) || 'Unavailable'
      const pyImpact = presidentialImpact(bar.date)
      const complete = rsi != null && pctRise != null && pctFall != null
      const bullSignalEligible = complete && regimesAllBull(smaSignal, nhnlSignal, dbeSignal)

      const evaluated = complete
        ? evaluateSignalSet(
            config,
            { pctFall: pctFall!, pctRise: pctRise!, rsi: rsi!, pyImpact },
            { sma: smaSignal, nhnl: nhnlSignal, dbe: dbeSignal }
          )
        : { std: '' as const, alt: '' as const, bull: '' as const }

      rows.push({
        date: bar.date,
        symbol: config.symbol,
        std: evaluated.std,
        alt: evaluated.alt,
        bull: evaluated.bull,
        rsi,
        pctRise,
        pctFall,
        daysFromHigh: daysFromHigh[index],
        qqqDaysSince63dHigh: qqqContext.get(bar.date) ?? null,
        pyImpact,
        regimes: { sma: smaSignal, nhnl: nhnlSignal, dbe: dbeSignal },
        bullSignalEligible,
      })
    }
  }

  const allDates = [...new Set(rows.map((row) => row.date))].sort()
  const displayDates = input.displayDays ? allDates.slice(-input.displayDays) : allDates
  const displayDateSet = new Set(displayDates)
  const displayRows = rows.filter((row) => displayDateSet.has(row.date))
  const byDate: Record<string, Record<string, STSignalPoint>> = {}
  for (const row of displayRows) {
    byDate[row.date] ||= {}
    byDate[row.date][row.symbol] = row
  }

  const priceDataThrough = minDate(ST_MODEL_SYMBOLS.map((config) => latestDate(input.barsBySymbol[config.symbol] || [])))
  const staleSymbols = input.staleSymbols || []
  const unavailableSources = input.unavailableSources || []
  const breadthMode = input.nhnlRegime?.length ? 'legacy-exact' : 'unavailable'
  const notes: string[] = []
  if (breadthMode === 'unavailable') notes.push('Legacy Nasdaq NH/NL input is unavailable; Bull composite signals are gated off.')
  if (staleSymbols.length) notes.push(`Stale price feeds: ${staleSymbols.join(', ')}`)
  if (unavailableSources.length) notes.push(`Unavailable market-data sources: ${unavailableSources.join(', ')}`)
  const health: STDataHealth = {
    status: staleSymbols.length ? 'stale' : (breadthMode === 'unavailable' || unavailableSources.length) ? 'degraded' : 'current',
    priceDataThrough,
    breadthDataThrough: input.breadthDataThrough ?? null,
    breadthMode,
    staleSymbols,
    unavailableSources,
    notes,
  }

  return {
    dates: displayDates.slice().reverse(),
    symbols: ST_MODEL_SYMBOLS.map((config) => config.symbol),
    rows: displayRows,
    byDate,
    health,
  }
}
