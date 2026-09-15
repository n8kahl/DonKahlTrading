import { describe, expect, it } from 'vitest'
import { ST_MODEL_SYMBOLS } from './config'
import { computeWorkbookRiseFall, computeWorkbookRsi, evaluateSignalSet } from './engine'
import { computeDbeRegime, computeLegacyNhnlRegime, computeSmaRegime, presidentialImpact } from './regimes'
import type { STDailyBar } from './types'

const config = (symbol: string) => {
  const found = ST_MODEL_SYMBOLS.find((item) => item.symbol === symbol)
  if (!found) throw new Error(`missing config for ${symbol}`)
  return found
}

const bullRegimes = { sma: 'Bull' as const, nhnl: 'Bull' as const, dbe: 'Bull' as const }

describe('ST Model workbook parity: metric primitives', () => {
  it('uses the current gain/loss plus four prior observations for RSI', () => {
    const closes = [100, 110, 100, 110, 100, 110]
    const bars: STDailyBar[] = closes.map((close, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      open: close,
      high: close,
      low: close,
      close,
    }))
    expect(computeWorkbookRsi(bars, 5)).toBeCloseTo(60, 10)
  })

  it('uses an inclusive eleven-bar low/high window for rise and fall', () => {
    const bars: STDailyBar[] = Array.from({ length: 11 }, (_, index) => ({
      date: `2026-02-${String(index + 1).padStart(2, '0')}`,
      open: 100,
      high: 110 + index,
      low: 90 + index,
      close: 100,
    }))
    const metric = computeWorkbookRiseFall(bars, 10)
    expect(metric.pctRise).toBeCloseTo(100 / 90 - 1, 10)
    expect(metric.pctFall).toBeCloseTo(100 / 120 - 1, 10)
  })
})

describe('ST Model workbook parity: short-term signals', () => {
  it('emits EB only for an extreme-buy eligible symbol during PY_Thrust', () => {
    expect(evaluateSignalSet(
      config('SOXL'),
      { pctFall: -0.21, pctRise: 0, rsi: 0, pyImpact: 'PY_Thrust' },
      bullRegimes
    ).std).toBe('EB')

    expect(evaluateSignalSet(
      config('SOXL'),
      { pctFall: -0.21, pctRise: 0, rsi: 0, pyImpact: '' },
      bullRegimes
    ).std).toBe('B')

    expect(evaluateSignalSet(
      config('TECL'),
      { pctFall: -0.21, pctRise: 0, rsi: 0, pyImpact: 'PY_Thrust' },
      bullRegimes
    ).std).toBe('B')
  })

  it('preserves FNGG alternate threshold exception', () => {
    expect(evaluateSignalSet(
      config('FNGG'),
      { pctFall: -0.14, pctRise: 0.01, rsi: 10, pyImpact: '' },
      bullRegimes
    ).alt).toBe('B')

    expect(evaluateSignalSet(
      config('TQQQ'),
      { pctFall: -0.14, pctRise: 0.01, rsi: 10, pyImpact: '' },
      bullRegimes
    ).alt).toBe('')
  })

  it('uses strict workbook thresholds, not <= approximations', () => {
    expect(evaluateSignalSet(
      config('SOXL'),
      { pctFall: -0.20, pctRise: 0, rsi: 0, pyImpact: 'PY_Thrust' },
      bullRegimes
    ).std).toBe('')

    expect(evaluateSignalSet(
      config('SOXL'),
      { pctFall: -0.200001, pctRise: 0.02, rsi: 19.999, pyImpact: '' },
      bullRegimes
    ).alt).toBe('')

    expect(evaluateSignalSet(
      config('SOXL'),
      { pctFall: -0.200001, pctRise: 0.019999, rsi: 19.999, pyImpact: '' },
      bullRegimes
    ).alt).toBe('B')
  })

  it('gates Bull composite on all three legacy regimes', () => {
    const metrics = { pctFall: -0.16, pctRise: 0.01, rsi: 20, pyImpact: '' as const }
    expect(evaluateSignalSet(config('SOXL'), metrics, bullRegimes).bull).toBe('B')
    expect(evaluateSignalSet(config('SOXL'), metrics, { ...bullRegimes, nhnl: 'Unavailable' }).bull).toBe('')
    expect(evaluateSignalSet(config('SOXL'), metrics, { ...bullRegimes, dbe: 'Bear' }).bull).toBe('')
  })

  it('preserves both Bull trigger branches', () => {
    expect(evaluateSignalSet(
      config('SOXL'),
      { pctFall: -0.11, pctRise: 0.024, rsi: 4.9, pyImpact: '' },
      bullRegimes
    ).bull).toBe('B')

    expect(evaluateSignalSet(
      config('SOXL'),
      { pctFall: -0.16, pctRise: 0.024, rsi: 49.9, pyImpact: '' },
      bullRegimes
    ).bull).toBe('B')

    expect(evaluateSignalSet(
      config('SOXL'),
      { pctFall: -0.16, pctRise: 0.025, rsi: 49.9, pyImpact: '' },
      bullRegimes
    ).bull).toBe('')
  })
})

describe('ST Model workbook parity: presidential-cycle rules', () => {
  it('matches the ticker-sheet PY impact boundaries', () => {
    expect(presidentialImpact('2026-09-30')).toBe('PY_Danger')
    expect(presidentialImpact('2026-10-01')).toBe('PY_Thrust')
    expect(presidentialImpact('2027-07-31')).toBe('PY_Thrust')
    expect(presidentialImpact('2027-08-01')).toBe('')
    expect(presidentialImpact('2028-01-02')).toBe('')
  })
})

function dailyBars(count: number, start = 100, step = 1): STDailyBar[] {
  const startDate = new Date('2025-01-02T00:00:00Z')
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate)
    date.setUTCDate(date.getUTCDate() + index)
    const close = start + index * step
    return {
      date: date.toISOString().slice(0, 10),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
    }
  })
}

describe('ST Model workbook parity: regime engines', () => {
  it('uses a 180-observation SMA and a six-row slope lag', () => {
    const points = computeSmaRegime(dailyBars(190))
    expect(points[184].signal).toBe('Unavailable')
    expect(points[185].signal).toBe('Bull')
  })

  it('uses the legacy NH/NL 9-day 1..9 weighted average and carries neutral state', () => {
    const positive = Array.from({ length: 9 }, (_, index) => ({
      date: `2024-01-${String(index + 1).padStart(2, '0')}`,
      newHighs: 20,
      newLows: 5,
    }))
    const initial = computeLegacyNhnlRegime(positive)
    expect(initial.at(-1)?.signal).toBe('Bull')

    const neutral = [
      ...positive,
      { date: '2024-01-10', newHighs: 10, newLows: 10 },
    ]
    expect(computeLegacyNhnlRegime(neutral).at(-1)?.signal).toBe('Bull')

    const negative = Array.from({ length: 9 }, (_, index) => ({
      date: `2024-02-${String(index + 1).padStart(2, '0')}`,
      newHighs: 0,
      newLows: 20,
    }))
    expect(computeLegacyNhnlRegime(negative).at(-1)?.signal).toBe('Bear')
  })

  it('DBE begins Bull when all ten 110-session rolling-high states initialize to 1', () => {
    const symbols = ['SPY', 'ITOT', 'QQQ', 'SOXX', 'VTI', 'IXF', 'IWB', 'NYA', 'IWV', 'USFR']
    const source = dailyBars(120)
    const input = Object.fromEntries(symbols.map((symbol) => [symbol, source]))
    const points = computeDbeRegime(input)
    expect(points[108].signal).toBe('Unavailable')
    expect(points[109].signal).toBe('Bull')
    expect(points.at(-1)?.signal).toBe('Bull')
  })

  it('DBE stays Bull at exactly 10% bearish and turns Bear only above 10%', () => {
    const symbols = ['SPY', 'ITOT', 'QQQ', 'SOXX', 'VTI', 'IXF', 'IWB', 'NYA', 'IWV', 'USFR']
    const rising = dailyBars(111)
    const dropping = rising.map((bar, index) => ({ ...bar, close: index === 0 ? 200 : 100, open: index === 0 ? 200 : 100, high: index === 0 ? 201 : 101, low: index === 0 ? 199 : 99 }))

    const oneBearish = Object.fromEntries(symbols.map((symbol, index) => [symbol, index === 0 ? dropping : rising]))
    expect(computeDbeRegime(oneBearish).at(-1)?.signal).toBe('Bull')

    const twoBearish = Object.fromEntries(symbols.map((symbol, index) => [symbol, index < 2 ? dropping : rising]))
    expect(computeDbeRegime(twoBearish).at(-1)?.signal).toBe('Bear')
  })
})
