// Writes the synthetic check-up workbook to fixtures/spreadsheet-checkup-sample.xlsx.
//   npx tsx scripts/make-checkup-fixture.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSyntheticWorkbook } from '../lib/checkup/testing/synthetic-workbook'

const out = join(__dirname, '..', 'fixtures', 'spreadsheet-checkup-sample.xlsx')
writeFileSync(out, buildSyntheticWorkbook())
console.log(`wrote ${out}`)
