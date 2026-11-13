// =============================================================================
// Spreadsheet check-up - formula patterns
//
// Turns an Excel formula into a row-relative pattern so that "the same formula
// filled down a column" compares equal on every row. Three levels of
// abstraction are derived from one token list:
//
//   pattern   exact, row-relative        IF(B[0]="","",B[0]/B[-1]-1)
//   shape     row offsets blanked        IF(B[r]="","",B[r]/B[r]-1)
//   skeleton  every reference blanked    IF(R="","",R/R-1)
//
// Rows whose patterns differ but whose shapes match differ only in which rows
// they read. Columns whose skeletons match do the same job on different inputs.
// =============================================================================

export type PTok =
  /** A cell reference such as A1, $A$1 or 'Sheet'!$A7. */
  | {
      t: 'ref'
      sheet: string
      colAbs: boolean
      col: number
      rowAbs: boolean
      /** Absolute row number when rowAbs, otherwise the offset from the formula's own row. */
      row: number
    }
  /** One end of a whole-column reference such as A:A. */
  | { t: 'col'; sheet: string; colAbs: boolean; col: number }
  /** One end of a whole-row reference such as 1:1. */
  | { t: 'row'; sheet: string; rowAbs: boolean; row: number }
  | { t: 'str' | 'num' | 'op' | 'func' | 'name' | 'err' | 'ws' | 'other'; v: string }

const MAX_COL = 16384
const MAX_ROW = 1048576

export function colToNum(letters: string): number {
  let n = 0
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) & 31)
  }
  return n
}

export function numToCol(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const RE_QUOTED_SHEET = /^'(?:[^']|'')*'!/
const RE_BARE_SHEET = /^(?:\[\d+\])?[A-Za-z_][A-Za-z0-9_.]*(?::[A-Za-z_][A-Za-z0-9_.]*)?!/
const RE_CELL = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_.(])/
const RE_COL_RANGE = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_.($])/
const RE_ROW_RANGE = /^(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![A-Za-z0-9_.])/
const RE_NUMBER = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/
const RE_ERROR = /^#(?:REF!|N\/A|DIV\/0!|VALUE!|NAME\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA|FIELD!|BLOCKED!|CONNECT!|BUSY!|UNKNOWN!)/
const RE_IDENT = /^[A-Za-z_\\][A-Za-z0-9_.\\?]*/
const RE_OP = /^(?:<=|>=|<>|[-+*/^&=<>(),:;%!@#])/

function readBalanced(src: string, start: number, open: string, close: string): number {
  let depth = 0
  let i = start
  while (i < src.length) {
    const ch = src[i]
    if (ch === '"') {
      i++
      while (i < src.length) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') i++
          else break
        }
        i++
      }
    } else if (ch === open) {
      depth++
    } else if (ch === close) {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  return src.length
}

/**
 * Tokenise a formula (without the leading "=") written in a cell on `row`.
 * Relative row numbers are stored as offsets from `row`.
 */
export function parseFormula(formula: string, row: number): PTok[] {
  const out: PTok[] = []
  let i = 0
  const n = formula.length

  while (i < n) {
    const ch = formula[i]
    const rest = formula.slice(i)

    // Whitespace
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      let j = i + 1
      while (j < n && ' \n\r\t'.includes(formula[j])) j++
      out.push({ t: 'ws', v: formula.slice(i, j) })
      i = j
      continue
    }

    // String literal
    if (ch === '"') {
      let j = i + 1
      while (j < n) {
        if (formula[j] === '"') {
          if (formula[j + 1] === '"') j++
          else break
        }
        j++
      }
      out.push({ t: 'str', v: formula.slice(i, Math.min(j + 1, n)) })
      i = j + 1
      continue
    }

    // Array constant {1,2;3,4}
    if (ch === '{') {
      const end = readBalanced(formula, i, '{', '}')
      out.push({ t: 'other', v: formula.slice(i, end) })
      i = end
      continue
    }

    // Structured reference that starts with a bracket: [@Col], [[#This Row],[Col]]
    if (ch === '[') {
      const end = readBalanced(formula, i, '[', ']')
      // "[1]Sheet!A1" is an external workbook prefix, handled by the sheet regex below
      const asSheet = RE_BARE_SHEET.exec(rest)
      if (!asSheet) {
        out.push({ t: 'other', v: formula.slice(i, end) })
        i = end
        continue
      }
    }

    // Optional sheet prefix
    let sheet = ''
    let body = rest
    const q = ch === "'" ? RE_QUOTED_SHEET.exec(rest) : RE_BARE_SHEET.exec(rest)
    if (q) {
      sheet = q[0]
      body = rest.slice(sheet.length)
    } else if (ch === "'") {
      // A stray quote we do not understand: emit it verbatim
      out.push({ t: 'other', v: ch })
      i++
      continue
    }

    // Cell reference
    const cell = RE_CELL.exec(body)
    if (cell) {
      const col = colToNum(cell[2])
      const r = parseInt(cell[4], 10)
      if (col >= 1 && col <= MAX_COL && r >= 1 && r <= MAX_ROW) {
        const rowAbs = cell[3] === '$'
        out.push({
          t: 'ref',
          sheet,
          colAbs: cell[1] === '$',
          col,
          rowAbs,
          row: rowAbs ? r : r - row,
        })
        i += sheet.length + cell[0].length
        continue
      }
    }

    // Whole-column range A:A
    const colRange = RE_COL_RANGE.exec(body)
    if (colRange) {
      const c1 = colToNum(colRange[2])
      const c2 = colToNum(colRange[4])
      if (c1 <= MAX_COL && c2 <= MAX_COL) {
        out.push({ t: 'col', sheet, colAbs: colRange[1] === '$', col: c1 })
        out.push({ t: 'op', v: ':' })
        out.push({ t: 'col', sheet: '', colAbs: colRange[3] === '$', col: c2 })
        i += sheet.length + colRange[0].length
        continue
      }
    }

    // Whole-row range 1:1
    const rowRange = RE_ROW_RANGE.exec(body)
    if (rowRange) {
      const r1 = parseInt(rowRange[2], 10)
      const r2 = parseInt(rowRange[4], 10)
      const a1 = rowRange[1] === '$'
      const a2 = rowRange[3] === '$'
      out.push({ t: 'row', sheet, rowAbs: a1, row: a1 ? r1 : r1 - row })
      out.push({ t: 'op', v: ':' })
      out.push({ t: 'row', sheet: '', rowAbs: a2, row: a2 ? r2 : r2 - row })
      i += sheet.length + rowRange[0].length
      continue
    }

    if (sheet) {
      // Sheet prefix followed by something else (a defined name, a table): keep verbatim
      const ident = RE_IDENT.exec(body)
      const len = sheet.length + (ident ? ident[0].length : 0)
      out.push({ t: 'name', v: formula.slice(i, i + len) })
      i += len
      continue
    }

    // Error literal
    const err = RE_ERROR.exec(rest)
    if (err) {
      out.push({ t: 'err', v: err[0] })
      i += err[0].length
      continue
    }

    // Number
    const num = RE_NUMBER.exec(rest)
    if (num && /[0-9.]/.test(ch)) {
      out.push({ t: 'num', v: num[0] })
      i += num[0].length
      continue
    }

    // Function name, defined name, TRUE/FALSE, table name
    const ident = RE_IDENT.exec(rest)
    if (ident) {
      let end = i + ident[0].length
      if (formula[end] === '(') {
        out.push({ t: 'func', v: ident[0] })
      } else if (formula[end] === '[') {
        end = readBalanced(formula, end, '[', ']')
        out.push({ t: 'other', v: formula.slice(i, end) })
      } else {
        out.push({ t: 'name', v: ident[0] })
      }
      i = end
      continue
    }

    // Operator or punctuation
    const op = RE_OP.exec(rest)
    if (op) {
      out.push({ t: 'op', v: op[0] })
      i += op[0].length
      continue
    }

    out.push({ t: 'other', v: ch })
    i++
  }

  return out
}

function sign(n: number): string {
  return n >= 0 ? `+${n}` : String(n)
}

/**
 * Excel writes a range with its upper row first, so a filled-down `B$3:B9` reads `B2:B$3` on
 * row 2: the same formula with its ends swapped. For comparing formulas, put the fixed end first.
 */
function fixedEndFirst(toks: PTok[]): PTok[] {
  let out: PTok[] | null = null
  for (let i = 0; i + 2 < toks.length; i++) {
    const a = toks[i]
    const colon = toks[i + 1]
    const b = toks[i + 2]
    if (a.t !== 'ref' || b.t !== 'ref' || colon.t !== 'op' || colon.v !== ':') continue
    if (a.rowAbs || !b.rowAbs || b.sheet !== '' || a.col !== b.col || a.colAbs !== b.colAbs) continue
    if (!out) out = [...toks]
    out[i] = { ...a, rowAbs: true, row: b.row }
    out[i + 2] = { ...b, rowAbs: false, row: a.row }
  }
  return out ?? toks
}

/** Exact row-relative pattern. Two cells with the same key hold "the same formula". */
export function patternKey(toks: PTok[]): string {
  let s = ''
  for (const t of fixedEndFirst(toks)) {
    switch (t.t) {
      case 'ws':
        break
      case 'ref':
        s += `${t.sheet}${t.colAbs ? '$' : ''}${numToCol(t.col)}${t.rowAbs ? `$${t.row}` : `[${sign(t.row)}]`}`
        break
      case 'col':
        s += `${t.sheet}${t.colAbs ? '$' : ''}${numToCol(t.col)}`
        break
      case 'row':
        s += `${t.sheet}${t.rowAbs ? `$${t.row}` : `[${sign(t.row)}]`}`
        break
      default:
        s += t.v
    }
  }
  return s
}

/** Pattern with relative row offsets blanked: equal shapes differ only in which rows they read. */
export function shapeKey(toks: PTok[]): string {
  let s = ''
  for (const t of fixedEndFirst(toks)) {
    switch (t.t) {
      case 'ws':
        break
      case 'ref':
        s += `${t.sheet}${t.colAbs ? '$' : ''}${numToCol(t.col)}${t.rowAbs ? `$${t.row}` : '[r]'}`
        break
      case 'col':
        s += `${t.sheet}${t.colAbs ? '$' : ''}${numToCol(t.col)}`
        break
      case 'row':
        s += `${t.sheet}${t.rowAbs ? `$${t.row}` : '[r]'}`
        break
      default:
        s += t.v
    }
  }
  return s
}

/** Pattern with every reference blanked: equal skeletons do the same job on different inputs. */
export function skeletonKey(toks: PTok[]): string {
  let s = ''
  for (const t of fixedEndFirst(toks)) {
    switch (t.t) {
      case 'ws':
        break
      case 'ref':
        s += t.rowAbs ? 'A' : 'R'
        break
      case 'col':
        s += 'C'
        break
      case 'row':
        s += t.rowAbs ? 'W' : 'V'
        break
      case 'func':
      case 'name':
        s += t.v.toUpperCase()
        break
      default:
        s += t.v
    }
    s += '\u0001'
  }
  return s
}

/** Skeleton as a token list, used to spot single-operator differences. */
export function skeletonTokens(toks: PTok[]): string[] {
  return skeletonKey(toks).split('\u0001').filter((x) => x !== '')
}

/** Write the pattern back as the formula it would be on `row` (no leading "="). */
export function renderFormula(toks: PTok[], row: number): string {
  let s = ''
  for (const t of toks) {
    switch (t.t) {
      case 'ref': {
        const r = t.rowAbs ? t.row : row + t.row
        if (r < 1 || r > MAX_ROW) {
          s += '#REF!'
        } else {
          s += `${t.sheet}${t.colAbs ? '$' : ''}${numToCol(t.col)}${t.rowAbs ? '$' : ''}${r}`
        }
        break
      }
      case 'col':
        s += `${t.sheet}${t.colAbs ? '$' : ''}${numToCol(t.col)}`
        break
      case 'row': {
        const r = t.rowAbs ? t.row : row + t.row
        s += `${t.sheet}${t.rowAbs ? '$' : ''}${r < 1 ? '#REF!' : r}`
        break
      }
      default:
        s += t.v
    }
  }
  return s
}

/** Row offsets of every row-relative reference, in reading order. */
export function relativeOffsets(toks: PTok[]): number[] {
  const out: number[] = []
  for (const t of toks) {
    if ((t.t === 'ref' || t.t === 'row') && !t.rowAbs) out.push(t.row)
  }
  return out
}

/** Copy of the pattern with its row-relative offsets replaced, in reading order. */
export function withOffsets(toks: PTok[], offsets: number[]): PTok[] {
  let k = 0
  return toks.map((t) => {
    if ((t.t === 'ref' || t.t === 'row') && !t.rowAbs) {
      const off = offsets[k++]
      return off === undefined ? t : { ...t, row: off }
    }
    return t
  })
}

/** Shift column-relative references sideways (used to expand shared formulas across columns). */
export function shiftColumns(toks: PTok[], delta: number): PTok[] {
  if (delta === 0) return toks
  return toks.map((t) => {
    if ((t.t === 'ref' || t.t === 'col') && !t.colAbs) {
      return { ...t, col: Math.max(1, t.col + delta) }
    }
    return t
  })
}

/** Smallest row-relative offset in the pattern, or 0 when it has none. */
export function minOffset(toks: PTok[]): number {
  let m = 0
  for (const t of toks) {
    if ((t.t === 'ref' || t.t === 'row') && !t.rowAbs && t.row < m) m = t.row
  }
  return m
}

export interface OffsetDiff {
  /** Column letter of the reference that moved. */
  column: string
  sheet: string
  /** Rows the "before" pattern is off by, relative to the suggested one. Negative means it reads from above. */
  delta: number
}

/** Where two same-shape patterns read different rows. */
export function diffOffsets(before: PTok[], after: PTok[]): OffsetDiff[] {
  const out: OffsetDiff[] = []
  const seen = new Set<string>()
  const a = before.filter((t) => t.t !== 'ws')
  const b = after.filter((t) => t.t !== 'ws')
  if (a.length !== b.length) return out
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.t === 'ref' && y.t === 'ref' && !x.rowAbs && !y.rowAbs && x.row !== y.row) {
      const column = numToCol(x.col)
      const key = `${x.sheet}${column}:${x.row - y.row}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ column, sheet: x.sheet, delta: x.row - y.row })
      }
    }
  }
  return out
}

/** If two skeletons differ in exactly one operator, return that pair. */
export function singleOperatorDiff(a: PTok[], b: PTok[]): { from: string; to: string } | null {
  const sa = skeletonTokens(a)
  const sb = skeletonTokens(b)
  if (sa.length !== sb.length) return null
  let found: { from: string; to: string } | null = null
  const ops = new Set(['+', '-', '*', '/', '<', '>', '<=', '>=', '<>', '=', '&', '^'])
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] === sb[i]) continue
    if (found) return null
    if (!ops.has(sa[i]) || !ops.has(sb[i])) return null
    found = { from: sa[i], to: sb[i] }
  }
  return found
}
