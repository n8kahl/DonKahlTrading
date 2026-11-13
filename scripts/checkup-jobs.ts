// List recent repair jobs with their state, cost and duration (no workbook contents).
//   npx tsx --env-file=.env.local scripts/checkup-jobs.ts [how many]
//   npx tsx --env-file=.env.local scripts/checkup-jobs.ts --cleanup   (delete runs past CHECKUP_KEEP_DAYS)
import { APP_TAG } from '../lib/checkup/repair/agent-config'
import { anthropicClient, deleteOldRepairs, keepDays, repairStatus } from '../lib/checkup/repair/job'

async function main() {
  const client = anthropicClient()
  if (process.argv.includes('--cleanup')) {
    const n = await deleteOldRepairs(client, 200)
    console.log(`deleted ${n} repair run${n === 1 ? '' : 's'} older than ${keepDays()} days`)
    return
  }
  const limit = Number(process.argv[2] ?? 5)
  let n = 0
  for await (const s of client.beta.sessions.list()) {
    if (s.metadata?.app !== APP_TAG) continue
    const cents = s.usage?.list_cost?.amount
    const cost = cents ? `$${(Number(cents) / 100).toFixed(2)}` : '$?'
    const age = Math.round((Date.now() - Date.parse(s.created_at)) / 1000)
    const outcomes = s.outcome_evaluations.map((o) => o.result).join(',') || 'none'
    console.log(
      `${s.id}  ${s.status.padEnd(10)} started ${age}s ago  active ${s.usage?.active_seconds ?? '?'}s  ${cost}  outcome: ${outcomes}  out ${s.usage?.output_tokens ?? '?'} tok`
    )
    if (s.status === 'running' || s.status === 'rescheduling') {
      const status = await repairStatus(client, s.id)
      if (status.state === 'working') {
        for (const note of status.progress) console.log(`    - ${note}`)
        console.log(`    > ${status.stage} (${status.steps} steps)`)
      }
    }
    if (++n >= limit) break
  }
  if (n === 0) console.log('no repair jobs yet')
}

main().catch((error) => {
  console.error('error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
