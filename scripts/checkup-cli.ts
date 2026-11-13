// Run the spreadsheet check-up on a local file and print what it finds.
//   npx tsx scripts/checkup-cli.ts path/to/workbook.xlsx [--json] [--explain]
// --explain also asks Claude for the plain-language wording (needs ANTHROPIC_API_KEY).
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { checkWorkbook } from '../lib/checkup'
import { baseResult, explainCheckup } from '../lib/checkup/explain'

const path = process.argv[2]
if (!path) {
  console.error('usage: checkup-cli <workbook.xlsx> [--json] [--explain]')
  process.exit(1)
}
async function main(path: string) {
const started = Date.now()
const bytes = new Uint8Array(readFileSync(path))
let result = baseResult(basename(path), bytes.length, checkWorkbook(bytes))
if (process.argv.includes('--explain')) {
  result = await explainCheckup(result)
  console.log(`AI wording: ${result.explainedByAI ? 'yes' : `no (${result.aiNote})`}\n\n${result.summary}\n`)
  for (const s of result.structure.sheets) for (const c of s.columns) console.log(`  ${s.name} ${c.letter}: ${c.description}`)
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else {
  for (const s of result.structure.sheets) {
    console.log(`TAB ${s.name}: ${s.rows} rows, ${s.columns.length} columns, formulas: ${s.hasFormulas}`)
  }
  console.log(`\n${result.problems.length} problems, ${result.questions.length} questions (${Date.now() - started} ms)\n`)
  for (const f of [...result.problems, ...result.questions]) {
    console.log(`[${f.severity}/${f.kind}] ${f.sheet} :: ${f.title}`)
    console.log(`    ${f.explanation}`)
    if (f.caution) console.log(`    ! ${f.caution}`)
    if (f.formulaBefore) console.log(`    before:    ${f.formulaBefore.slice(0, 160)}`)
    if (f.formulaSuggested) console.log(`    suggested: ${f.formulaSuggested.slice(0, 160)}`)
    if (f.options) for (const o of f.options) console.log(`    option ${o.key}: ${o.label} (${o.count}) ${o.formula.slice(0, 120)}`)
    if (f.suggestedRange) console.log(`    extend to: ${f.suggestedRange} colour ${f.color}`)
    console.log(`    cells: ${f.cellCount} (${f.cellsWithValues} showing a value); e.g. ${f.examples.map((e) => `${e.cell}=${e.value}`).join(', ')}`)
  }
}
}

void main(path)
