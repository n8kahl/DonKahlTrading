import type { STDailyBar } from './types'

export interface NhnlCount {
  date: string
  newHighs: number
  newLows: number
}

export interface NhnlCandidateOptions {
  lookback?: number
  basis?: 'intraday' | 'close'
  minObservations?: number
}

/**
 * Research-only reconstruction of a daily new-high/new-low count from a set of
 * ticker histories. This function is not used by the live ST Model. Candidate
 * methodologies must first reproduce the workbook golden fixture exactly.
 */
export function reconstructNhnlCount(
  histories: Record<string, STDailyBar[]>,
  date: string,
  options: NhnlCandidateOptions = {}
): NhnlCount {
  const lookback = options.lookback ?? 252
  const basis = options.basis ?? 'intraday'
  const minObservations = options.minObservations ?? 1

  let newHighs = 0
  let newLows = 0

  for (const bars of Object.values(histories)) {
    const index = bars.findIndex((bar) => bar.date === date)
    if (index < 0) continue

    const start = Math.max(0, index - lookback + 1)
    const window = bars.slice(start, index + 1)
    if (window.length < minObservations) continue

    const current = bars[index]
    if (basis === 'intraday') {
      const rollingHigh = Math.max(...window.map((bar) => bar.high))
      const rollingLow = Math.min(...window.map((bar) => bar.low))
      if (current.high >= rollingHigh) newHighs++
      if (current.low <= rollingLow) newLows++
    } else {
      const rollingHigh = Math.max(...window.map((bar) => bar.close))
      const rollingLow = Math.min(...window.map((bar) => bar.close))
      if (current.close >= rollingHigh) newHighs++
      if (current.close <= rollingLow) newLows++
    }
  }

  return { date, newHighs, newLows }
}

export interface NhnlParityRow extends NhnlCount {
  actualNewHighs: number | null
  actualNewLows: number | null
  highDelta: number | null
  lowDelta: number | null
  exact: boolean
}

export function compareNhnlParity(expected: NhnlCount[], actual: NhnlCount[]): {
  exactMatches: number
  total: number
  allExact: boolean
  rows: NhnlParityRow[]
} {
  const actualByDate = new Map(actual.map((row) => [row.date, row]))
  const rows = expected.map((row): NhnlParityRow => {
    const candidate = actualByDate.get(row.date)
    if (!candidate) {
      return {
        ...row,
        actualNewHighs: null,
        actualNewLows: null,
        highDelta: null,
        lowDelta: null,
        exact: false,
      }
    }

    const highDelta = candidate.newHighs - row.newHighs
    const lowDelta = candidate.newLows - row.newLows
    return {
      ...row,
      actualNewHighs: candidate.newHighs,
      actualNewLows: candidate.newLows,
      highDelta,
      lowDelta,
      exact: highDelta === 0 && lowDelta === 0,
    }
  })

  const exactMatches = rows.filter((row) => row.exact).length
  return {
    exactMatches,
    total: rows.length,
    allExact: exactMatches === rows.length,
    rows,
  }
}
