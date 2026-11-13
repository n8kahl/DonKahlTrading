import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AI_PER_HOUR, takeAiWriteUp } from './guard'

describe('hourly allowance of AI write-ups', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('allows the configured number per hour, then stops', () => {
    const taken: boolean[] = []
    for (let i = 0; i < DEFAULT_AI_PER_HOUR + 2; i++) taken.push(takeAiWriteUp())
    expect(taken.filter(Boolean)).toHaveLength(DEFAULT_AI_PER_HOUR)
    expect(taken.slice(-2)).toEqual([false, false])
  })

  it('can be switched off', () => {
    vi.stubEnv('CHECKUP_AI_PER_HOUR', '0')
    expect(takeAiWriteUp()).toBe(false)
  })
})
