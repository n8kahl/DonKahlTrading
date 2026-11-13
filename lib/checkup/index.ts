// =============================================================================
// Spreadsheet check-up - entry point for the deterministic part
// =============================================================================

import { analyzeWorkbook, type Analysis } from './analyze'
import { readWorkbook } from './xlsx'

export { analyzeWorkbook, type Analysis } from './analyze'
export { readWorkbook, CheckupError, MAX_UPLOAD_BYTES } from './xlsx'
export type * from './types'

/** Read a workbook's bytes and run every check. Pure: no disk, no network. */
export function checkWorkbook(bytes: Uint8Array): Analysis {
  return analyzeWorkbook(readWorkbook(bytes))
}
