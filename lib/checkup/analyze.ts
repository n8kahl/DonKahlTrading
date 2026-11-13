// =============================================================================
// Spreadsheet check-up - the checks
//
// Pure functions over the workbook model. No file access, no network, no AI:
// every finding shown to the user is produced here.
//
//   (a) a few rows use a different formula from an otherwise uniform column
//   (b) blank cells inside a column of formulas
//   (c) a formula that reads a different row from the one its neighbours read
//   (d) cells showing Excel errors
//   (e) colour rules that cover only part of a column
//   (f) a column split between two formulas with no clear majority (a question)
// =============================================================================

import {
  diffOffsets,
  minOffset,
  numToCol,
  patternKey as patternKeyOf,
  relativeOffsets,
  renderFormula,
  shapeKey,
  singleOperatorDiff,
  skeletonKey,
  withOffsets,
  type PTok,
} from './formula'
import type {
  Cell,
  ColumnRef,
  ColumnSummary,
  ExampleCell,
  Finding,
  QuestionOption,
  RowRange,
  Severity,
  SheetModel,
  SheetSummary,
  WorkbookModel,
  WorkbookStructure,
} from './types'
import {
  DEPENDS_CAUTION,
  countRows,
  emptyWording,
  errorWording,
  formattingWording,
  hardcodedWording,
  inconsistentWording,
  mixedWording,
  offsetWording,
  questionWording,
  toRanges,
} from './wording'

// A column is treated as "a column of formulas" from this many formula cells up,
// and only when formulas fill at least half of the stretch they span.
const MIN_FORMULAS = 4
const MIN_FORMULA_DENSITY = 0.5
// One formula is "clearly the main one" from this share of the column.
const CLEAR_MAJORITY = 0.75
// Below this share the second formula is a stray, not a rival.
const RIVAL_SHARE = 0.2
// How many look-alike columns must agree before they overrule a column.
const MIN_AGREEING_SIBLINGS = 2

interface Group {
  key: string
  toks: PTok[]
  rows: number[]
}

interface Family {
  shape: string
  groups: Group[]
  count: number
  /** The pattern this family should use on every row. */
  canon: PTok[]
  canonKey: string
  skeleton: string
  /** False when the family is a set of one-off variations with no common pattern. */
  hasCanon: boolean
  /** Why canon differs from what most rows hold, when it does. */
  corrected: null | { evidence: 'siblings' | 'own-column'; siblings: string[] }
  rows: number[]
}

interface ColumnInfo {
  col: number
  ref: ColumnRef
  cells: Map<number, Cell>
  first: number
  last: number
  total: number
  families: Family[]
  /** Family every row should follow, once known. */
  main: Family | null
}

interface Draft {
  kind: Finding['kind']
  severity: Severity
  col: ColumnInfo | { ref: ColumnRef; cells: Map<number, Cell> }
  rows: number[]
  before: PTok[] | null
  suggested: PTok[] | null
  mergeKey: string
  build: (columns: ColumnRef[], rows: RowRange[], count: number) => { title: string; explanation: string }
  caution: string | null
  dependsOnKey: string | null
  detail: Record<string, string | number | boolean | null>
}

interface QuestionDraft {
  key: string
  a: { skeleton: string; toks: PTok[] }
  b: { skeleton: string; toks: PTok[] }
  members: { col: ColumnInfo; rowsA: number[]; rowsB: number[] }[]
}

function cellAddress(col: number, row: number): string {
  return `${numToCol(col)}${row}`
}

/** First row made only of text cells, if the sheet starts with one. */
export function detectHeaderRow(sheet: SheetModel): number | null {
  const limit = Math.min(sheet.maxRow, 15)
  for (let r = 1; r <= limit; r++) {
    const cells: Cell[] = []
    for (const column of sheet.columns.values()) {
      const c = column.get(r)
      if (c) cells.push(c)
    }
    if (cells.length < 2) continue
    return cells.every((c) => c.kind === 'value' && c.type === 's') ? r : null
  }
  return null
}

function buildFamilies(cells: Map<number, Cell>, headerRow: number): Family[] {
  const groups = new Map<string, Group>()
  for (const cell of cells.values()) {
    if (cell.kind !== 'formula' || cell.row <= headerRow || !cell.toks || cell.pkey === undefined) continue
    let g = groups.get(cell.pkey)
    if (!g) {
      g = { key: cell.pkey, toks: cell.toks, rows: [] }
      groups.set(cell.pkey, g)
    }
    g.rows.push(cell.row)
  }

  const families = new Map<string, Family>()
  for (const g of groups.values()) {
    const shape = shapeKey(g.toks)
    let f = families.get(shape)
    if (!f) {
      f = { shape, groups: [], count: 0, canon: g.toks, canonKey: g.key, skeleton: '', hasCanon: false, corrected: null, rows: [] }
      families.set(shape, f)
    }
    f.groups.push(g)
    f.count += g.rows.length
    f.rows.push(...g.rows)
  }

  for (const f of families.values()) {
    f.groups.sort((x, y) => y.rows.length - x.rows.length || x.rows[0] - y.rows[0])
    const top = f.groups[0]
    f.canon = top.toks
    f.canonKey = top.key
    f.skeleton = skeletonKey(top.toks)
    f.hasCanon = f.groups.length === 1 || top.rows.length >= CLEAR_MAJORITY * f.count
    f.rows.sort((a, b) => a - b)
  }

  return [...families.values()].sort((x, y) => y.count - x.count || x.rows[0] - y.rows[0])
}

/**
 * (c) across columns: when several columns do the same job (same skeleton) and all
 * but one read the same rows, the odd one out is reading the wrong rows.
 */
function correctFromSiblings(columns: ColumnInfo[]): void {
  const bySkeleton = new Map<string, { col: ColumnInfo; family: Family; sig: string }[]>()
  for (const col of columns) {
    const f = col.families[0]
    if (!f || !f.hasCanon || f.count < CLEAR_MAJORITY * col.total) continue
    const sig = relativeOffsets(f.canon).join(',')
    const list = bySkeleton.get(f.skeleton) ?? []
    list.push({ col, family: f, sig })
    bySkeleton.set(f.skeleton, list)
  }
  for (const members of bySkeleton.values()) {
    if (members.length < MIN_AGREEING_SIBLINGS + 1) continue
    const tally = new Map<string, number>()
    for (const m of members) tally.set(m.sig, (tally.get(m.sig) ?? 0) + 1)
    const [topSig, topCount] = [...tally.entries()].sort((x, y) => y[1] - x[1])[0]
    if (topCount < MIN_AGREEING_SIBLINGS || topCount <= members.length / 2) continue
    const offsets = topSig === '' ? [] : topSig.split(',').map(Number)
    const agreeing = members.filter((m) => m.sig === topSig).map((m) => m.col.ref.letter)
    for (const m of members) {
      if (m.sig === topSig) continue
      const canon = withOffsets(m.family.canon, offsets)
      m.family.canon = canon
      m.family.canonKey = patternKeyOf(canon)
      m.family.corrected = { evidence: 'siblings', siblings: agreeing }
    }
  }
}

/**
 * (c) within one column: the main formula reads some column only from a fixed
 * distance away, while another formula in the same column reads that column on
 * its own row. The fixed distance is almost certainly a slip.
 */
function correctFromOwnColumn(col: ColumnInfo): void {
  const f = col.families[0]
  if (!f || !f.hasCanon || f.corrected) return
  const readsOf = (toks: PTok[]) => {
    const m = new Map<number, Set<number>>()
    for (const t of toks) {
      if (t.t === 'ref' && !t.rowAbs && t.sheet === '') {
        const s = m.get(t.col) ?? new Set<number>()
        s.add(t.row)
        m.set(t.col, s)
      }
    }
    return m
  }
  const mine = readsOf(f.canon)
  for (const [target, offs] of mine) {
    if (target === col.col || offs.size !== 1) continue
    const [k] = [...offs]
    if (k === 0) continue
    const witness = col.families.slice(1).find((other) => {
      if (other.count < 3) return false
      const theirs = readsOf(other.canon).get(target)
      return theirs !== undefined && theirs.size === 1 && theirs.has(0)
    })
    if (!witness) continue
    const canon = f.canon.map((t) => (t.t === 'ref' && !t.rowAbs && t.sheet === '' && t.col === target ? { ...t, row: 0 } : t))
    f.canon = canon
    f.canonKey = patternKeyOf(canon)
    f.corrected = { evidence: 'own-column', siblings: [] }
    return
  }
}

function pickExamples(
  cells: Map<number, Cell>,
  col: number,
  rows: number[],
  suggested: PTok[] | null,
  max: number
): ExampleCell[] {
  if (rows.length === 0 || max <= 0) return []
  const withValue = rows.filter((r) => cells.get(r)?.display != null)
  const pool = withValue.length > 0 ? withValue : rows
  const picks = [...new Set([pool[0], pool[Math.floor(pool.length / 2)], pool[pool.length - 1]])].slice(0, max)
  return picks.map((r) => {
    const cell = cells.get(r)
    return {
      cell: cellAddress(col, r),
      value: cell?.display ?? null,
      formula: cell?.kind === 'formula' && cell.toks ? `=${renderFormula(cell.toks, r)}` : null,
      suggested: suggested ? `=${renderFormula(suggested, r)}` : null,
    }
  })
}

function analyzeSheet(sheet: SheetModel): { findings: Finding[]; questions: Finding[]; summary: SheetSummary } {
  const headerRow = detectHeaderRow(sheet) ?? 0
  const firstDataRow = headerRow + 1
  const headerOf = (col: number): string | null => {
    if (headerRow === 0) return null
    const h = sheet.columns.get(col)?.get(headerRow)?.display ?? null
    return h ? h.trim().slice(0, 80) : null
  }
  const refOf = (col: number): ColumnRef => ({ letter: numToCol(col), header: headerOf(col) })

  // ---------------------------------------------------------------------------
  // Pass 1: describe every column of formulas
  // ---------------------------------------------------------------------------
  const formulaCols: ColumnInfo[] = []
  const sortedCols = [...sheet.columns.keys()].sort((a, b) => a - b)
  for (const colNum of sortedCols) {
    const cells = sheet.columns.get(colNum)!
    const families = buildFamilies(cells, headerRow)
    const total = families.reduce((n, f) => n + f.count, 0)
    if (total < MIN_FORMULAS) continue
    let first = Infinity
    let last = 0
    for (const f of families) {
      first = Math.min(first, f.rows[0])
      last = Math.max(last, f.rows[f.rows.length - 1])
    }
    if (total / (last - first + 1) < MIN_FORMULA_DENSITY) continue
    formulaCols.push({ col: colNum, ref: refOf(colNum), cells, first, last, total, families, main: null })
  }

  correctFromSiblings(formulaCols)
  for (const col of formulaCols) correctFromOwnColumn(col)

  // Columns that use one formula all the way down, by what that formula does.
  const uniformBySkeleton = new Map<string, string[]>()
  for (const col of formulaCols) {
    const f = col.families[0]
    if (f.count >= CLEAR_MAJORITY * col.total) {
      const list = uniformBySkeleton.get(f.skeleton) ?? []
      list.push(col.ref.letter)
      uniformBySkeleton.set(f.skeleton, list)
    }
  }

  const drafts: Draft[] = []
  const questionDrafts = new Map<string, QuestionDraft>()

  const reachesAboveData = (toks: PTok[], row: number) => row + minOffset(toks) < firstDataRow

  // ---------------------------------------------------------------------------
  // Pass 2: per-column checks
  // ---------------------------------------------------------------------------
  for (const col of formulaCols) {
    const [f1, f2] = col.families
    const share1 = f1.count / col.total
    let questionKey: string | null = null
    let resolvedBy: string[] = []
    let strays: Family[]

    if (share1 >= CLEAR_MAJORITY) {
      col.main = f1
      strays = col.families.slice(1)
    } else if (f2 && (f1.count + f2.count) / col.total >= CLEAR_MAJORITY && f2.count / col.total >= RIVAL_SHARE) {
      // Two rivals. Look-alike columns that settled on one of them can break the tie.
      const others = (skeleton: string) => (uniformBySkeleton.get(skeleton) ?? []).filter((l) => l !== col.ref.letter)
      const forA = others(f1.skeleton)
      const forB = others(f2.skeleton)
      if (forA.length >= MIN_AGREEING_SIBLINGS && forB.length === 0) {
        col.main = f1
        resolvedBy = forA
        strays = col.families.slice(1)
      } else if (forB.length >= MIN_AGREEING_SIBLINGS && forA.length === 0) {
        col.main = f2
        resolvedBy = forB
        strays = col.families.filter((f) => f !== f2)
      } else {
        // (f) a question
        const [a, b] = f1.skeleton <= f2.skeleton ? [f1, f2] : [f2, f1]
        questionKey = `${a.skeleton}\u0002${b.skeleton}`
        let q = questionDrafts.get(questionKey)
        if (!q) {
          q = { key: questionKey, a: { skeleton: a.skeleton, toks: a.canon }, b: { skeleton: b.skeleton, toks: b.canon }, members: [] }
          questionDrafts.set(questionKey, q)
        }
        q.members.push({ col, rowsA: a.rows, rowsB: b.rows })
        col.main = f1
        strays = col.families.slice(2)
      }
    } else {
      col.main = null
      strays = []
      const top = col.families.slice(0, 4)
      const counts = top.map((f) => f.count)
      drafts.push({
        kind: 'mixed',
        severity: 'medium',
        col,
        rows: col.families.flatMap((f) => f.rows).sort((x, y) => x - y),
        before: f1.canon,
        suggested: null,
        mergeKey: `mixed|${col.ref.letter}`,
        build: (columns) => mixedWording({ columns, counts }),
        caution: null,
        dependsOnKey: null,
        detail: { formulas: col.families.length },
      })
    }

    const main = col.main

    // (c) rows of the main family, or of any settled family, that read the wrong row
    for (const f of col.families) {
      if (!f.hasCanon && !f.corrected) continue
      // Rows at the top where the column's formula would have to look above the first data row
      // (a ten-row window on row 5, say) are start-up rows, not slips.
      const offenders = f.groups
        .filter((g) => g.key !== f.canonKey)
        .map((g) => ({ ...g, rows: g.rows.filter((r) => !reachesAboveData(f.canon, r)) }))
        .filter((g) => g.rows.length > 0)
      if (offenders.length === 0) continue
      const rows = offenders.flatMap((g) => g.rows).sort((x, y) => x - y)
      const before = offenders[0].toks
      const diffs = diffOffsets(before, f.canon)
      const single = diffs.length === 1 ? diffs[0] : null
      const evidence = f.corrected ? f.corrected.evidence : 'neighbours'
      const siblings = f.corrected ? f.corrected.siblings : []
      const otherRowCount = f.count - rows.length
      drafts.push({
        kind: 'offset',
        severity: 'high',
        col,
        rows,
        before,
        suggested: f.canon,
        mergeKey: `offset|${rows.join(',')}|${skeletonKey(before)}|${relativeOffsets(before).join(',')}`,
        build: (columns, ranges) =>
          offsetWording({
            columns,
            rows: ranges,
            readColumn: single ? single.column : null,
            delta: single ? single.delta : null,
            evidence,
            siblingLetters: siblings,
            otherRowCount,
          }),
        caution: null,
        dependsOnKey: f === main || !questionKey ? null : questionKey,
        detail: {
          readColumn: single ? single.column : null,
          rowsOff: single ? single.delta : null,
          evidence,
        },
      })
    }

    // (a) rows that use a different formula altogether
    if (main) {
      for (const stray of strays) {
        let rows = stray.rows.filter((r) => !reachesAboveData(main.canon, r))
        // A formula with no references on the very first row (usually ="") is a deliberate starting blank.
        if (stray.groups.every((g) => !hasReferences(g.toks))) rows = rows.filter((r) => r !== firstDataRow)
        if (rows.length === 0) continue

        // Rows that differ from another formula in the column by a single plus/minus (or similar)
        // are a slip in one direction or the other. Which one is the owner's call, however
        // lopsided the counts: ask instead of suggesting the more common version.
        const rival = col.families.find((other) => other !== stray && singleOperatorDiff(stray.canon, other.canon) !== null)
        if (rival) {
          const [a, b] = stray.skeleton <= rival.skeleton ? [stray, rival] : [rival, stray]
          const key = `${a.skeleton}\u0002${b.skeleton}`
          let q = questionDrafts.get(key)
          if (!q) {
            q = { key, a: { skeleton: a.skeleton, toks: a.canon }, b: { skeleton: b.skeleton, toks: b.canon }, members: [] }
            questionDrafts.set(key, q)
          }
          q.members.push({ col, rowsA: a.rows, rowsB: b.rows })
          continue
        }

        const otherCount = col.total - stray.count
        const siblings = stray === f1 || stray === f2 ? resolvedBy : []
        drafts.push({
          kind: 'inconsistent',
          severity: 'medium',
          col,
          rows,
          before: stray.canon,
          suggested: main.canon,
          mergeKey: `inconsistent|${rows.join(',')}|${stray.skeleton}|${main.skeleton}`,
          build: (columns, ranges, count) =>
            inconsistentWording({ columns, rows: ranges, count: count / columns.length, otherCount, siblingLetters: siblings }),
          caution: questionKey ? DEPENDS_CAUTION : null,
          dependsOnKey: questionKey,
          detail: { straySkeleton: stray.skeleton, mainSkeleton: main.skeleton },
        })
      }
    }

    // (b) blanks and typed-in values inside the stretch of formulas
    const gaps: number[] = []
    const typed: number[] = []
    for (let r = col.first; r <= col.last; r++) {
      const cell = col.cells.get(r)
      if (!cell) gaps.push(r)
      else if (cell.kind === 'value' && cell.type !== 'e') typed.push(r)
    }
    const realGaps = gaps.filter((r) => {
      let covering = 0
      let filled = 0
      for (const other of formulaCols) {
        if (other === col || r < other.first || r > other.last) continue
        covering++
        if (other.cells.get(r)?.kind === 'formula') filled++
      }
      if (covering > 0) return filled * 2 >= covering
      // The only column of formulas: a blank counts when the row is otherwise in use.
      for (const [c, cells] of sheet.columns) {
        if (c !== col.col && cells.has(r)) return true
      }
      return false
    })
    if (realGaps.length > 0) {
      drafts.push({
        kind: 'empty',
        severity: 'high',
        col,
        rows: realGaps,
        before: null,
        suggested: main ? main.canon : null,
        mergeKey: `empty|${realGaps.join(',')}|${main ? main.skeleton : ''}`,
        build: (columns, ranges, count) => emptyWording({ columns, rows: ranges, count }),
        caution: questionKey ? DEPENDS_CAUTION : null,
        dependsOnKey: questionKey,
        detail: {},
      })
    }
    if (typed.length > 0 && typed.length <= col.total * (1 - CLEAR_MAJORITY)) {
      drafts.push({
        kind: 'hardcoded',
        severity: 'medium',
        col,
        rows: typed,
        before: null,
        suggested: main ? main.canon : null,
        mergeKey: `hardcoded|${typed.join(',')}|${main ? main.skeleton : ''}`,
        build: (columns, ranges) => hardcodedWording({ columns, rows: ranges }),
        caution: questionKey ? DEPENDS_CAUTION : null,
        dependsOnKey: questionKey,
        detail: {},
      })
    }
  }

  // (d) cells showing an Excel error, in any column
  for (const colNum of sortedCols) {
    const cells = sheet.columns.get(colNum)!
    const rows: number[] = []
    const errors = new Set<string>()
    for (const cell of cells.values()) {
      if (cell.type === 'e' && cell.row > headerRow) {
        rows.push(cell.row)
        if (cell.display) errors.add(cell.display)
      }
    }
    if (rows.length === 0) continue
    rows.sort((a, b) => a - b)
    const list = [...errors].slice(0, 3)
    drafts.push({
      kind: 'error',
      severity: 'high',
      col: { ref: refOf(colNum), cells },
      rows,
      before: null,
      suggested: null,
      mergeKey: `error|${numToCol(colNum)}`,
      build: (columns, ranges, count) => errorWording({ columns, rows: ranges, count, errors: list }),
      caution: null,
      dependsOnKey: null,
      detail: { errors: list.join(' ') },
    })
  }

  // ---------------------------------------------------------------------------
  // Questions: one per pair of rival formulas, across every column that has both
  // ---------------------------------------------------------------------------
  const questions: Finding[] = []
  const questionIds = new Map<string, string>()
  for (const q of questionDrafts.values()) {
    // A column that mostly uses one rival and strays into the other belongs to the same question.
    for (let i = drafts.length - 1; i >= 0; i--) {
      const d = drafts[i]
      if (d.kind !== 'inconsistent' || !('families' in d.col)) continue
      const pair = [d.detail.straySkeleton, d.detail.mainSkeleton]
      if (!pair.includes(q.a.skeleton) || !pair.includes(q.b.skeleton)) continue
      const info = d.col
      const fa = info.families.find((f) => f.skeleton === q.a.skeleton)
      const fb = info.families.find((f) => f.skeleton === q.b.skeleton)
      if (!fa || !fb) continue
      q.members.push({ col: info, rowsA: fa.rows, rowsB: fb.rows })
      drafts.splice(i, 1)
    }
    q.members.sort((x, y) => x.col.col - y.col.col)

    let countA = 0
    let countB = 0
    for (const m of q.members) {
      countA += m.rowsA.length
      countB += m.rowsB.length
    }
    // Show the more common formula first.
    const flip = countB > countA
    const first = flip ? q.b : q.a
    const second = flip ? q.a : q.b
    const rowsFirst = (m: QuestionDraft['members'][number]) => (flip ? m.rowsB : m.rowsA)
    const rowsSecond = (m: QuestionDraft['members'][number]) => (flip ? m.rowsA : m.rowsB)

    const lead = q.members[0]
    const columns = q.members.map((m) => m.col.ref)
    const rangesFirst = toRanges(rowsFirst(lead))
    const rangesSecond = toRanges(rowsSecond(lead))
    const totalFirst = q.members.reduce((n, m) => n + rowsFirst(m).length, 0)
    const totalSecond = q.members.reduce((n, m) => n + rowsSecond(m).length, 0)
    const operator = singleOperatorDiff(first.toks, second.toks)
    const words = questionWording({
      columns,
      rowsA: rangesFirst,
      countA: totalFirst,
      rowsB: rangesSecond,
      countB: totalSecond,
      operator,
    })

    const leadFamily = (skeleton: string) => lead.col.families.find((f) => f.skeleton === skeleton)!
    const famFirst = leadFamily(first.skeleton)
    const famSecond = leadFamily(second.skeleton)
    let formulaFirst: string
    let formulaSecond: string
    let cellFirst: string
    let cellSecond: string
    const sampleRow = Math.max(
      rowsFirst(lead)[0],
      rowsSecond(lead)[0],
      firstDataRow - minOffset(famFirst.canon),
      firstDataRow - minOffset(famSecond.canon)
    )
    if (famFirst.hasCanon && famSecond.hasCanon) {
      // Write both formulas for the same cell so they can be compared side by side.
      formulaFirst = `=${renderFormula(famFirst.canon, sampleRow)}`
      formulaSecond = `=${renderFormula(famSecond.canon, sampleRow)}`
      cellFirst = cellSecond = cellAddress(lead.col.col, sampleRow)
    } else {
      // One side varies from row to row: show each formula exactly as it is written in one of its own cells.
      const own = (rows: number[]) => {
        const row = rows[rows.length - 1]
        const cell = lead.col.cells.get(row)
        return { cell: cellAddress(lead.col.col, row), formula: cell?.toks ? `=${renderFormula(cell.toks, row)}` : '' }
      }
      const x = own(rowsFirst(lead))
      const y = own(rowsSecond(lead))
      formulaFirst = x.formula
      formulaSecond = y.formula
      cellFirst = x.cell
      cellSecond = y.cell
    }

    const options: [QuestionOption, QuestionOption] = [
      { key: 'a', label: words.labelA, formula: formulaFirst, cell: cellFirst, rows: rangesFirst, count: totalFirst },
      { key: 'b', label: words.labelB, formula: formulaSecond, cell: cellSecond, rows: rangesSecond, count: totalSecond },
    ]

    const examples: ExampleCell[] = [
      ...pickExamples(lead.col.cells, lead.col.col, rowsFirst(lead), null, 1),
      ...pickExamples(lead.col.cells, lead.col.col, rowsSecond(lead), null, 2),
    ].slice(0, 3)

    const allRows = q.members.flatMap((m) => [...m.rowsA, ...m.rowsB])
    const id = `question-${sheet.index + 1}-${columns.map((c) => c.letter).join('')}-${Math.min(...allRows)}`
    questionIds.set(q.key, id)
    questions.push({
      id,
      kind: 'question',
      severity: 'medium',
      sheet: sheet.name,
      columns,
      rows: toRanges(allRows),
      cellCount: totalFirst + totalSecond,
      cellsWithValues: q.members.reduce(
        (n, m) => n + [...m.rowsA, ...m.rowsB].filter((r) => m.col.cells.get(r)?.display != null).length,
        0
      ),
      formulaBefore: null,
      formulaSuggested: null,
      examples,
      title: words.title,
      explanation: words.explanation,
      caution: null,
      options,
      detail: { exampleRow: sampleRow, operatorOnly: operator !== null },
    })
  }

  // ---------------------------------------------------------------------------
  // Merge the same problem across look-alike columns and write the findings
  // ---------------------------------------------------------------------------
  const merged = new Map<string, Draft[]>()
  for (const d of drafts) {
    const list = merged.get(d.mergeKey) ?? []
    list.push(d)
    merged.set(d.mergeKey, list)
  }
  const findings: Finding[] = []
  for (const list of merged.values()) {
    const lead = list[0]
    const columns = list.map((d) => d.col.ref)
    const ranges = toRanges(lead.rows)
    const cellCount = list.reduce((n, d) => n + d.rows.length, 0)
    const words = lead.build(columns, ranges, cellCount)
    const perColumn = list.length >= 3 ? 1 : list.length === 2 ? 2 : 3
    const examples: ExampleCell[] = []
    for (const d of list) {
      if (examples.length >= 3) break
      const colNum = 'col' in d.col ? d.col.col : colNumOf(d.col.ref.letter)
      examples.push(...pickExamples(d.col.cells, colNum, d.rows, d.suggested, Math.min(perColumn, 3 - examples.length)))
    }
    const exampleRow = examples[0] ? parseInt(examples[0].cell.replace(/^[A-Z]+/, ''), 10) : lead.rows[0]
    const beforeCell = lead.col.cells.get(exampleRow)
    const formulaBefore =
      beforeCell?.kind === 'formula' && beforeCell.toks
        ? `=${renderFormula(beforeCell.toks, exampleRow)}`
        : lead.before && lead.kind !== 'empty' && lead.kind !== 'hardcoded'
          ? `=${renderFormula(lead.before, exampleRow)}`
          : null
    findings.push({
      id: `${lead.kind}-${sheet.index + 1}-${columns.map((c) => c.letter).join('')}-${lead.rows[0]}`,
      kind: lead.kind,
      severity: lead.severity,
      sheet: sheet.name,
      columns,
      rows: ranges,
      cellCount,
      cellsWithValues: list.reduce((n, d) => n + d.rows.filter((r) => d.col.cells.get(r)?.display != null).length, 0),
      formulaBefore,
      formulaSuggested: lead.suggested ? `=${renderFormula(lead.suggested, exampleRow)}` : null,
      examples,
      title: words.title,
      explanation: words.explanation,
      caution: lead.caution,
      dependsOn: lead.dependsOnKey ? questionIds.get(lead.dependsOnKey) : undefined,
      detail: lead.detail,
    })
  }

  findings.push(...checkColourRules(sheet, headerRow, refOf))

  // ---------------------------------------------------------------------------
  // Summary of the sheet for the page and for the AI
  // ---------------------------------------------------------------------------
  const formulaColSet = new Map(formulaCols.map((c) => [c.col, c]))
  const columnSummaries: ColumnSummary[] = []
  for (const colNum of sortedCols) {
    const cells = sheet.columns.get(colNum)!
    const data = [...cells.values()].filter((c) => c.row > headerRow).sort((a, b) => a.row - b.row)
    if (data.length === 0) continue
    const counts = { formula: 0, n: 0, d: 0, s: 0 }
    for (const c of data) {
      if (c.kind === 'formula') counts.formula++
      else if (c.type === 'd') counts.d++
      else if (c.type === 's') counts.s++
      else counts.n++
    }
    const top = (Object.entries(counts) as [keyof typeof counts, number][]).sort((x, y) => y[1] - x[1])[0]
    const holds: ColumnSummary['holds'] =
      top[1] < data.length * 0.6
        ? 'mixed'
        : top[0] === 'formula'
          ? 'formulas'
          : top[0] === 'd'
            ? 'dates'
            : top[0] === 's'
              ? 'text'
              : 'numbers'
    const info = formulaColSet.get(colNum)
    const families = info ? info.families : buildFamilies(cells, headerRow)
    const formulas = families.slice(0, 3).map((f) => ({
      formula: `=${renderFormula(f.groups[0].toks, f.groups[0].rows[0])}`.slice(0, 600),
      rows: f.count,
      firstRow: f.rows[0],
    }))
    const samples = data
      .filter((c) => c.display != null)
      .slice(0, 4)
      .map((c) => (c.display as string).slice(0, 60))
    columnSummaries.push({
      letter: numToCol(colNum),
      header: headerOf(colNum),
      holds,
      filledRows: data.length,
      formulas,
      samples,
      description: defaultColumnDescription(holds, families[0]?.groups[0].toks ?? null),
    })
  }

  // A short tab with no formulas that is mostly text is the owner's notes.
  const notes: string[] = []
  if (formulaCols.length === 0 && sheet.maxRow <= 40 && sheet.maxCol <= 6) {
    let textCells = 0
    let allCells = 0
    for (const cells of sheet.columns.values()) {
      for (const c of cells.values()) {
        allCells++
        if (c.type === 's') textCells++
      }
    }
    if (allCells > 0 && textCells / allCells >= 0.8) {
      for (let r = 1; r <= sheet.maxRow; r++) {
        const parts: string[] = []
        for (const colNum of sortedCols) {
          const d = sheet.columns.get(colNum)?.get(r)?.display
          if (d) parts.push(d.slice(0, 240))
        }
        if (parts.length > 0) notes.push(parts.join(': '))
      }
    }
  }

  const summary: SheetSummary = {
    name: sheet.name,
    hidden: sheet.hidden,
    rows: sheet.maxRow,
    headerRow: headerRow || null,
    columns: columnSummaries,
    hasFormulas: formulaCols.length > 0,
    notes,
  }

  return { findings, questions, summary }
}

function hasReferences(toks: PTok[]): boolean {
  return toks.some((t) => t.t === 'ref' || t.t === 'col' || t.t === 'row' || t.t === 'name' || t.t === 'other')
}

function colNumOf(letter: string): number {
  let n = 0
  for (let i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64)
  return n
}

function defaultColumnDescription(holds: ColumnSummary['holds'], toks: PTok[] | null): string {
  if (holds === 'formulas' && toks) {
    const cols = new Set<string>()
    const tabs = new Set<string>()
    for (const t of toks) {
      if (t.t === 'ref' || t.t === 'col') {
        if (t.sheet) tabs.add(t.sheet.replace(/!$/, '').replace(/^'|'$/g, ''))
        else cols.add(numToCol(t.col))
      }
    }
    const parts: string[] = []
    if (cols.size > 0) parts.push(`${cols.size === 1 ? 'column' : 'columns'} ${[...cols].slice(0, 4).join(', ')}`)
    if (tabs.size > 0) parts.push(`the “${[...tabs].slice(0, 2).join('” and “')}” ${tabs.size === 1 ? 'tab' : 'tabs'}`)
    return parts.length > 0 ? `Worked out by a formula from ${parts.join(' and ')}.` : 'Worked out by a formula.'
  }
  if (holds === 'dates') return 'Dates.'
  if (holds === 'numbers') return 'Numbers that were typed or loaded in.'
  if (holds === 'text') return 'Text.'
  return 'A mix of typed values and formulas.'
}

// -----------------------------------------------------------------------------
// (e) colour rules that cover only part of a column
// -----------------------------------------------------------------------------

function checkColourRules(sheet: SheetModel, headerRow: number, refOf: (col: number) => ColumnRef): Finding[] {
  // The same rule is often chopped into several blocks; add their coverage together first.
  const bySignature = new Map<string, { color: string | null; perCol: Map<number, [number, number][]> }>()
  for (const block of sheet.conditionalFormats) {
    for (const rule of block.rules) {
      const sig = `${rule.type}|${rule.operator}|${rule.formulaKeys.join('|')}|${rule.color ?? ''}`
      let entry = bySignature.get(sig)
      if (!entry) {
        entry = { color: rule.color, perCol: new Map() }
        bySignature.set(sig, entry)
      }
      for (const range of block.ranges) {
        for (let c = range.c1; c <= Math.min(range.c2, sheet.maxCol); c++) {
          const list = entry.perCol.get(c) ?? []
          list.push([range.r1, range.r2])
          entry.perCol.set(c, list)
        }
      }
    }
  }

  interface Gap {
    col: number
    covered: number[]
    missing: number[]
    color: string | null
    rules: number
  }
  const gaps = new Map<string, Gap>()
  for (const entry of bySignature.values()) {
    for (const [colNum, intervals] of entry.perCol) {
      const cells = sheet.columns.get(colNum)
      if (!cells) continue
      const covered: Cell[] = []
      const uncovered: Cell[] = []
      for (const cell of cells.values()) {
        if (cell.row <= headerRow) continue
        if (intervals.some(([a, b]) => cell.row >= a && cell.row <= b)) covered.push(cell)
        else uncovered.push(cell)
      }
      if (covered.length === 0 || uncovered.length === 0) continue
      // "Same kind of data": the uncovered rows hold what the covered rows mostly hold.
      const formulaShare = covered.filter((c) => c.kind === 'formula').length / covered.length
      const wantKind = formulaShare >= 0.5 ? 'formula' : 'value'
      const missing = uncovered.filter((c) => c.kind === wantKind).map((c) => c.row).sort((a, b) => a - b)
      if (missing.length === 0) continue
      const coveredRows = covered.map((c) => c.row).sort((a, b) => a - b)
      const key = `${colNum}|${missing[0]}-${missing[missing.length - 1]}|${missing.length}|${coveredRows[0]}-${coveredRows.length}`
      const existing = gaps.get(key)
      if (existing) existing.rules++
      else gaps.set(key, { col: colNum, covered: coveredRows, missing, color: entry.color, rules: 1 })
    }
  }

  // Columns that miss exactly the same rows under the same number of rules are one finding.
  const grouped = new Map<string, Gap[]>()
  for (const gap of gaps.values()) {
    const key = `${gap.missing.join(',')}|${gap.covered[0]}|${gap.covered.length}|${gap.rules}|${gap.color ?? ''}`
    const list = grouped.get(key) ?? []
    list.push(gap)
    grouped.set(key, list)
  }

  const findings: Finding[] = []
  for (const list of grouped.values()) {
    list.sort((a, b) => a.col - b.col)
    const lead = list[0]
    const columns = list.map((g) => refOf(g.col))
    const missing = toRanges(lead.missing)
    const covered = toRanges(lead.covered)
    const cells = sheet.columns.get(lead.col)!
    const all = [...lead.covered, ...lead.missing]
    const from = Math.min(...all)
    const to = Math.max(...all)
    const words = formattingWording({ columns, covered, missing, ruleCount: lead.rules })
    const firstLetter = columns[0].letter
    const lastLetter = columns[columns.length - 1].letter
    findings.push({
      id: `formatting-${sheet.index + 1}-${columns.map((c) => c.letter).join('')}-${lead.missing[0]}`,
      kind: 'formatting',
      severity: 'low',
      sheet: sheet.name,
      columns,
      rows: missing,
      cellCount: lead.missing.length * list.length,
      cellsWithValues: list.reduce(
        (n, g) => n + g.missing.filter((r) => sheet.columns.get(g.col)?.get(r)?.display != null).length,
        0
      ),
      formulaBefore: null,
      formulaSuggested: null,
      examples: pickExamples(cells, lead.col, lead.missing, null, 3).map((e) => ({ ...e, formula: null })),
      title: words.title,
      explanation: words.explanation,
      caution: null,
      color: lead.color,
      suggestedRange:
        list[list.length - 1].col - lead.col === list.length - 1
          ? `${firstLetter}${from}:${lastLetter}${to}`
          : `${firstLetter}${from}:${firstLetter}${to}`,
      detail: { rules: lead.rules, coveredRows: countRows(covered), missingRows: countRows(missing) },
    })
  }
  return findings
}

// -----------------------------------------------------------------------------
// Whole workbook
// -----------------------------------------------------------------------------

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
const KIND_ORDER: Record<Finding['kind'], number> = {
  offset: 0,
  empty: 1,
  error: 2,
  hardcoded: 3,
  inconsistent: 4,
  mixed: 5,
  formatting: 6,
  question: 7,
}

export interface Analysis {
  problems: Finding[]
  questions: Finding[]
  structure: WorkbookStructure
}

export function analyzeWorkbook(wb: WorkbookModel): Analysis {
  const problems: Finding[] = []
  const questions: Finding[] = []
  const sheets: SheetSummary[] = []
  for (const sheet of wb.sheets) {
    const result = analyzeSheet(sheet)
    problems.push(...result.findings)
    questions.push(...result.questions)
    sheets.push(result.summary)
  }

  problems.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      b.cellCount - a.cellCount ||
      a.id.localeCompare(b.id)
  )
  questions.sort((a, b) => b.cellCount - a.cellCount || a.id.localeCompare(b.id))

  // Ids must be unique because the AI's wording is matched back by id.
  const seen = new Map<string, number>()
  for (const f of [...problems, ...questions]) {
    const n = seen.get(f.id) ?? 0
    seen.set(f.id, n + 1)
    if (n > 0) f.id = `${f.id}-${n + 1}`
  }

  return { problems, questions, structure: { sheets, features: wb.features } }
}
