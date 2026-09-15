import { describe, expect, it } from 'vitest'
import { assessBreadthHistory } from './breadth-history'

const sessions = [
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
  '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14',
]

function rows(dates = sessions, highs = 100, lows = 10) {
  return dates.map((date) => ({ date, newHighs: highs, newLows: lows }))
}

describe('NHNL breadth history gate', () => {
  it('becomes ready only after nine contiguous completed market sessions', () => {
    const eight = assessBreadthHistory(rows(sessions.slice(0, 8)), sessions, '2026-09-11')
    expect(eight.ready).toBe(false)
    expect(eight.contiguousSessions).toBe(8)

    const nine = assessBreadthHistory(rows(), sessions, '2026-09-14')
    expect(nine.ready).toBe(true)
    expect(nine.regime.at(-1)?.signal).toBe('Bull')
  })

  it('treats weekends and holidays as non-sessions rather than gaps', () => {
    const assessment = assessBreadthHistory(rows(), sessions, '2026-09-14')
    expect(assessment.missingRequiredDates).toEqual([])
    expect(assessment.contiguousSessions).toBe(9)
  })

  it('resets the contiguous suffix when one required trading session is missing', () => {
    const missingSep9 = rows(sessions.filter((date) => date !== '2026-09-09'))
    const assessment = assessBreadthHistory(missingSep9, sessions, '2026-09-14')
    expect(assessment.ready).toBe(false)
    expect(assessment.contiguousSessions).toBe(4)
    expect(assessment.missingRequiredDates).toEqual(['2026-09-09'])
  })

  it('stays unavailable if the nine-session WMA is neutral and there is no prior state to carry', () => {
    const neutral = rows(sessions, 10, 10)
    const assessment = assessBreadthHistory(neutral, sessions, '2026-09-14')
    expect(assessment.regime.at(-1)?.signal).toBe('Unavailable')
    expect(assessment.ready).toBe(false)
  })

  it('fails closed when breadth through-date is not a completed price session', () => {
    const assessment = assessBreadthHistory(rows(), sessions, '2026-09-15')
    expect(assessment.ready).toBe(false)
    expect(assessment.contiguousSessions).toBe(0)
  })
})
