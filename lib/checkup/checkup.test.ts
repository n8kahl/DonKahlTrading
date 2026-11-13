import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { CheckupError, checkWorkbook, readWorkbook } from './index'
import type { Finding } from './types'
import { buildSyntheticWorkbook } from './testing/synthetic-workbook'

const result = checkWorkbook(buildSyntheticWorkbook())
const all = [...result.problems, ...result.questions]

function find(kind: Finding['kind'], letter: string): Finding {
  const f = all.find((x) => x.kind === kind && x.columns.some((c) => c.letter === letter))
  if (!f) throw new Error(`no ${kind} finding for column ${letter}; got ${all.map((x) => x.id).join(', ')}`)
  return f
}

describe('synthetic workbook: every planted fault is found', () => {
  it('(c) a lookup that reads the date from 7 rows up, judged against its sister columns', () => {
    const f = find('offset', 'C')
    expect(f.sheet).toBe('Model')
    expect(f.rows).toEqual([{ from: 10, to: 41 }])
    expect(f.cellCount).toBe(32)
    expect(f.detail).toMatchObject({ readColumn: 'A', rowsOff: -7, evidence: 'siblings' })
    expect(f.title).toContain('7 rows up')
    expect(f.examples[0]).toMatchObject({ cell: 'C10' })
    expect(f.formulaBefore).toContain('MATCH($A3,')
    expect(f.formulaSuggested).toContain('MATCH($A10,')
    expect(f.examples.length).toBeLessThanOrEqual(3)
    expect(f.examples.every((e) => e.value !== undefined && e.suggested !== null)).toBe(true)
  })

  it('(c) single cells pointing one and two rows off from the rest of their column', () => {
    const h = find('offset', 'H')
    expect(h.rows).toEqual([{ from: 15, to: 15 }])
    expect(h.detail).toMatchObject({ readColumn: 'B', rowsOff: -1, evidence: 'neighbours' })
    expect(h.formulaSuggested).toBe('=IF(B15="","",IF(B15<=0.9*MAX(B$2:B15),"LOW",""))')
    const i = find('offset', 'I')
    expect(i.rows).toEqual([{ from: 16, to: 16 }])
    expect(i.detail).toMatchObject({ readColumn: 'C', rowsOff: -2 })
  })

  it('(b) blank cells inside a column of formulas', () => {
    const f = find('empty', 'E')
    expect(f.rows).toEqual([{ from: 20, to: 24 }])
    expect(f.formulaBefore).toBeNull()
    expect(f.formulaSuggested).toBe('=IF(OR(B20="",B19=""),"",B20/B19-1)')
    expect(f.examples[0]).toMatchObject({ cell: 'E20', value: null })
  })

  it('(a) a few rows that use a different formula from an otherwise uniform column', () => {
    const f = find('inconsistent', 'D')
    expect(f.rows).toEqual([{ from: 2, to: 4 }])
    expect(f.cellCount).toBe(3)
    expect(f.formulaBefore).toContain('VLOOKUP(')
    // The suggested fix is the formula the other 37 rows use, written for this row
    expect(f.formulaSuggested).toBe('=IFERROR(INDEX(Data!$D$2:$D$200,MATCH($A2,Data!$A$2:$A$200,0)),"")')
  })

  it('rows that differ only by plus or minus are asked about, never "fixed" towards the majority', () => {
    const q = find('question', 'K')
    expect(q.title).toBe('Should “Net” (column K) add or subtract?')
    expect(q.options!.map((o) => [o.count, o.rows])).toEqual([
      [36, [{ from: 6, to: 41 }]],
      [4, [{ from: 2, to: 5 }]],
    ])
    expect(q.options![0].formula).toContain('+')
    expect(q.options![1].formula).toContain('-')
    expect(q.formulaSuggested).toBeNull()
    expect(q.detail).toMatchObject({ operatorOnly: true })
    expect(result.problems.some((p) => p.columns.some((c) => c.letter === 'K') && p.kind !== 'formatting')).toBe(false)
  })

  it('(a) a typed-in value in a column of formulas', () => {
    const f = find('hardcoded', 'J')
    expect(f.rows).toEqual([{ from: 30, to: 30 }])
    expect(f.examples[0]).toMatchObject({ cell: 'J30', value: 'LOW', formula: null })
  })

  it('(d) a cell showing an Excel error', () => {
    const f = find('error', 'O')
    expect(f.rows).toEqual([{ from: 12, to: 12 }])
    expect(f.examples[0].value).toBe('#DIV/0!')
  })

  it('(e) a colour rule that stops part-way down the column', () => {
    const f = find('formatting', 'N')
    expect(f.rows).toEqual([{ from: 9, to: 41 }])
    expect(f.suggestedRange).toBe('N2:N41')
    expect(f.color).toBe('16A34A')
    // The rule on H is split into two blocks that together cover the column: not a fault.
    expect(all.some((x) => x.kind === 'formatting' && x.columns.some((c) => c.letter === 'H'))).toBe(false)
    expect(all.some((x) => x.kind === 'formatting' && x.columns.some((c) => c.letter === 'K'))).toBe(false)
  })

  it('a column that switches between three formulas', () => {
    const f = find('mixed', 'L')
    expect(f.formulaSuggested).toBeNull()
    expect(f.title).toContain('3 formulas')
  })

  it('(f) a 50/50 split is asked as a question, not reported as a problem', () => {
    expect(result.questions).toHaveLength(2)
    const q = find('question', 'M')
    expect(q.columns.map((c) => c.letter)).toEqual(['M'])
    expect(q.options).toHaveLength(2)
    expect(q.options![0].count + q.options![1].count).toBe(40)
    expect(q.options![0].formula).not.toBe(q.options![1].formula)
    // Both choices are written for the same cell so they can be compared
    expect(q.options![0].cell).toBe(q.options![1].cell)
    expect(result.problems.some((p) => p.kind === 'question')).toBe(false)
    expect(result.problems.some((p) => p.columns.some((c) => c.letter === 'M'))).toBe(false)
  })

  it('reports nothing else', () => {
    // 3 wrong-row, 1 blank, 1 error, 1 typed value, 1 inconsistent, 1 mixed, 1 colour rule
    expect(result.problems.map((p) => p.kind).sort()).toEqual(
      ['empty', 'error', 'formatting', 'hardcoded', 'inconsistent', 'mixed', 'offset', 'offset', 'offset'].sort()
    )
    expect(all.every((f) => f.sheet === 'Model')).toBe(true)
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length)
  })

  it('lists problems most serious first', () => {
    const order = result.problems.map((p) => p.severity)
    expect(order).toEqual([...order].sort((a, b) => ['high', 'medium', 'low'].indexOf(a) - ['high', 'medium', 'low'].indexOf(b)))
  })

  it('describes the structure without the data', () => {
    const model = result.structure.sheets.find((s) => s.name === 'Model')!
    expect(model.headerRow).toBe(1)
    expect(model.hasFormulas).toBe(true)
    expect(model.columns.find((c) => c.letter === 'A')).toMatchObject({ header: 'Date', holds: 'dates' })
    expect(model.columns.find((c) => c.letter === 'B')).toMatchObject({ header: 'Price A', holds: 'formulas' })
    // A filled-down ("shared") formula is expanded for every row
    expect(model.columns.find((c) => c.letter === 'G')!.formulas[0].rows).toBe(39)
    const data = result.structure.sheets.find((s) => s.name === 'Data')!
    expect(data.hasFormulas).toBe(false)
  })
})

describe('start-up rows', () => {
  it('does not call a shorter look-back window at the top of a column a slip', () => {
    // Column B holds a 5-row rolling sum; rows 2-5 cannot look back 5 rows, so their window starts at row 2.
    const rows = ['<row r="1"><c r="A1" t="inlineStr"><is><t>Value</t></is></c><c r="B1" t="inlineStr"><is><t>Sum of 5</t></is></c></row>']
    for (let r = 2; r <= 40; r++) {
      const from = Math.max(2, r - 4)
      rows.push(`<row r="${r}"><c r="A${r}"><v>${r}</v></c><c r="B${r}"><f>SUM(A${from}:A${r})</f><v>0</v></c></row>`)
    }
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    const bytes = zipSync({
      'xl/workbook.xml': strToU8(`<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(`<worksheet ${NS}><sheetData>${rows.join('')}</sheetData></worksheet>`),
    })
    const found = checkWorkbook(bytes)
    expect(found.problems).toEqual([])
    expect(found.questions).toEqual([])
  })
})

describe('clean workbooks', () => {
  it('finds nothing in the same workbook without the faults', () => {
    const clean = checkWorkbook(buildSyntheticWorkbook({ clean: true }))
    expect(clean.problems).toEqual([])
    expect(clean.questions).toEqual([])
  })
})

describe('committed sample file', () => {
  it('matches the generator (re-run scripts/make-checkup-fixture.ts if this fails)', () => {
    const path = join(__dirname, '..', '..', 'fixtures', 'spreadsheet-checkup-sample.xlsx')
    const fromDisk = checkWorkbook(new Uint8Array(readFileSync(path)))
    expect(fromDisk.problems.map((p) => p.id)).toEqual(result.problems.map((p) => p.id))
    expect(fromDisk.questions.map((p) => p.id)).toEqual(result.questions.map((p) => p.id))
  })
})

describe('files that are not usable workbooks', () => {
  it('rejects non-zip bytes with a plain message', () => {
    expect(() => readWorkbook(strToU8('just some text, not a spreadsheet'))).toThrow(CheckupError)
  })

  it('rejects old-style or password-protected workbooks', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])
    expect(() => readWorkbook(ole)).toThrow(/password|\.xls/)
  })

  it('rejects a zip that is not a workbook', () => {
    expect(() => readWorkbook(zipSync({ 'hello.txt': strToU8('hi') }))).toThrow(CheckupError)
  })
})

// The real audited workbook is private and is not in the repository. To run this
// check locally:  CHECKUP_REAL_WORKBOOK=/path/to/Nasdaq_Tracker_New_Copy.xlsx npx vitest run lib/checkup
const realPath = process.env.CHECKUP_REAL_WORKBOOK
describe.skipIf(!realPath || !existsSync(realPath))('audited workbook (local only)', () => {
  const real = realPath && existsSync(realPath) ? checkWorkbook(new Uint8Array(readFileSync(realPath))) : null
  const everything = real ? [...real.problems, ...real.questions] : []
  const has = (kind: Finding['kind'], letter: string, from: number, to: number) =>
    everything.some(
      (f) => f.kind === kind && f.columns.some((c) => c.letter === letter) && f.rows.some((r) => r.from === from && r.to === to)
    )

  it('finds the six audited faults', () => {
    // 1. price lookup reading the date 7 rows above, from row 14 on
    expect(has('offset', 'D', 14, 783)).toBe(true)
    expect(everything.find((f) => f.kind === 'offset' && f.columns[0].letter === 'D')!.detail).toMatchObject({ rowsOff: -7 })
    // 2. 33 formula cells deleted to empty
    expect(has('empty', 'E', 488, 520)).toBe(true)
    // 3. two cells pointing one and two rows off
    expect(has('offset', 'O', 13, 13)).toBe(true)
    expect(has('offset', 'P', 14, 14)).toBe(true)
    // 4. different formulas for the same calculation, asked as a question
    expect(real!.questions.some((q) => q.columns.map((c) => c.letter).join('') === 'CEG')).toBe(true)
    // 5. "net" columns where a few rows subtract and the rest add: asked, not auto-corrected
    const net = real!.questions.find((q) => q.detail?.operatorOnly === true)!
    expect(net.columns.map((c) => c.letter).join('')).toBe('HIJ')
    expect(net.options!.find((o) => o.label.startsWith('Subtract'))!.rows).toEqual([{ from: 2, to: 11 }])
    // 6. colour rule covering rows 2 to 11 of 783
    expect(has('formatting', 'Q', 12, 783)).toBe(true)
  })

  it('finds nothing on the data tabs', () => {
    expect(new Set(everything.map((f) => f.sheet))).toEqual(new Set(['Market Signal']))
  })
})
