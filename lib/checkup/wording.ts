// =============================================================================
// Spreadsheet check-up - default plain wording
//
// Every finding gets a title and explanation from here. The AI layer may
// replace them with friendlier text, but these are always good enough to show.
// =============================================================================

import type { ColumnRef, RowRange } from './types'

export function toRanges(rows: number[]): RowRange[] {
  const sorted = [...new Set(rows)].sort((a, b) => a - b)
  const out: RowRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r === last.to + 1) last.to = r
    else out.push({ from: r, to: r })
  }
  return out
}

export function countRows(ranges: RowRange[]): number {
  return ranges.reduce((n, r) => n + (r.to - r.from + 1), 0)
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** "row 13", "rows 14–783", "rows 3 and 440", "rows 14–487 and 521–783". */
export function rowsText(ranges: RowRange[]): string {
  if (ranges.length === 0) return 'no rows'
  const parts = ranges.map((r) => (r.from === r.to ? String(r.from) : `${r.from}–${r.to}`))
  const single = ranges.length === 1 && ranges[0].from === ranges[0].to
  if (parts.length > 3) {
    return `rows ${parts.slice(0, 2).join(', ')} and ${parts.length - 2} more places`
  }
  return `${single ? 'row' : 'rows'} ${joinList(parts)}`
}

function isOneRow(ranges: RowRange[]): boolean {
  return ranges.length === 1 && ranges[0].from === ranges[0].to
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** “NDX100” (column D), or just "column D" when there is no heading. */
export function columnName(c: ColumnRef): string {
  return c.header ? `“${c.header}” (column ${c.letter})` : `column ${c.letter}`
}

export function columnsName(cols: ColumnRef[]): string {
  if (cols.length === 1) return columnName(cols[0])
  return `columns ${joinList(cols.map((c) => c.letter))}`
}

export function lettersList(letters: string[]): string {
  return `${letters.length === 1 ? 'column' : 'columns'} ${joinList(letters)}`
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

const OP_VERBS: Record<string, string> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
}

export const DEPENDS_CAUTION =
  'The right formula for these rows depends on which choice is made for this column (see the choices section).'

export function offsetWording(args: {
  columns: ColumnRef[]
  rows: RowRange[]
  readColumn: string | null
  delta: number | null
  evidence: 'siblings' | 'own-column' | 'neighbours'
  siblingLetters: string[]
  otherRowCount: number
}): { title: string; explanation: string } {
  const who = columnsName(args.columns)
  const n = args.delta === null ? null : Math.abs(args.delta)
  const dir = args.delta !== null && args.delta < 0 ? 'up' : 'down'
  const above = args.delta !== null && args.delta < 0 ? 'above' : 'below'
  const oneRow = isOneRow(args.rows)
  const read = oneRow ? 'reads' : 'read'
  const own = oneRow ? 'its own row' : 'their own row'
  const what =
    n === null || args.readColumn === null
      ? `${read} different rows from the ones the rest of the column reads`
      : `${read} column ${args.readColumn} from ${plural(n, 'row', 'rows')} ${above} instead of ${own}`
  const title =
    n === null
      ? `${capitalise(who)} reads the wrong rows`
      : `${capitalise(who)} reads from ${plural(n, 'row', 'rows')} ${dir}`
  let proof: string
  if (args.evidence === 'siblings') {
    proof = `${capitalise(lettersList(args.siblingLetters))} do the same job and read their own row.`
  } else if (args.evidence === 'own-column') {
    proof = 'The first rows of this column read their own row.'
  } else {
    proof = `The other ${plural(args.otherRowCount, 'row', 'rows')} of this column do not do that.`
  }
  return {
    title,
    explanation: `${capitalise(rowsText(args.rows))} of ${who} ${what}. ${proof} The numbers shown there are probably wrong.`,
  }
}

export function inconsistentWording(args: {
  columns: ColumnRef[]
  rows: RowRange[]
  count: number
  otherCount: number
  siblingLetters: string[]
}): { title: string; explanation: string } {
  const who = columnsName(args.columns)
  const per = args.columns.length > 1 ? ' in each column' : ''
  const sib =
    args.siblingLetters.length > 0
      ? ` ${capitalise(lettersList(args.siblingLetters))}, which do the same job, use one formula all the way down.`
      : ''
  return {
    title: `${capitalise(rowsText(args.rows))} of ${who} ${isOneRow(args.rows) ? 'uses' : 'use'} a different formula`,
    explanation: `${capitalise(plural(args.count, 'cell uses', 'cells use'))} a different formula from the other ${args.otherCount.toLocaleString('en-US')}${per}. A column normally uses one formula all the way down, so ${args.count === 1 ? 'this row' : 'these rows'} may be giving a different answer.${sib}`,
  }
}

export function hardcodedWording(args: { columns: ColumnRef[]; rows: RowRange[] }): { title: string; explanation: string } {
  return {
    title: `Typed-in values in ${columnsName(args.columns)}`,
    explanation: `${capitalise(rowsText(args.rows))} ${isOneRow(args.rows) ? 'holds' : 'hold'} a typed-in value where the rest of the column is worked out by a formula. ${isOneRow(args.rows) ? 'That cell' : 'Those cells'} will not update when the numbers above or beside ${isOneRow(args.rows) ? 'it' : 'them'} change.`,
  }
}

export function emptyWording(args: { columns: ColumnRef[]; rows: RowRange[]; count: number }): { title: string; explanation: string } {
  return {
    title: `${capitalise(plural(args.count, 'blank cell', 'blank cells'))} in ${columnsName(args.columns)}`,
    explanation: `${capitalise(rowsText(args.rows))} ${isOneRow(args.rows) ? 'is' : 'are'} blank, but the rows above and below are worked out by a formula. Anything that depends on ${args.count === 1 ? 'this cell' : 'these cells'} is missing its numbers.`,
  }
}

export function errorWording(args: { columns: ColumnRef[]; rows: RowRange[]; count: number; errors: string[] }): { title: string; explanation: string } {
  return {
    title: `${capitalise(plural(args.count, 'cell shows', 'cells show'))} an error in ${columnsName(args.columns)}`,
    explanation: `${capitalise(rowsText(args.rows))} ${isOneRow(args.rows) ? 'shows' : 'show'} ${joinList(args.errors)} instead of an answer. Excel shows this when a formula cannot work out a result.`,
  }
}

export function formattingWording(args: {
  columns: ColumnRef[]
  covered: RowRange[]
  missing: RowRange[]
  ruleCount: number
}): { title: string; explanation: string } {
  const rules = args.ruleCount === 1 ? 'A rule that colours cells' : `${args.ruleCount} rules that colour cells`
  const verb = args.ruleCount === 1 ? 'covers' : 'cover'
  return {
    title: `Colour rule skips part of ${columnsName(args.columns)}`,
    explanation: `${rules} ${verb} ${rowsText(args.covered)} here but not ${rowsText(args.missing)}, which ${isOneRow(args.missing) ? 'holds' : 'hold'} the same kind of data. ${isOneRow(args.missing) ? 'That row' : 'Those rows'} will not change colour when ${isOneRow(args.missing) ? 'it' : 'they'} should.`,
  }
}

export function mixedWording(args: { columns: ColumnRef[]; counts: number[] }): { title: string; explanation: string } {
  return {
    title: `${capitalise(columnsName(args.columns))} switches between ${args.counts.length} formulas`,
    explanation: `This column uses ${args.counts.length} different formulas (${joinList(args.counts.map((c) => plural(c, 'row', 'rows')))}) and none is clearly the main one. Decide which one is right before anything is changed.`,
  }
}

export function questionWording(args: {
  columns: ColumnRef[]
  rowsA: RowRange[]
  countA: number
  rowsB: RowRange[]
  countB: number
  /** Set when the two formulas differ by exactly one sign: A uses `from`, B uses `to`. */
  operator: { from: string; to: string } | null
}): { title: string; explanation: string; labelA: string; labelB: string } {
  const many = args.columns.length > 1
  const who = columnsName(args.columns)
  if (args.operator) {
    const a = OP_VERBS[args.operator.from]
    const b = OP_VERBS[args.operator.to]
    if (a && b) {
      return {
        title: `Should ${who} ${a} or ${b}?`,
        explanation: `${capitalise(rowsText(args.rowsA))} ${a} (${plural(args.countA, 'cell', 'cells')}) where ${rowsText(args.rowsB)} ${b} (${plural(args.countB, 'cell', 'cells')}), and that is the only difference between the two formulas. One of them is a slip, and the more common one is not always the right one.`,
        labelA: `${capitalise(a)}, as in ${rowsText(args.rowsA)}`,
        labelB: `${capitalise(b)}, as in ${rowsText(args.rowsB)}`,
      }
    }
  }
  return {
    title: `Which formula should ${who} use?`,
    explanation: `${many ? 'These columns use' : 'This column uses'} two different formulas: one in ${rowsText(args.rowsA)} (${plural(args.countA, 'cell', 'cells')}) and another in ${rowsText(args.rowsB)} (${plural(args.countB, 'cell', 'cells')}). Neither is clearly the main one, so one of them has to be chosen for the whole column.`,
    labelA: `The one in ${rowsText(args.rowsA)}`,
    labelB: `The one in ${rowsText(args.rowsB)}`,
  }
}
