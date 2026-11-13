// =============================================================================
// Spreadsheet check-up - limits
//
// The app has no login and the page is open to anyone with the link. Checking a
// workbook is cheap; the plain-language write-up is an AI call that costs money.
// So uploads are rate-limited per address, and the write-up has an hourly cap
// across everyone. Past the cap, findings are still shown with built-in wording.
// =============================================================================

import { checkRateLimit, type RateLimitConfig } from '@/lib/rate-limit'

/** Ten uploads per ten minutes per address. */
export const CHECKUP_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
}

/** AI write-ups per hour across all visitors. Override with CHECKUP_AI_PER_HOUR. */
export const DEFAULT_AI_PER_HOUR = 10

function aiPerHour(): number {
  const n = Number(process.env.CHECKUP_AI_PER_HOUR)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_AI_PER_HOUR
}

/** Take one write-up from this hour's allowance. False when it is used up. */
export function takeAiWriteUp(): boolean {
  const max = aiPerHour()
  if (max === 0) return false
  return checkRateLimit('checkup:ai-write-up', { windowMs: 60 * 60 * 1000, maxRequests: max }).allowed
}
