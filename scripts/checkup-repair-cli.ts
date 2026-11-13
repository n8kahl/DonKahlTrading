// Run a full repair on a local workbook from the command line. This starts a paid agent run.
//   npx tsx --env-file=.env.local scripts/checkup-repair-cli.ts <workbook.xlsx> <fixed-out.xlsx> \
//       ["what the owner said"] [--context-file notes.txt] [--screenshot table.png]
//   npx tsx --env-file=.env.local scripts/checkup-repair-cli.ts --follow <job id> <fixed-out.xlsx>
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { checkWorkbook } from '../lib/checkup'
import {
  anthropicClient,
  fixedWorkbook,
  repairStatus,
  runBudgetCents,
  startRepair,
  type RepairReference,
} from '../lib/checkup/repair/job'

const MEDIA: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const VALUE_FLAGS = ['--follow', '--context-file', '--screenshot']

function flag(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1] ?? null
}

function positionals(): string[] {
  const out: string[] = []
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.includes(args[i])) i++
    else out.push(args[i])
  }
  return out
}

async function main() {
  const client = anthropicClient()
  const args = positionals()
  let jobId = flag('--follow')
  let out: string

  if (jobId) {
    out = args[0]
  } else {
    const [path, outPath, complaint = ''] = args
    if (!path || !outPath) {
      console.error(
        'usage: checkup-repair-cli <workbook.xlsx> <fixed-out.xlsx> ["what the owner said"] [--context-file f] [--screenshot f]'
      )
      process.exit(1)
    }
    out = outPath
    const bytes = new Uint8Array(readFileSync(path))
    const analysis = checkWorkbook(bytes)
    const reference: RepairReference = {}
    const contextFile = flag('--context-file')
    if (contextFile) reference.text = readFileSync(contextFile, 'utf8')
    const shot = flag('--screenshot')
    if (shot) {
      reference.image = {
        bytes: new Uint8Array(readFileSync(shot)),
        mediaType: MEDIA[extname(shot).toLowerCase()] ?? 'image/png',
      }
    }
    console.log(
      `first pass: ${analysis.problems.length} problems, ${analysis.questions.length} questions; budget $${(runBudgetCents() / 100).toFixed(2)}`
    )
    const started = await startRepair(client, { bytes, fileName: basename(path), complaint, reference, analysis })
    jobId = started.jobId
    console.log(`job ${jobId}`)
    console.log(`trace: https://platform.claude.com/workspaces/default/sessions/${jobId}`)
  }

  let shown = 0
  let lastStage = ''
  for (;;) {
    const status = await repairStatus(client, jobId)
    if (status.state === 'working') {
      for (const line of status.progress.slice(shown)) console.log(`  [${status.elapsedSeconds}s] ${line}`)
      shown = Math.max(shown, status.progress.length)
      if (status.stage !== lastStage && !status.progress.includes(status.stage)) {
        console.log(`  [${status.elapsedSeconds}s] (${status.stage})`)
      }
      lastStage = status.stage
      await new Promise((r) => setTimeout(r, 10_000))
      continue
    }
    if (status.state === 'failed') {
      console.log(`FAILED (${status.code}): ${status.reason}`)
      process.exit(2)
    }
    const { result } = status
    const cost = result.costCents === null ? '?' : (result.costCents / 100).toFixed(2)
    console.log(`\nDONE in ${result.seconds}s, list cost $${cost}, downloadable: ${result.downloadable}`)
    console.log('\nREPORT\n' + JSON.stringify(result.report, null, 2))
    console.log(`\nAFTER-CHECK (${result.check.verdict})`)
    for (const line of result.check.lines) console.log('  ' + line)
    for (const s of result.check.remaining) console.log(`  still flagged: ${s.title} [${s.where}]`)
    for (const s of result.check.fresh) console.log(`  newly flagged: ${s.title} [${s.where}]`)
    if (result.check.parts) {
      console.log('  changed parts: ' + result.check.parts.changed.join(', '))
      console.log('  added parts: ' + (result.check.parts.added.join(', ') || 'none'))
    }
    const file = await fixedWorkbook(client, jobId)
    if (file) {
      writeFileSync(out, file.bytes)
      console.log(`\nwrote ${out} (${file.bytes.length} bytes), suggested name "${file.fileName}"`)
    }
    return
  }
}

main().catch((error) => {
  console.error('error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
