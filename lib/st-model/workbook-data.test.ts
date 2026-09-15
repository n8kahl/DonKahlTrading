import { describe, expect, it } from 'vitest'
import { resolveWorkbookProviderSymbol } from './workbook-data'

describe('resolveWorkbookProviderSymbol', () => {
  it('uses the Massive index namespace for workbook IXF', () => {
    expect(resolveWorkbookProviderSymbol('IXF')).toBe('I:IXF')
    expect(resolveWorkbookProviderSymbol('ixf')).toBe('I:IXF')
  })

  it('leaves ordinary stock and ETF tickers unchanged', () => {
    expect(resolveWorkbookProviderSymbol('SPY')).toBe('SPY')
    expect(resolveWorkbookProviderSymbol('QQQ')).toBe('QQQ')
  })

  it('does not invent a provider alias for NYA', () => {
    expect(resolveWorkbookProviderSymbol('NYA')).toBe('NYA')
  })
})
