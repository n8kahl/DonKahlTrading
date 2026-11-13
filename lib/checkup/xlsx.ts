// =============================================================================
// Spreadsheet check-up - workbook reader
//
// Reads an .xlsx file's XML parts straight out of the zip, in memory. Nothing
// is written anywhere and the file is never re-saved, so Power Query
// connections, charts and macros in the original are untouched.
// =============================================================================

import { unzipSync, strFromU8 } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { colToNum, parseFormula, patternKey, shiftColumns, type PTok } from './formula'
import type { Cell, CfBlock, CfRule, SheetModel, WorkbookModel } from './types'

/** An error whose message is safe and useful to show to the person who uploaded the file. */
export class CheckupError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'CheckupError'
    this.status = status
  }
}

export { MAX_UPLOAD_BYTES } from './limits'
/** Limit on the unpacked size of the parts we read, so a tiny zip cannot exhaust memory. */
const MAX_UNPACKED_BYTES = 80 * 1024 * 1024
/** Rows read per sheet before the sheet is marked as truncated. */
const MAX_ROWS_PER_SHEET = 200_000
const MAX_SHEETS = 60

const ARRAY_TAGS = new Set([
  'sheet',
  'Relationship',
  'row',
  'c',
  'si',
  'r',
  'numFmt',
  'xf',
  'dxf',
  'conditionalFormatting',
  'cfRule',
  'formula',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  removeNSPrefix: true,
  processEntities: true,
  isArray: (name) => ARRAY_TAGS.has(name),
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Xml = any

function parseXml(bytes: Uint8Array, what: string): Xml {
  const text = strFromU8(bytes)
  // Office files never carry a DOCTYPE; refusing one rules out entity-expansion tricks.
  if (text.slice(0, 2000).includes('<!DOCTYPE')) {
    throw new CheckupError('This file is not a normal Excel workbook, so it was not opened.')
  }
  try {
    return parser.parse(text)
  } catch {
    throw new CheckupError(`Part of this workbook could not be read (${what}). Try saving it again from Excel as .xlsx.`)
  }
}

function text(node: Xml): string | null {
  if (node === undefined || node === null) return null
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (typeof node === 'object') {
    const t = node['#']
    return t === undefined || t === null ? '' : String(t)
  }
  return null
}

function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = `xl/${target}`.split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.' && p !== '') out.push(p)
  }
  return out.join('/')
}

// -----------------------------------------------------------------------------
// Number formats
// -----------------------------------------------------------------------------

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])
const BUILTIN_PERCENT_FORMATS = new Set([9, 10])

function classifyFormat(id: number, code: string | undefined): 'date' | 'percent' | 'plain' {
  if (BUILTIN_DATE_FORMATS.has(id)) return 'date'
  if (BUILTIN_PERCENT_FORMATS.has(id)) return 'percent'
  if (!code) return 'plain'
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
  if (bare.includes('%')) return 'percent'
  if (/[dmyhs]/i.test(bare) && !/[0#]/.test(bare)) return 'date'
  return 'plain'
}

function formatDate(serial: number, date1904: boolean): string {
  const days = Math.floor(serial) + (date1904 ? 1462 : 0)
  const ms = Date.UTC(1899, 11, 30) + days * 86400000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return String(serial)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
}

function formatNumber(raw: string, kind: 'date' | 'percent' | 'plain', date1904: boolean): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (kind === 'date' && n > 0 && n < 2958466) return formatDate(n, date1904)
  if (kind === 'percent') return `${(n * 100).toFixed(2)}%`
  if (Number.isInteger(n)) return String(n)
  const abs = Math.abs(n)
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6
  return String(Number(n.toFixed(digits)))
}

// -----------------------------------------------------------------------------
// Reader
// -----------------------------------------------------------------------------

function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref)
  if (!m) return null
  return { col: colToNum(m[1]), row: parseInt(m[2], 10) }
}

function parseRange(ref: string): { c1: number; r1: number; c2: number; r2: number } | null {
  const [a, b] = ref.split(':')
  const p1 = parseCellRef(a)
  const p2 = b ? parseCellRef(b) : p1
  if (!p1 || !p2) return null
  return {
    c1: Math.min(p1.col, p2.col),
    r1: Math.min(p1.row, p2.row),
    c2: Math.max(p1.col, p2.col),
    r2: Math.max(p1.row, p2.row),
  }
}

function detectFeatures(names: string[]): string[] {
  const out: string[] = []
  const has = (re: RegExp) => names.some((n) => re.test(n))
  const count = (re: RegExp) => names.filter((n) => re.test(n)).length
  if (has(/^xl\/connections\.xml$/) || has(/^xl\/queryTables\//)) {
    const n = count(/^xl\/queryTables\/[^/]+\.xml$/)
    out.push(n > 0 ? `${n} live data connection${n === 1 ? '' : 's'} (Power Query)` : 'live data connections')
  }
  if (has(/^xl\/vbaProject\.bin$/)) out.push('macros')
  if (has(/^xl\/pivotTables\//)) out.push('pivot tables')
  if (has(/^xl\/charts\//)) out.push('charts')
  return out
}

export function readWorkbook(bytes: Uint8Array): WorkbookModel {
  if (bytes.length < 4) {
    throw new CheckupError('That file is empty.')
  }
  // Old .xls files and password-protected workbooks are OLE containers, not zips.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new CheckupError(
      'This file is either an old-style .xls workbook or is password-protected. Open it in Excel, remove the password if there is one, and save it as .xlsx.'
    )
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw new CheckupError('That does not look like an Excel .xlsx file.')
  }

  // Pass 1: list the parts and read the small index files.
  const names: string[] = []
  const sizes = new Map<string, number>()
  let index: Record<string, Uint8Array>
  try {
    index = unzipSync(bytes, {
      filter: (f) => {
        names.push(f.name)
        sizes.set(f.name, f.originalSize)
        return (
          (f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels') &&
          f.originalSize < 5 * 1024 * 1024
        )
      },
    })
  } catch {
    throw new CheckupError('That file could not be opened. It may be damaged; try saving it again from Excel as .xlsx.')
  }

  const wbBytes = index['xl/workbook.xml']
  const relBytes = index['xl/_rels/workbook.xml.rels']
  if (!wbBytes || !relBytes) {
    throw new CheckupError('That does not look like an Excel workbook (.xlsx).')
  }

  const wb = parseXml(wbBytes, 'workbook')
  const rels = parseXml(relBytes, 'workbook links')
  const date1904 = ['1', 'true'].includes(String(wb?.workbook?.workbookPr?.['@date1904'] ?? '0'))

  const targets = new Map<string, { target: string; type: string }>()
  for (const r of rels?.Relationships?.Relationship ?? []) {
    targets.set(String(r['@Id']), { target: resolveTarget(String(r['@Target'])), type: String(r['@Type'] ?? '') })
  }

  const sheetEntries: { name: string; hidden: boolean; path: string }[] = []
  for (const s of wb?.workbook?.sheets?.sheet ?? []) {
    const rel = targets.get(String(s['@id']))
    if (!rel || !rel.type.endsWith('/worksheet')) continue // chart sheets, macro sheets
    sheetEntries.push({
      name: String(s['@name']),
      hidden: s['@state'] === 'hidden' || s['@state'] === 'veryHidden',
      path: rel.target,
    })
  }
  if (sheetEntries.length === 0) {
    throw new CheckupError('This workbook has no worksheets to check.')
  }
  if (sheetEntries.length > MAX_SHEETS) {
    throw new CheckupError(`This workbook has ${sheetEntries.length} tabs, which is more than the check-up can handle.`)
  }

  let stringsPath = 'xl/sharedStrings.xml'
  let stylesPath = 'xl/styles.xml'
  for (const rel of targets.values()) {
    if (rel.type.endsWith('/sharedStrings')) stringsPath = rel.target
    if (rel.type.endsWith('/styles')) stylesPath = rel.target
  }

  const wanted = new Set<string>([stringsPath, stylesPath, ...sheetEntries.map((s) => s.path)])
  let unpacked = 0
  for (const w of wanted) unpacked += sizes.get(w) ?? 0
  if (unpacked > MAX_UNPACKED_BYTES) {
    throw new CheckupError('This workbook is too large to check here. Try a copy with fewer rows of history.', 413)
  }

  // Pass 2: read only the parts we need.
  let parts: Record<string, Uint8Array>
  try {
    parts = unzipSync(bytes, { filter: (f) => wanted.has(f.name) })
  } catch {
    throw new CheckupError('That file could not be opened. It may be damaged; try saving it again from Excel as .xlsx.')
  }

  // Shared strings
  const strings: string[] = []
  if (parts[stringsPath]) {
    const sst = parseXml(parts[stringsPath], 'text list')
    for (const si of sst?.sst?.si ?? []) {
      if (si?.t !== undefined) {
        strings.push(text(si.t) ?? '')
      } else if (si?.r) {
        strings.push((si.r as Xml[]).map((run) => text(run?.t) ?? '').join(''))
      } else {
        strings.push('')
      }
    }
  }

  // Styles: number formats per cell style, and fill colours for colour rules
  const styleKinds: ('date' | 'percent' | 'plain')[] = []
  const dxfColors: (string | null)[] = []
  if (parts[stylesPath]) {
    const st = parseXml(parts[stylesPath], 'styles')?.styleSheet
    const custom = new Map<number, string>()
    for (const nf of st?.numFmts?.numFmt ?? []) {
      custom.set(Number(nf['@numFmtId']), String(nf['@formatCode'] ?? ''))
    }
    for (const xf of st?.cellXfs?.xf ?? []) {
      const id = Number(xf['@numFmtId'] ?? 0)
      styleKinds.push(classifyFormat(id, custom.get(id)))
    }
    for (const dxf of st?.dxfs?.dxf ?? []) {
      const fill = dxf?.fill?.patternFill
      const rgb = fill?.bgColor?.['@rgb'] ?? fill?.fgColor?.['@rgb'] ?? dxf?.font?.color?.['@rgb'] ?? null
      dxfColors.push(typeof rgb === 'string' && rgb.length >= 6 ? rgb.slice(-6).toUpperCase() : null)
    }
  }

  const sheets: SheetModel[] = sheetEntries.map((entry, index) =>
    readSheet(entry, index, parts[entry.path], strings, styleKinds, dxfColors, date1904)
  )

  return { sheets, features: detectFeatures(names) }
}

function readSheet(
  entry: { name: string; hidden: boolean; path: string },
  index: number,
  bytes: Uint8Array | undefined,
  strings: string[],
  styleKinds: ('date' | 'percent' | 'plain')[],
  dxfColors: (string | null)[],
  date1904: boolean
): SheetModel {
  const sheet: SheetModel = {
    name: entry.name,
    index,
    hidden: entry.hidden,
    columns: new Map(),
    maxRow: 0,
    maxCol: 0,
    conditionalFormats: [],
    truncated: false,
  }
  if (!bytes) return sheet

  const ws = parseXml(bytes, `tab "${entry.name}"`)?.worksheet
  const rows: Xml[] = ws?.sheetData?.row ?? []

  const shared = new Map<string, { toks: PTok[]; col: number }>()
  const arrayBlocks: { c1: number; r1: number; c2: number; r2: number; toks: PTok[] }[] = []

  let rowNum = 0
  let rowsRead = 0
  for (const row of rows) {
    rowNum = row['@r'] ? parseInt(String(row['@r']), 10) : rowNum + 1
    if (++rowsRead > MAX_ROWS_PER_SHEET) {
      sheet.truncated = true
      break
    }
    let colNum = 0
    for (const c of (row.c as Xml[] | undefined) ?? []) {
      const ref = c['@r'] ? parseCellRef(String(c['@r'])) : null
      colNum = ref ? ref.col : colNum + 1
      const r = ref ? ref.row : rowNum

      const t = c['@t'] ? String(c['@t']) : 'n'
      const rawV = text(c.v)
      let type: Cell['type'] = 'n'
      let display: string | null = null

      if (t === 's') {
        type = 's'
        display = rawV !== null && rawV !== '' ? strings[parseInt(rawV, 10)] ?? '' : null
      } else if (t === 'str') {
        type = 's'
        display = rawV
      } else if (t === 'inlineStr') {
        type = 's'
        const is = c.is
        display = is?.t !== undefined ? text(is.t) : is?.r ? (is.r as Xml[]).map((run) => text(run?.t) ?? '').join('') : null
      } else if (t === 'b') {
        type = 'b'
        display = rawV === null || rawV === '' ? null : rawV === '1' ? 'TRUE' : 'FALSE'
      } else if (t === 'e') {
        type = 'e'
        display = rawV
      } else if (t === 'd') {
        type = 'd'
        display = rawV
      } else if (rawV !== null && rawV !== '') {
        const kind = styleKinds[c['@s'] ? parseInt(String(c['@s']), 10) : 0] ?? 'plain'
        type = kind === 'date' ? 'd' : 'n'
        display = formatNumber(rawV, kind, date1904)
      }
      if (display === '') display = null

      let toks: PTok[] | undefined
      const f = c.f
      if (f !== undefined && f !== null) {
        const ft = text(f) ?? ''
        const ftype = typeof f === 'object' ? String(f['@t'] ?? '') : ''
        const si = typeof f === 'object' && f['@si'] !== undefined ? String(f['@si']) : null
        const fref = typeof f === 'object' && f['@ref'] ? String(f['@ref']) : null

        if (ftype === 'shared' && si !== null) {
          if (ft !== '') {
            toks = parseFormula(ft, r)
            shared.set(si, { toks, col: colNum })
          } else {
            const master = shared.get(si)
            if (master) toks = shiftColumns(master.toks, colNum - master.col)
          }
        } else if (ftype === 'array' && fref && fref.includes(':')) {
          // One formula filling a block of cells: every cell in the block counts as that formula.
          toks = [{ t: 'other', v: `{${ft}}` }]
          const range = parseRange(fref)
          if (range) arrayBlocks.push({ ...range, toks })
        } else if (ft !== '') {
          toks = parseFormula(ft, r)
        }
      }
      if (!toks) {
        const block = arrayBlocks.find((b) => colNum >= b.c1 && colNum <= b.c2 && r >= b.r1 && r <= b.r2)
        if (block) toks = block.toks
      }

      const cell: Cell = toks
        ? { row: r, col: colNum, kind: 'formula', type, display, toks, pkey: patternKey(toks) }
        : { row: r, col: colNum, kind: display === null ? 'empty' : 'value', type, display }

      if (cell.kind === 'empty') continue // styled but blank: same as no cell at all

      let column = sheet.columns.get(colNum)
      if (!column) {
        column = new Map()
        sheet.columns.set(colNum, column)
      }
      column.set(r, cell)
      if (r > sheet.maxRow) sheet.maxRow = r
      if (colNum > sheet.maxCol) sheet.maxCol = colNum
    }
  }

  // Colour rules
  for (const cf of (ws?.conditionalFormatting as Xml[] | undefined) ?? []) {
    const ranges = String(cf['@sqref'] ?? '')
      .split(/\s+/)
      .map((s) => parseRange(s))
      .filter((x): x is NonNullable<typeof x> => x !== null)
    if (ranges.length === 0) continue
    const anchor = ranges[0]
    const rules: CfRule[] = []
    for (const rule of (cf.cfRule as Xml[] | undefined) ?? []) {
      const formulas = ((rule.formula as Xml[] | undefined) ?? []).map((x) => text(x) ?? '')
      const dxfId = rule['@dxfId'] !== undefined ? parseInt(String(rule['@dxfId']), 10) : -1
      rules.push({
        type: String(rule['@type'] ?? ''),
        operator: String(rule['@operator'] ?? ''),
        formulas,
        // Anchor rows and columns so the same rule on another block compares equal.
        formulaKeys: formulas.map((x) => patternKey(shiftColumns(parseFormula(x, anchor.r1), 5000 - anchor.c1))),
        color: dxfId >= 0 ? dxfColors[dxfId] ?? null : null,
      })
    }
    if (rules.length > 0) sheet.conditionalFormats.push({ ranges, rules } as CfBlock)
  }

  return sheet
}
