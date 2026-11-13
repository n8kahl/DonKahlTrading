// =============================================================================
// Spreadsheet check-up - synthetic test workbook
//
// Builds a small, made-up .xlsx in memory that reproduces each kind of fault
// the check-up looks for. Used by the tests and written to
// fixtures/spreadsheet-checkup-sample.xlsx so the page can be tried by hand.
// No real data is involved.
//
//   Tab "Model" (rows 2-41), faults planted:
//     C  Price B     rows 10-41 look the date up from 7 rows above        (c, across columns)
//     D  Price C     rows 2-4 use a different lookup from the other 37    (a)
//     E  Change A    rows 20-24 deleted to blank                          (b)
//     H  Low A       row 15 reads the price from 1 row above              (c, within column)
//     I  Low B       row 16 reads the price from 2 rows above             (c, within column)
//     J  Low C       row 30 has a typed-in value                          (a, typed value)
//     K  Net         rows 2-5 subtract, the other 36 rows add             (a question: + or -)
//     L  Score       three different formulas, none in the majority       (mixed)
//     M  Smoothed    two formulas, 20 rows each                           (f, a question)
//     N  Signal      colour rule covers rows 2-8 only                     (e)
//     O  Ratio       row 12 shows #DIV/0!                                 (d)
//   Clean on purpose: B, F, G (a shared formula), and the colour rules on
//   H (split into two blocks that together cover the column) and K.
//   Tab "Data": typed-in dates and prices with a few blanks. No findings.
// =============================================================================

import { strToU8, zipSync } from 'fflate'

const FIRST = 2
const LAST = 41

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function col(n: number): string {
  return String.fromCharCode(64 + n)
}

interface CellSpec {
  f?: string
  /** Shared-formula attributes, e.g. ' t="shared" ref="G3:G41" si="0"'. */
  fAttrs?: string
  v?: string | number
  t?: 'n' | 'str' | 'e' | 's'
  s?: number
}

function cellXml(ref: string, c: CellSpec): string {
  const attrs = `${c.s !== undefined ? ` s="${c.s}"` : ''}${c.t && c.t !== 'n' ? ` t="${c.t}"` : ''}`
  const f = c.f !== undefined || c.fAttrs ? `<f${c.fAttrs ?? ''}${c.f !== undefined ? `>${esc(c.f)}</f>` : '/>'}` : ''
  const v = c.v !== undefined ? `<v>${esc(String(c.v))}</v>` : ''
  return `<c r="${ref}"${attrs}>${f}${v}</c>`
}

export interface SyntheticOptions {
  /** Leave the faults out, to check that a clean workbook produces no findings. */
  clean?: boolean
}

export function buildSyntheticWorkbook(options: SyntheticOptions = {}): Uint8Array {
  const faulty = !options.clean

  // --- Data tab: 60 days of made-up prices, a few blanks ------------------------------
  const baseDate = 45658 // 1 Jan 2025 as an Excel day number
  const dataRows: string[] = []
  const price = { b: new Map<number, number>(), c: new Map<number, number>(), d: new Map<number, number>() }
  dataRows.push(
    `<row r="1">${cellXml('A1', { t: 's', v: 0 })}${cellXml('B1', { t: 's', v: 1 })}${cellXml('C1', { t: 's', v: 2 })}${cellXml('D1', { t: 's', v: 3 })}</row>`
  )
  for (let i = 0; i < 60; i++) {
    const r = i + 2
    const date = baseDate + i
    const holiday = i === 17 || i === 33
    const b = Math.round((100 + i * 0.8 + Math.sin(i / 3) * 4) * 100) / 100
    const c = Math.round((200 + i * 1.1 + Math.cos(i / 4) * 6) * 100) / 100
    const d = Math.round((50 + i * 0.3 + Math.sin(i / 5) * 2) * 100) / 100
    let cells = cellXml(`A${r}`, { v: date, s: 1 })
    if (!holiday) {
      price.b.set(date, b)
      price.c.set(date, c)
      price.d.set(date, d)
      cells += cellXml(`B${r}`, { v: b }) + cellXml(`C${r}`, { v: c }) + cellXml(`D${r}`, { v: d })
    }
    dataRows.push(`<row r="${r}">${cells}</row>`)
  }

  // --- Model tab -----------------------------------------------------------------------
  const headers = ['Date', 'Price A', 'Price B', 'Price C', 'Change A', 'Change B', 'Change C', 'Low A', 'Low B', 'Low C', 'Net', 'Score', 'Smoothed', 'Signal', 'Ratio']
  const lookup = (dataCol: string, keyRow: number) =>
    `IFERROR(INDEX(Data!$${dataCol}$2:$${dataCol}$200,MATCH($A${keyRow},Data!$A$2:$A$200,0)),"")`
  const change = (c: string, r: number) => `IF(OR(${c}${r}="",${c}${r - 1}=""),"",${c}${r}/${c}${r - 1}-1)`
  const low = (c: string, r: number) => `IF(${c}${r}="","",IF(${c}${r}<=0.9*MAX(${c}$2:${c}${r}),"LOW",""))`

  const rows: string[] = []
  rows.push(`<row r="1">${headers.map((_, i) => cellXml(`${col(i + 1)}1`, { t: 's', v: 4 + i })).join('')}</row>`)

  const dateOf = (r: number) => baseDate + (r - FIRST)
  const val = (m: Map<number, number>, r: number): number | '' => m.get(dateOf(r)) ?? ''
  const num = (x: number | ''): CellSpec => (x === '' ? { t: 'str', v: '' } : { v: x })

  for (let r = FIRST; r <= LAST; r++) {
    const cells: string[] = []
    const b = val(price.b, r)
    const cWrong = faulty && r >= 10
    const c = val(price.c, cWrong ? r - 7 : r)
    const d = val(price.d, r)
    const prev = (m: Map<number, number>, row: number) => (row > FIRST ? val(m, row - 1) : '')
    const chg = (now: number | '', before: number | '') => (now === '' || before === '' ? '' : Math.round((now / before - 1) * 1e6) / 1e6)

    cells.push(cellXml(`A${r}`, { v: dateOf(r), s: 1 }))
    cells.push(cellXml(`B${r}`, { f: lookup('B', r), ...num(b) }))
    cells.push(cellXml(`C${r}`, { f: lookup('C', cWrong ? r - 7 : r), ...num(c) }))
    const dOld = faulty && r <= 4
    cells.push(cellXml(`D${r}`, { f: dOld ? `IFERROR(VLOOKUP($A${r},Data!$A$2:$D$200,4,FALSE),"")` : lookup('D', r), ...num(d) }))

    // E: change in A, with a block deleted
    const e = r === FIRST ? '' : chg(b, prev(price.b, r))
    if (!(faulty && r >= 20 && r <= 24)) {
      cells.push(cellXml(`E${r}`, { f: r === FIRST ? '""' : change('B', r), ...num(e), s: 2 }))
    }
    // F: change in B
    const f = r === FIRST ? '' : chg(c, val(price.c, (cWrong ? r - 7 : r) - 1))
    cells.push(cellXml(`F${r}`, { f: r === FIRST ? '""' : change('C', r), ...num(f), s: 2 }))
    // G: change in C, stored the way Excel stores a filled-down formula
    const g = r === FIRST ? '' : chg(d, prev(price.d, r))
    if (r === FIRST) cells.push(cellXml(`G${r}`, { f: '""', t: 'str', v: '', s: 2 }))
    else if (r === FIRST + 1) cells.push(cellXml(`G${r}`, { f: change('D', r), fAttrs: ` t="shared" ref="G3:G${LAST}" si="0"`, ...num(g), s: 2 }))
    else cells.push(cellXml(`G${r}`, { fAttrs: ' t="shared" si="0"', ...num(g), s: 2 }))

    // H, I: "low" flags, each with one cell pointing at the wrong row
    cells.push(cellXml(`H${r}`, { f: low('B', faulty && r === 15 ? 14 : r), t: 'str', v: '' }))
    cells.push(cellXml(`I${r}`, { f: low('C', faulty && r === 16 ? 14 : r), t: 'str', v: '' }))
    // J: one typed-in value
    if (faulty && r === 30) cells.push(cellXml(`J${r}`, { t: 'str', v: 'LOW' }))
    else cells.push(cellXml(`J${r}`, { f: low('D', r), t: 'str', v: '' }))

    // K: "Net" adds on most rows and subtracts on a few
    const up = (x: number | '') => (x !== '' && x > 0 ? 1 : 0)
    const subtract = faulty && r <= 5
    cells.push(
      cellXml(`K${r}`, {
        f: `IF(F${r}="","",(F${r}>0)${subtract ? '-' : '+'}(G${r}>0))`,
        ...num(f === '' ? '' : subtract ? up(f) - up(g) : up(f) + up(g)),
      })
    )

    // L: three ways of doing the same sum
    const lFormula = !faulty || r <= 14 ? `ROUND(F${r}*100,1)` : r <= 27 ? `ROUND(F${r}*100,2)` : `INT(F${r}*1000)/10`
    cells.push(cellXml(`L${r}`, { f: `IF(F${r}="","",${lFormula})`, ...num(f === '' ? '' : Math.round(f * 1000) / 10) }))

    // M: two ways of smoothing, half the column each
    const mFormula = !faulty || r <= 21 ? `IF(D${r}="","",AVERAGE(D$2:D${r}))` : `IF(D${r}="","",D${r})`
    cells.push(cellXml(`M${r}`, { f: mFormula, ...num(d) }))

    // N: signal text
    const signal = b !== '' && d !== '' && b > 110 ? 'GO' : 'WAIT'
    cells.push(cellXml(`N${r}`, { f: `IF(B${r}>110,"GO","WAIT")`, t: 'str', v: signal }))

    // O: ratio, one cell showing an error
    if (faulty && r === 12) cells.push(cellXml(`O${r}`, { f: `IF(D${r}="","",B${r}/D${r})`, t: 'e', v: '#DIV/0!' }))
    else cells.push(cellXml(`O${r}`, { f: `IF(D${r}="","",B${r}/D${r})`, ...num(b === '' || d === '' ? '' : Math.round((b / d) * 1e4) / 1e4) }))

    rows.push(`<row r="${r}">${cells.join('')}</row>`)
  }

  const rule = (formula: string, dxf: number, priority: number) =>
    `<cfRule type="expression" dxfId="${dxf}" priority="${priority}"><formula>${esc(formula)}</formula></cfRule>`
  const colourRules = [
    // H: one rule chopped into two blocks that together cover the whole column (fine)
    `<conditionalFormatting sqref="H2:H20">${rule('H2="LOW"', 1, 1)}</conditionalFormatting>`,
    `<conditionalFormatting sqref="H21:H${LAST}">${rule('H21="LOW"', 1, 2)}</conditionalFormatting>`,
    // K: covers the whole column (fine)
    `<conditionalFormatting sqref="K2:K${LAST}">${rule('K2>=2', 0, 3)}</conditionalFormatting>`,
    // N: stops after row 8 (fault)
    `<conditionalFormatting sqref="N2:N${faulty ? 8 : LAST}">${rule('N2="GO"', 0, 4)}${rule('N2="WAIT"', 1, 5)}</conditionalFormatting>`,
  ].join('')

  const strings = ['date', 'series_a', 'series_b', 'series_c', ...headers]

  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  const files: Record<string, string> = {
    '[Content_Types].xml': `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    '_rels/.rels': `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${DECL}<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Model" sheetId="1" r:id="rId1"/><sheet name="Data" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    'xl/styles.xml': `${DECL}<styleSheet ${NS}><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><dxfs count="2"><dxf><fill><patternFill patternType="solid"><bgColor rgb="FF16A34A"/></patternFill></fill></dxf><dxf><fill><patternFill patternType="solid"><bgColor rgb="FFDC2626"/></patternFill></fill></dxf></dxfs></styleSheet>`,
    'xl/sharedStrings.xml': `${DECL}<sst ${NS} count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `${DECL}<worksheet ${NS}><dimension ref="A1:O${LAST}"/><sheetData>${rows.join('')}</sheetData>${colourRules}</worksheet>`,
    'xl/worksheets/sheet2.xml': `${DECL}<worksheet ${NS}><dimension ref="A1:D61"/><sheetData>${dataRows.join('')}</sheetData></worksheet>`,
  }

  const entries: Record<string, [Uint8Array, { mtime: Date }]> = {}
  // A fixed timestamp keeps the generated file byte-for-byte reproducible.
  const mtime = new Date(2026, 0, 1, 12, 0, 0)
  for (const [name, content] of Object.entries(files)) {
    entries[name] = [strToU8(content), { mtime }]
  }
  return zipSync(entries, { level: 6 })
}
