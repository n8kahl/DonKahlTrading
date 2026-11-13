// =============================================================================
// Spreadsheet check-up - workbook parts
//
// An .xlsx file is a zip of parts (sheets, styles, data connections, ...). A
// safe repair changes only the parts it has to. These helpers fingerprint every
// part so a repaired copy can be compared with the original.
// =============================================================================

import { createHash } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'
import { CheckupError } from './xlsx'

export interface PartFingerprint {
  name: string
  size: number
  sha256: string
}

const MAX_TOTAL_UNPACKED = 400 * 1024 * 1024

function unzipAll(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0
  try {
    return unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize
        if (total > MAX_TOTAL_UNPACKED) throw new Error('too large')
        return !f.name.endsWith('/')
      },
    })
  } catch {
    throw new CheckupError('That file could not be opened as an Excel workbook.')
  }
}

/** Name, size and SHA-256 of every part in the workbook, sorted by name. */
export function partManifest(bytes: Uint8Array): PartFingerprint[] {
  const parts = unzipAll(bytes)
  return Object.keys(parts)
    .sort()
    .map((name) => ({
      name,
      size: parts[name].length,
      sha256: createHash('sha256').update(parts[name]).digest('hex'),
    }))
}

export interface PartComparison {
  totalBefore: number
  /** Parts that are byte-for-byte the same in both files. */
  identical: number
  /** Parts present in both files with different content. */
  changed: string[]
  /** Parts in the original that the repaired copy no longer has. */
  missing: string[]
  /** Parts only the repaired copy has. */
  added: string[]
  /** The stale calculation order was removed so Excel rebuilds it. */
  calcChainRemoved: boolean
  /** The workbook is flagged to recalculate everything when Excel opens it. */
  fullCalcOnLoad: boolean
}

/** Parts a repair is expected to drop: Excel rebuilds the calculation chain itself. */
const EXPECTED_MISSING = new Set(['xl/calcChain.xml'])

export function compareParts(before: PartFingerprint[], afterBytes: Uint8Array): PartComparison {
  const afterParts = unzipAll(afterBytes)
  const after = new Map<string, string>()
  for (const [name, data] of Object.entries(afterParts)) {
    after.set(name, createHash('sha256').update(data).digest('hex'))
  }
  const beforeNames = new Set(before.map((p) => p.name))
  const changed: string[] = []
  const missing: string[] = []
  let identical = 0
  for (const p of before) {
    const hash = after.get(p.name)
    if (hash === undefined) {
      if (!EXPECTED_MISSING.has(p.name)) missing.push(p.name)
    } else if (hash === p.sha256) {
      identical++
    } else {
      changed.push(p.name)
    }
  }
  const added = [...after.keys()].filter((n) => !beforeNames.has(n)).sort()
  const workbookXml = afterParts['xl/workbook.xml'] ? strFromU8(afterParts['xl/workbook.xml']) : ''
  return {
    totalBefore: before.length,
    identical,
    changed,
    missing,
    added,
    calcChainRemoved: !after.has('xl/calcChain.xml'),
    fullCalcOnLoad: /<calcPr\b[^>]*\bfullCalcOnLoad="(1|true)"/.test(workbookXml),
  }
}
