import { computeLegacyNhnlRegime } from './regimes'
import type { STRegimePoint } from './types'

export interface BreadthCountRow {
  date: string
  newHighs: number
  newLows: number
}

export interface BreadthHistoryAssessment {
  rows: BreadthCountRow[]
  regime: STRegimePoint[]
  throughDate: string | null
  contiguousSessions: number
  requiredSessions: number
  ready: boolean
  missingRequiredDates: string[]
}

export const NHNL_REQUIRED_SESSIONS = 9

/**
 * Use only a contiguous suffix of completed market sessions. A missed snapshot
 * resets the warm-up window so a stale/gapped series can never masquerade as
 * Don's nine-session weighted NH/NL regime.
 */
export function assessBreadthHistory(
  rows: BreadthCountRow[],
  completedSessionDates: string[],
  throughDate: string | null,
  requiredSessions = NHNL_REQUIRED_SESSIONS
): BreadthHistoryAssessment {
  const sessions = [...new Set(completedSessionDates)].sort()
  const targetIndex = throughDate ? sessions.indexOf(throughDate) : -1
  const rowByDate = new Map(rows.map((row) => [row.date, row]))

  if (targetIndex < 0) {
    return {
      rows: [],
      regime: [],
      throughDate,
      contiguousSessions: 0,
      requiredSessions,
      ready: false,
      missingRequiredDates: [],
    }
  }

  const suffix: BreadthCountRow[] = []
  for (let index = targetIndex; index >= 0; index--) {
    const row = rowByDate.get(sessions[index])
    if (!row) break
    suffix.push(row)
  }
  suffix.reverse()

  const requiredDates = sessions.slice(Math.max(0, targetIndex - requiredSessions + 1), targetIndex + 1)
  const missingRequiredDates = requiredDates.filter((date) => !rowByDate.has(date))
  const enoughSessions = suffix.length >= requiredSessions
  const regime = enoughSessions ? computeLegacyNhnlRegime(suffix) : []
  const latestSignal = regime.at(-1)?.signal
  const ready = enoughSessions && latestSignal != null && latestSignal !== 'Unavailable'

  return {
    rows: suffix,
    regime,
    throughDate,
    contiguousSessions: suffix.length,
    requiredSessions,
    ready,
    missingRequiredDates,
  }
}
