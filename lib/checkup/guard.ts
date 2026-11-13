// =============================================================================
// Spreadsheet check-up - limits
//
// The app has no login and the page is open to anyone with the link. Checking a
// workbook is cheap; repairing one is an agent run that costs real money and
// takes minutes. So uploads are rate-limited per address, repairs have a daily
// cap across everyone and a hard spend ceiling each (lib/checkup/repair/job.ts),
// and the cheaper write-up used when no repair can run has an hourly cap.
// =============================================================================

import { checkRateLimit, type RateLimitConfig } from '@/lib/rate-limit'

/** Six uploads per half hour per address. Each one may start a paid repair. */
export const CHECKUP_RATE_LIMIT: RateLimitConfig = {
  windowMs: 30 * 60 * 1000,
  maxRequests: 6,
}

/** Progress checks and downloads: frequent and cheap, but not unlimited. */
export const CHECKUP_POLL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 60 * 1000,
  maxRequests: 400,
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
