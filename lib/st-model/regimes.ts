import { DBE_SYMBOLS, WORKBOOK_CONSTANTS } from './config'
import type { RegimeSignal, STDailyBar, STRegimePoint } from './types'

function yearCycle(date: string): number {
  const year = Number(date.slice(0, 4))
  const mod = year % 4
  return mod > 0 ? mod : 4
}

export function presidentialImpact(date: string): 'PY_Thrust' | 'PY_Danger' | '' {
  const cycle = yearCycle(date)
  const month = Number(date.slice(5, 7))
  if (cycle === 2 && month >= 10) return 'PY_Thrust'
  if (cycle === 3 && month <= 7) return 'PY_Thrust'
  if (cycle === 2 && month <= 9) return 'PY_Danger'
  return ''
}

function dbePresidentialBull(date: string): boolean {
  const cycle = yearCycle(date)
  const month = Number(date.slice(5, 7))
  return (cycle === 2 && month >= 10) || (cycle === 3 && month <= 6)
}

export function computeSmaRegime(bars: STDailyBar[]): STRegimePoint[] {
  const { smaWindow, smaSlopeLag } = WORKBOOK_CONSTANTS
  const closes = bars.map((bar) => bar.close)
  const sma: Array<number | null> = closes.map((_, index) => {
    if (index < smaWindow - 1) return null
    let total = 0
    for (let i = index - smaWindow + 1; i <= index; i++) total += closes[i]
    return total / smaWindow
  })

  return bars.map((bar, index) => {
    const current = sma[index]
    const previous = index >= smaSlopeLag ? sma[index - smaSlopeLag] : null
    const signal: RegimeSignal = current == null || previous == null
      ? 'Unavailable'
      : current > previous
        ? 'Bull'
        : 'Bear'
    return { date: bar.date, signal }
  })
}

export function computeLegacyNhnlRegime(
  rows: Array<{ date: string; newHighs: number; newLows: number }>
): STRegimePoint[] {
  const output: STRegimePoint[] = []
  let prior: RegimeSignal = 'Unavailable'

  for (let index = 0; index < rows.length; index++) {
    if (index < 8) {
      output.push({ date: rows[index].date, signal: 'Unavailable' })
      continue
    }

    let weighted = 0
    let denominator = 0
    for (let offset = 0; offset < 9; offset++) {
      const weight = 9 - offset
      const row = rows[index - offset]
      weighted += weight * (row.newHighs - row.newLows)
      denominator += weight
    }
    const wma = weighted / denominator
    if (wma < -12) prior = 'Bear'
    else if (wma > 0) prior = 'Bull'
    output.push({ date: rows[index].date, signal: prior })
  }

  return output
}

function mapBarsByDate(bars: STDailyBar[]): Map<string, STDailyBar> {
  return new Map(bars.map((bar) => [bar.date, bar]))
}

export function computeDbeRegime(
  barsBySymbol: Record<string, STDailyBar[]>,
  baselineSymbol = 'SPY'
): STRegimePoint[] {
  const baseline = barsBySymbol[baselineSymbol] || []
  const maps = Object.fromEntries(DBE_SYMBOLS.map((symbol) => [symbol, mapBarsByDate(barsBySymbol[symbol] || [])]))
  const states: Record<string, number | null> = Object.fromEntries(DBE_SYMBOLS.map((symbol) => [symbol, null]))
  const priorRollingHigh: Record<string, number | null> = Object.fromEntries(DBE_SYMBOLS.map((symbol) => [symbol, null]))
  const valueHistory: Record<string, number[]> = Object.fromEntries(DBE_SYMBOLS.map((symbol) => [symbol, []]))
  const out: STRegimePoint[] = []

  for (const baseBar of baseline) {
    const date = baseBar.date
    const available = DBE_SYMBOLS.every((symbol) => maps[symbol].has(date))
    if (!available) {
      out.push({ date, signal: 'Unavailable' })
      continue
    }

    for (const symbol of DBE_SYMBOLS) {
      const close = maps[symbol].get(date)!.close
      valueHistory[symbol].push(close)
      if (valueHistory[symbol].length > WORKBOOK_CONSTANTS.dbeWindow) valueHistory[symbol].shift()
    }

    const complete = DBE_SYMBOLS.every((symbol) => valueHistory[symbol].length === WORKBOOK_CONSTANTS.dbeWindow)
    if (!complete) {
      out.push({ date, signal: 'Unavailable' })
      continue
    }

    for (const symbol of DBE_SYMBOLS) {
      const rollingHigh = Math.max(...valueHistory[symbol])
      const prior = priorRollingHigh[symbol]
      if (prior == null) states[symbol] = 1
      else if (rollingHigh > prior) states[symbol] = 1
      else if (rollingHigh < prior) states[symbol] = 0
      priorRollingHigh[symbol] = rollingHigh
    }

    if (dbePresidentialBull(date)) {
      out.push({ date, signal: 'Bull' })
      continue
    }

    const validStates = DBE_SYMBOLS.map((symbol) => states[symbol]).filter((value): value is number => value != null)
    if (validStates.length !== DBE_SYMBOLS.length) {
      out.push({ date, signal: 'Unavailable' })
      continue
    }

    const bearishFraction = validStates.filter((value) => value === 0).length / validStates.length
    out.push({
      date,
      signal: bearishFraction > WORKBOOK_CONSTANTS.dbeBearishFractionThreshold ? 'Bear' : 'Bull',
    })
  }

  return out
}

export function asRegimeMap(points: STRegimePoint[]): Map<string, RegimeSignal> {
  return new Map(points.map((point) => [point.date, point.signal]))
}
