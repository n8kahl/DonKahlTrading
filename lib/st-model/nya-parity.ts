export interface NyaCloseRow {
  date: string
  close: number
}

export interface NyaParityMismatch {
  date: string
  expected: number
  actual: number | null
  delta: number | null
}

export interface NyaParityResult {
  total: number
  exactMatches: number
  missingDates: number
  maxAbsDelta: number
  totalAbsDelta: number
  accepted: boolean
  mismatches: NyaParityMismatch[]
}

export interface NyaDbeStateMismatch {
  date: string
  expectedState: number | null
  actualState: number | null
}

export interface NyaDbeStateParityResult {
  totalEvaluable: number
  stateMatches: number
  missingDates: number
  accepted: boolean
  mismatches: NyaDbeStateMismatch[]
}

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100)
}

/**
 * Raw-data parity is intentionally strict. This tells us whether a candidate
 * provider reproduces the repaired reference closes to market-cent precision;
 * it is evidence, not by itself the DBE behavioral acceptance criterion.
 */
export function compareNyaProvider(reference: NyaCloseRow[], candidate: NyaCloseRow[]): NyaParityResult {
  const candidateByDate = new Map(candidate.map((row) => [row.date, row.close]))
  const mismatches: NyaParityMismatch[] = []
  let exactMatches = 0
  let missingDates = 0
  let maxAbsDelta = 0
  let totalAbsDelta = 0

  for (const row of reference) {
    const actual = candidateByDate.get(row.date)
    if (actual == null || !Number.isFinite(actual)) {
      missingDates += 1
      mismatches.push({ date: row.date, expected: row.close, actual: null, delta: null })
      continue
    }

    const expectedCents = cents(row.close)
    const actualCents = cents(actual)
    if (expectedCents === actualCents) {
      exactMatches += 1
      continue
    }

    const delta = (actualCents - expectedCents) / 100
    const absDelta = Math.abs(delta)
    maxAbsDelta = Math.max(maxAbsDelta, absDelta)
    totalAbsDelta += absDelta
    mismatches.push({ date: row.date, expected: row.close, actual, delta })
  }

  return {
    total: reference.length,
    exactMatches,
    missingDates,
    maxAbsDelta,
    totalAbsDelta,
    accepted: reference.length > 0 && exactMatches === reference.length,
    mismatches,
  }
}

/**
 * DBE does not consume the NYA close directly; it consumes whether the rolling
 * high increased, decreased, or stayed unchanged. This reproduces that one-
 * instrument state machine so a vendor with tiny close revisions can be proven
 * behaviorally equivalent (or rejected) without weakening the model.
 */
export function computeNyaDbeStates(rows: NyaCloseRow[], window = 110): Array<number | null> {
  if (!Number.isInteger(window) || window < 1) throw new Error('DBE state window must be a positive integer')
  const output: Array<number | null> = Array(rows.length).fill(null)
  let priorRollingHigh: number | null = null
  let priorState: number | null = null

  for (let index = window - 1; index < rows.length; index++) {
    const rollingHigh = Math.max(...rows.slice(index - window + 1, index + 1).map((row) => row.close))
    if (priorRollingHigh == null) priorState = 1
    else if (rollingHigh > priorRollingHigh) priorState = 1
    else if (rollingHigh < priorRollingHigh) priorState = 0
    output[index] = priorState
    priorRollingHigh = rollingHigh
  }

  return output
}

/**
 * A non-Refinitiv NYA provider may be considered model-compatible only if it
 * has every reference date and reproduces the NYA DBE state on every evaluable
 * date. Raw close mismatches remain disclosed separately.
 */
export function compareNyaDbeState(
  reference: NyaCloseRow[],
  candidate: NyaCloseRow[],
  window = 110
): NyaDbeStateParityResult {
  const candidateByDate = new Map(candidate.map((row) => [row.date, row.close]))
  const alignedCandidate: NyaCloseRow[] = []
  let missingDates = 0

  for (const row of reference) {
    const close = candidateByDate.get(row.date)
    if (close == null || !Number.isFinite(close)) {
      missingDates += 1
      // Preserve positional alignment; NaN guarantees the missing-data branch
      // below rejects the candidate before state comparison can pass.
      alignedCandidate.push({ date: row.date, close: Number.NaN })
    } else {
      alignedCandidate.push({ date: row.date, close })
    }
  }

  if (missingDates > 0 || reference.length < window) {
    return {
      totalEvaluable: Math.max(0, reference.length - window + 1),
      stateMatches: 0,
      missingDates,
      accepted: false,
      mismatches: missingDates
        ? reference.filter((row) => !candidateByDate.has(row.date)).map((row) => ({ date: row.date, expectedState: null, actualState: null }))
        : [],
    }
  }

  const expected = computeNyaDbeStates(reference, window)
  const actual = computeNyaDbeStates(alignedCandidate, window)
  const mismatches: NyaDbeStateMismatch[] = []
  let stateMatches = 0
  let totalEvaluable = 0

  for (let index = window - 1; index < reference.length; index++) {
    totalEvaluable += 1
    if (expected[index] === actual[index]) stateMatches += 1
    else mismatches.push({
      date: reference[index].date,
      expectedState: expected[index],
      actualState: actual[index],
    })
  }

  return {
    totalEvaluable,
    stateMatches,
    missingDates: 0,
    accepted: totalEvaluable > 0 && stateMatches === totalEvaluable,
    mismatches,
  }
}
