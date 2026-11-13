// =============================================================================
// Spreadsheet check-up - independent after-check
//
// The repair agent reports on its own work; this does not take its word for it.
// The same deterministic checks that produced the first-pass findings are run
// again on the repaired file, and every part of the workbook is compared with
// the original.
// =============================================================================

import type { Analysis } from '../analyze'
import { analyzeWorkbook } from '../analyze'
import { compareParts, type PartComparison, type PartFingerprint } from '../parts'
import type { Finding } from '../types'
import { rowsText } from '../wording'
import { readWorkbook } from '../xlsx'

export interface FindingStub {
  /** kind | tab | column letters: the same fault before and after has the same key. */
  key: string
  kind: Finding['kind']
  title: string
  where: string
}

export interface BeforeSnapshot {
  findings: FindingStub[]
  parts: PartFingerprint[]
}

export interface AfterCheck {
  /** The repaired file opens and can be read. */
  opened: boolean
  flaggedBefore: number
  resolved: number
  /** Flagged before and still flagged. */
  remaining: FindingStub[]
  /** Not flagged before, flagged now. */
  fresh: FindingStub[]
  parts: PartComparison | null
  /** pass: nothing to add. notes: usable, with things to mention. fail: do not hand this file out. */
  verdict: 'pass' | 'notes' | 'fail'
  /** Plain sentences for the page. */
  lines: string[]
}

export function stubOf(f: Finding): FindingStub {
  const letters = f.columns.map((c) => c.letter)
  return {
    key: `${f.kind}|${f.sheet}|${letters.join(',')}`,
    kind: f.kind,
    title: f.title,
    where: `${f.sheet}, ${letters.length === 1 ? 'column' : 'columns'} ${letters.join(', ')}, ${rowsText(f.rows)}`,
  }
}

export function snapshotBefore(analysis: Analysis, parts: PartFingerprint[]): BeforeSnapshot {
  return { findings: [...analysis.problems, ...analysis.questions].map(stubOf), parts }
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function afterCheck(before: BeforeSnapshot, fixedBytes: Uint8Array): AfterCheck {
  let after: Analysis
  let parts: PartComparison
  try {
    after = analyzeWorkbook(readWorkbook(fixedBytes))
    parts = compareParts(before.parts, fixedBytes)
  } catch {
    return {
      opened: false,
      flaggedBefore: before.findings.length,
      resolved: 0,
      remaining: [],
      fresh: [],
      parts: null,
      verdict: 'fail',
      lines: ['The repaired file could not be opened by our own check, so it is not being offered.'],
    }
  }

  const afterStubs = [...after.problems, ...after.questions].map(stubOf)
  const afterKeys = new Set(afterStubs.map((s) => s.key))
  const beforeKeys = new Set(before.findings.map((s) => s.key))
  const remaining = afterStubs.filter((s) => beforeKeys.has(s.key))
  const fresh = afterStubs.filter((s) => !beforeKeys.has(s.key))
  const resolved = before.findings.filter((s) => !afterKeys.has(s.key)).length

  const lines: string[] = []
  if (before.findings.length === 0) {
    lines.push('Our first check had not flagged anything, and it flags nothing in the fixed copy either.')
  } else if (remaining.length === 0) {
    lines.push(`All ${count(before.findings.length, 'thing', 'things')} our first check flagged ${before.findings.length === 1 ? 'is' : 'are'} gone in the fixed copy.`)
  } else {
    lines.push(`${resolved} of the ${count(before.findings.length, 'thing', 'things')} our first check flagged ${resolved === 1 ? 'is' : 'are'} gone in the fixed copy; ${count(remaining.length, 'is', 'are')} still flagged.`)
  }
  if (fresh.length > 0) {
    lines.push(`The fixed copy has ${count(fresh.length, 'thing', 'things')} flagged that the original did not.`)
  } else if (before.findings.length > 0) {
    lines.push('Nothing new is flagged.')
  }

  const expected = parts.totalBefore - (before.parts.some((p) => p.name === 'xl/calcChain.xml') ? 1 : 0)
  if (parts.missing.length > 0) {
    lines.push(`${count(parts.missing.length, 'piece', 'pieces')} of the original workbook ${parts.missing.length === 1 ? 'is' : 'are'} missing from the repaired file (${parts.missing.slice(0, 4).join(', ')}), so it is not being offered.`)
  } else {
    lines.push(`Every one of the original workbook’s ${expected} internal pieces is still there, and ${parts.identical} of them are untouched down to the last byte, including its data tabs and data connections.`)
  }
  const formulasChanged = parts.changed.some((n) => n.startsWith('xl/worksheets/'))
  if (formulasChanged && !parts.fullCalcOnLoad) {
    lines.push('The fixed copy is not set to recalculate when Excel opens it. Press Ctrl+Alt+F9 in Excel after opening it.')
  } else if (formulasChanged) {
    lines.push('It is set to recalculate everything when Excel opens it.')
  }

  let verdict: AfterCheck['verdict'] = 'pass'
  if (parts.missing.length > 0) verdict = 'fail'
  else if (remaining.length > 0 || fresh.length > 0 || (formulasChanged && !parts.fullCalcOnLoad)) verdict = 'notes'

  return { opened: true, flaggedBefore: before.findings.length, resolved, remaining, fresh, parts, verdict, lines }
}
