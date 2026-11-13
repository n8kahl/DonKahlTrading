import { describe, expect, it } from 'vitest'
import {
  diffOffsets,
  numToCol,
  colToNum,
  parseFormula,
  patternKey,
  relativeOffsets,
  renderFormula,
  shapeKey,
  shiftColumns,
  singleOperatorDiff,
  skeletonKey,
  withOffsets,
} from './formula'

const key = (f: string, row: number) => patternKey(parseFormula(f, row))

describe('column letters', () => {
  it('round-trips', () => {
    expect(colToNum('A')).toBe(1)
    expect(colToNum('Z')).toBe(26)
    expect(colToNum('AA')).toBe(27)
    expect(numToCol(27)).toBe('AA')
    expect(numToCol(colToNum('XFD'))).toBe('XFD')
  })
})

describe('row-relative patterns', () => {
  it('gives the same pattern to a formula filled down a column', () => {
    expect(key('IF(B5="","",B5/B4-1)', 5)).toBe(key('IF(B90="","",B90/B89-1)', 90))
  })

  it('tells apart a formula that reads a different row', () => {
    expect(key('IF(F12="","",F12*2)', 14)).not.toBe(key('IF(F15="","",F15*2)', 15))
    // ...but the two have the same shape: only the rows they read differ
    expect(shapeKey(parseFormula('IF(F12="","",F12*2)', 14))).toBe(shapeKey(parseFormula('IF(F15="","",F15*2)', 15)))
  })

  it('keeps absolute rows fixed and relative rows moving', () => {
    expect(key('MAX(B$2:B14)', 14)).toBe(key('MAX(B$2:B700)', 700))
    expect(key('MAX(B$2:B14)', 14)).not.toBe(key('MAX(B$3:B14)', 14))
  })

  it('handles sheet names, whole columns and text that looks like a cell', () => {
    const f = `IFERROR(_xlfn.XLOOKUP($A7,'Nasdaq Data'!$A:$A,'Nasdaq Data'!$B:$B,"A1"),"")`
    const toks = parseFormula(f, 7)
    expect(renderFormula(toks, 7)).toBe(f)
    expect(renderFormula(toks, 30)).toBe(f.replace('$A7', '$A30'))
    // "A1" inside quotes is text, not a reference
    expect(relativeOffsets(toks)).toEqual([0])
  })

  it('does not mistake function names for cells', () => {
    const toks = parseFormula('LOG10(A2)+ATAN2(B2,C2)+SUM(Sheet2!D2:D9)', 2)
    expect(toks.filter((t) => t.t === 'func').map((t) => (t as { v: string }).v)).toEqual(['LOG10', 'ATAN2', 'SUM'])
    expect(relativeOffsets(toks)).toEqual([0, 0, 0, 0, 7])
  })

  it('writes a formula back exactly as it was read', () => {
    const samples = [
      'IF(C14="","",COUNTIF(INDEX(C:C,IFERROR(_xlfn.AGGREGATE(14,6,ROW(C$3:C14)/(ISNUMBER(C$3:C14)),10),3)):C14,">=2.5%"))',
      'IF(B14="","",ROW()-LOOKUP(2,1/(B$2:B14=MAX(B$2:B14)),ROW(B$2:B14)))',
      'SUM($1:$3)+A1*{1,2;3,4}+Table1[Total]+[@Price]',
      '"He said ""A1"""&A1',
    ]
    for (const s of samples) expect(renderFormula(parseFormula(s, 14), 14)).toBe(s)
  })

  it('renders #REF! when a pattern would read above row 1', () => {
    expect(renderFormula(parseFormula('B5/B4-1', 5), 1)).toBe('B1/#REF!-1')
  })
})

describe('comparing patterns', () => {
  it('matches columns that do the same job on different inputs', () => {
    const b = parseFormula("IFERROR(INDEX('Nasdaq Data'!$B$2:$B$20001,MATCH($A14,'Nasdaq Data'!$A$2:$A$20001,0)),\"\")", 14)
    const d = parseFormula("IFERROR(INDEX('PHLX SOX DATA'!$B$2:$B$10001,MATCH($A7,'PHLX SOX DATA'!$A$2:$A$10001,0)),\"\")", 14)
    expect(skeletonKey(b)).toBe(skeletonKey(d))
    expect(relativeOffsets(b)).toEqual([0])
    expect(relativeOffsets(d)).toEqual([-7])
    const fixed = withOffsets(d, [0])
    expect(renderFormula(fixed, 14)).toContain('MATCH($A14,')
    expect(diffOffsets(d, fixed)).toEqual([{ column: 'A', sheet: '', delta: -7 }])
  })

  it('spots formulas that differ by a single plus or minus', () => {
    const add = parseFormula('COUNTIF(C5:C14,">0")+COUNTIF(C5:C14,"<0")', 14)
    const sub = parseFormula('COUNTIF(C2:C3,">0")-COUNTIF(C2:C3,"<0")', 2)
    expect(singleOperatorDiff(sub, add)).toEqual({ from: '-', to: '+' })
    expect(singleOperatorDiff(add, parseFormula('SUM(C5:C14)', 14))).toBeNull()
  })

  it('shifts relative columns for shared formulas that run sideways', () => {
    const toks = shiftColumns(parseFormula('B2+$A2', 2), 2)
    expect(renderFormula(toks, 2)).toBe('D2+$A2')
  })
})
