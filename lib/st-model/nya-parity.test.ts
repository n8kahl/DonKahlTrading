import { describe, expect, it } from 'vitest'
import { compareNyaProvider } from './nya-parity'

const reference = [
  { date: '2026-09-02', close: 24495.55 },
  { date: '2026-09-03', close: 24720.15 },
  { date: '2026-09-14', close: 24205.39 },
]

describe('NYA provider parity gate', () => {
  it('accepts only a complete cent-exact series', () => {
    const result = compareNyaProvider(reference, reference)
    expect(result.accepted).toBe(true)
    expect(result.exactMatches).toBe(3)
    expect(result.mismatches).toEqual([])
  })

  it('rejects a provider that is only a few cents different', () => {
    const result = compareNyaProvider(reference, [
      { date: '2026-09-02', close: 24495.59 },
      { date: '2026-09-03', close: 24720.15 },
      { date: '2026-09-14', close: 24205.39 },
    ])
    expect(result.accepted).toBe(false)
    expect(result.exactMatches).toBe(2)
    expect(result.maxAbsDelta).toBeCloseTo(0.04, 10)
    expect(result.mismatches[0]).toMatchObject({ date: '2026-09-02', delta: 0.04 })
  })

  it('rejects missing dates rather than silently carrying another close', () => {
    const result = compareNyaProvider(reference, reference.slice(1))
    expect(result.accepted).toBe(false)
    expect(result.missingDates).toBe(1)
    expect(result.mismatches[0]).toEqual({
      date: '2026-09-02', expected: 24495.55, actual: null, delta: null,
    })
  })
})
