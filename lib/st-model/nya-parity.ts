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

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100)
}

/**
 * Provider acceptance for Dad's DBE NYA input is deliberately strict: every
 * fixture date must be present and its close must match the repaired reference
 * at two-decimal market precision. A close provider is not an exact provider.
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
