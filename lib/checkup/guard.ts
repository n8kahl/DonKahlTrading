// =============================================================================
// Spreadsheet check-up - passcode guard
//
// The app has no login and each check-up costs an AI call, so the upload route
// needs the shared passcode from the CHECKUP_PASSCODE environment variable.
// =============================================================================

import { createHash, timingSafeEqual } from 'node:crypto'
import type { RateLimitConfig } from '@/lib/rate-limit'

export const PASSCODE_ENV = 'CHECKUP_PASSCODE'
export const PASSCODE_HEADER = 'x-checkup-passcode'

/** Ten tries per ten minutes per address, counting wrong passcodes too. */
export const CHECKUP_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
}

export type PasscodeCheck = 'ok' | 'wrong' | 'not-configured'

export function checkPasscode(supplied: string | null | undefined, expected = process.env[PASSCODE_ENV]): PasscodeCheck {
  if (!expected || expected.trim() === '') return 'not-configured'
  if (!supplied) return 'wrong'
  // Compare digests so the comparison takes the same time whatever was typed.
  const a = createHash('sha256').update(supplied.trim()).digest()
  const b = createHash('sha256').update(expected.trim()).digest()
  return timingSafeEqual(a, b) ? 'ok' : 'wrong'
}
