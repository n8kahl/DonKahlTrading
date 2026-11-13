// =============================================================================
// Spreadsheet check-up - the repair report
//
// The agent writes report.json next to the fixed workbook. It is read leniently:
// a missing or odd field never hides the fixed file, it just shows less.
// =============================================================================

import { z } from 'zod'

const text = (max: number) =>
  z
    .string()
    .transform((s) => s.trim().slice(0, max))
    .catch('')

export const BASIS_LABELS = {
  author: 'Following the author’s rules you added',
  notes: 'Following the workbook’s own notes',
  colours: 'Following what the colour rules show was intended',
  majority: 'Matching the rest of the column',
  practice: 'What an experienced trader would do',
  error: 'A plain slip',
} as const

export type Basis = keyof typeof BASIS_LABELS

export const repairReportSchema = z.object({
  /** Three sentences on what the spreadsheet does. */
  summary: text(900),
  /** One or two sentences answering what the owner said was wrong, or '' when nothing was said. */
  answer: text(600),
  /** What was wrong, in plain words. */
  wrong: z
    .array(z.object({ title: text(160), explanation: text(700), where: text(160) }))
    .max(40)
    .catch([]),
  /** What was changed and why. */
  changes: z
    .array(
      z.object({
        title: text(160),
        what: text(600),
        why: text(600),
        basis: z.enum(['author', 'notes', 'colours', 'majority', 'practice', 'error']).catch('error'),
        where: text(160),
        cells: z.number().int().nonnegative().catch(0),
      })
    )
    .max(40)
    .catch([]),
  /** The effect on the numbers the owner reads. */
  effect: z
    .object({
      cellsChanged: z.number().int().nonnegative().catch(0),
      /** Rows (days) on which the workbook's headline result changes, when it has one. */
      daysChanged: z.number().int().nonnegative().nullable().catch(null),
      /** What the headline result is called, e.g. "Recovery signal". */
      headline: text(120),
      latestDate: text(40),
      latestBefore: text(120),
      latestAfter: text(120),
      plain: text(700),
    })
    .catch({ cellsChanged: 0, daysChanged: null, headline: '', latestDate: '', latestBefore: '', latestAfter: '', plain: '' }),
  /** Things noticed and deliberately left alone. */
  notChanged: z
    .array(z.object({ title: text(160), reason: text(500) }))
    .max(20)
    .catch([]),
  /** How the result was verified without Excel. */
  verification: z
    .object({
      plain: text(700),
      valuesChecked: z.number().int().nonnegative().catch(0),
      valuesMatched: z.number().int().nonnegative().catch(0),
    })
    .catch({ plain: '', valuesChecked: 0, valuesMatched: 0 }),
  notesTabUpdated: z.boolean().catch(false),
})

export type RepairReport = z.infer<typeof repairReportSchema>

/** Parse report.json; null when it is not JSON at all. */
export function parseRepairReport(raw: string): RepairReport | null {
  try {
    const result = repairReportSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
