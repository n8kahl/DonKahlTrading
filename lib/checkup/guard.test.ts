import { describe, expect, it } from 'vitest'
import { checkPasscode } from './guard'

describe('passcode', () => {
  it('fails closed when no passcode is configured', () => {
    expect(checkPasscode('anything', undefined)).toBe('not-configured')
    expect(checkPasscode('anything', '  ')).toBe('not-configured')
  })
  it('accepts only the configured passcode', () => {
    expect(checkPasscode('tucson', 'tucson')).toBe('ok')
    expect(checkPasscode(' tucson ', 'tucson')).toBe('ok')
    expect(checkPasscode('Tucson', 'tucson')).toBe('wrong')
    expect(checkPasscode('', 'tucson')).toBe('wrong')
    expect(checkPasscode(null, 'tucson')).toBe('wrong')
  })
})
