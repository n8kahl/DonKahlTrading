import { beforeEach, describe, expect, it, vi } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { checkWorkbook } from '../index'
import { partManifest } from '../parts'
import { buildSyntheticWorkbook } from '../testing/synthetic-workbook'
import { afterCheck, snapshotBefore } from './aftercheck'
import { APP_TAG, FIXED_NAME, REPORT_NAME, configVersion } from './agent-config'
import {
  ensureAgent,
  fixedWorkbook,
  isJobId,
  progressNotes,
  deleteOldRepairs,
  repairStatus,
  resetAgentCache,
  runsInLastDay,
  startRepair,
} from './job'
import { parseRepairReport } from './report'

// -----------------------------------------------------------------------------
// A stand-in for the Anthropic client: just the calls the repair job makes.
// -----------------------------------------------------------------------------

type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any

function listOf<T>(items: T[]) {
  return {
    data: items,
    async *[Symbol.asyncIterator]() {
      yield* items
    },
  }
}

let sessionCounter = 0

function fake() {
  const state = {
    agents: [] as Any[],
    environments: [] as Any[],
    sessions: new Map<string, Any>(),
    events: new Map<string, Any[]>(),
    outputs: new Map<string, { id: string; filename: string; bytes: Uint8Array }[]>(),
    uploads: [] as { id: string; name: string; expires?: number }[],
    deleted: [] as string[],
    deletedFiles: [] as string[],
    calls: { agentCreate: 0, agentUpdate: 0, environmentCreate: 0, sent: [] as Any[] },
    createdSession: null as Any,
  }
  let n = 0
  const client = {
    beta: {
      agents: {
        list: () => listOf(state.agents),
        retrieve: async (id: string) => state.agents.find((a) => a.id === id),
        create: async (params: Any) => {
          state.calls.agentCreate++
          const agent = { id: `agent_${++n}`, version: 1, archived_at: null, ...params }
          state.agents.push(agent)
          return agent
        },
        update: async (id: string, params: Any) => {
          state.calls.agentUpdate++
          const agent = state.agents.find((a) => a.id === id)
          Object.assign(agent, params, { version: agent.version + 1 })
          return agent
        },
      },
      environments: {
        list: () => listOf(state.environments),
        create: async (params: Any) => {
          state.calls.environmentCreate++
          const env = { id: `env_${++n}`, archived_at: null, ...params }
          state.environments.push(env)
          return env
        },
      },
      files: {
        upload: async ({ file, expires_in_seconds }: Any) => {
          const id = `file_${++n}`
          state.uploads.push({ id, name: file.name, expires: expires_in_seconds })
          return { id }
        },
        list: ({ scope_id }: Any) => listOf(state.outputs.get(scope_id) ?? []),
        delete: async (id: string) => {
          state.deletedFiles.push(id)
          return { id, type: 'file_deleted' }
        },
        download: async (id: string) => {
          for (const files of state.outputs.values()) {
            const f = files.find((x) => x.id === id)
            if (f) return new Response(Buffer.from(f.bytes))
          }
          throw new Error('no such file')
        },
      },
      sessions: {
        create: async (params: Any) => {
          const id = `sesn_test${++sessionCounter}abc`
          const session = {
            id,
            status: 'running',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: params.metadata,
            resources: params.resources,
            usage: { list_cost: { amount: '312', currency: 'USD' } },
            outcome_evaluations: [{ result: 'pending' }],
          }
          state.sessions.set(id, session)
          state.events.set(
            id,
            params.initial_events.map((e: Any, i: number) => ({ id: `sevt_${i}`, processed_at: new Date().toISOString(), ...e }))
          )
          state.createdSession = params
          return session
        },
        retrieve: async (id: string) => {
          const s = state.sessions.get(id)
          if (!s) throw new Anthropic.NotFoundError(404, undefined, 'not found', new Headers())
          return s
        },
        list: (params?: Any) =>
          listOf(
            [...state.sessions.values()].filter(
              (x) =>
                (!params?.['created_at[gte]'] || x.created_at >= params['created_at[gte]']) &&
                (!params?.['created_at[lte]'] || x.created_at <= params['created_at[lte]'])
            )
          ),
        delete: async (id: string) => {
          state.deleted.push(id)
          state.sessions.delete(id)
          return { id, type: 'session_deleted' }
        },
        events: {
          list: async (id: string, params: Any) => {
            let events = [...(state.events.get(id) ?? [])]
            if (params?.types) events = events.filter((e) => params.types.includes(e.type))
            if (params?.order === 'desc') events.reverse()
            return listOf(events.slice(0, params?.limit ?? 1000))
          },
          send: async (_id: string, params: Any) => {
            state.calls.sent.push(...params.events)
          },
        },
      },
    },
  }
  return { client: client as unknown as Anthropic, state }
}

const faulty = buildSyntheticWorkbook()
const repaired = buildSyntheticWorkbook({ clean: true, recalcOnOpen: true })
const analysis = checkWorkbook(faulty)
const input = {
  bytes: faulty,
  fileName: 'Dad tracker.xlsx',
  complaint: "My dad says some formulas aren't working",
  reference: { text: 'Net = ups minus downs.', image: { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png' } },
  analysis,
}
const goodReport = JSON.stringify({
  summary: 'It tracks three prices. It flags lows. It gives a signal.',
  answer: 'Several columns had slipped out of line and are now fixed.',
  wrong: [{ title: 'Price B looked at the wrong day', explanation: 'One. Two.', where: 'Model, Price B (C), rows 10–41' }],
  changes: [{ title: 'Price B reads its own day', what: 'Changed.', why: 'Because.', basis: 'error', where: 'Model, C', cells: 32 }],
  effect: { cellsChanged: 45, daysChanged: 3, headline: 'Signal', latestDate: '2/9/2025', latestBefore: 'WAIT', latestAfter: 'GO', plain: 'It changed.' },
  notChanged: [],
  verification: { plain: 'Checked. Opening it in Excel is the final test.', valuesChecked: 400, valuesMatched: 400 },
  notesTabUpdated: false,
})

function finish(state: ReturnType<typeof fake>['state'], jobId: string, files: Record<string, Uint8Array>, stop = 'end_turn') {
  const session = state.sessions.get(jobId)
  session.status = 'idle'
  session.outcome_evaluations = [{ result: 'satisfied' }]
  state.events.get(jobId)!.push({ id: 'sevt_idle', type: 'session.status_idle', processed_at: new Date().toISOString(), stop_reason: { type: stop } })
  state.outputs.set(
    jobId,
    Object.entries(files).map(([filename, bytes], i) => ({ id: `file_out_${i}`, filename, bytes }))
  )
}

beforeEach(() => {
  resetAgentCache()
  vi.unstubAllEnvs()
})

// -----------------------------------------------------------------------------

describe('the agent is created once and kept up to date', () => {
  it('creates the agent and its sandbox the first time, then reuses them', async () => {
    const { client, state } = fake()
    const first = await ensureAgent(client)
    resetAgentCache()
    const second = await ensureAgent(client)
    expect(state.calls.agentCreate).toBe(1)
    expect(state.calls.environmentCreate).toBe(1)
    expect(second).toEqual(first)
    const agent = state.agents[0]
    expect(agent.metadata.config_version).toBe(configVersion())
    // No web access, and tools that run without waiting for an approval nobody could give
    expect(agent.tools[0].configs).toEqual([
      { name: 'web_fetch', enabled: false },
      { name: 'web_search', enabled: false },
    ])
    expect(state.environments[0].config.networking.type).toBe('limited')
  })

  it('updates the stored agent when its definition in the code has changed', async () => {
    const { client, state } = fake()
    await ensureAgent(client)
    state.agents[0].metadata = { app: APP_TAG, config_version: 'older' }
    resetAgentCache()
    const ref = await ensureAgent(client)
    expect(state.calls.agentCreate).toBe(1)
    expect(state.calls.agentUpdate).toBe(1)
    expect(ref.agentVersion).toBe(2)
  })
})

describe('starting a repair', () => {
  it('uploads the workbook, caps the spend, and briefs the agent', async () => {
    const { client, state } = fake()
    vi.stubEnv('CHECKUP_RUN_BUDGET_CENTS', '650')
    const { jobId } = await startRepair(client, input)
    expect(isJobId(jobId)).toBe(true)
    expect(state.uploads.map((u) => u.name)).toEqual(['workbook.xlsx', 'reference.png'])
    // Uploads remove themselves from Anthropic's side after a week
    expect(state.uploads.map((u) => u.expires)).toEqual([604800, 604800])

    const created = state.createdSession
    expect(created.budget).toEqual({ type: 'limit', max_list_cost: { amount: '650', currency: 'USD' } })
    expect(created.metadata).toMatchObject({ app: APP_TAG, file_name: 'Dad tracker.xlsx' })
    expect(created.resources.map((r: Any) => r.mount_path)).toEqual(['/workbook.xlsx', '/reference.png'])
    expect(created.agent).toMatchObject({ type: 'agent', version: 1 })

    const [message, outcome] = created.initial_events
    expect(message.type).toBe('user.message')
    const brief = message.content[0].text as string
    expect(brief).toContain("My dad says some formulas aren't working")
    expect(brief).toContain('Net = ups minus downs.')
    expect(brief).toContain('/mnt/session/uploads/reference.png')
    expect(brief).toContain(analysis.problems[0].id)
    expect(brief).toContain('"sha256"')
    expect(outcome.type).toBe('user.define_outcome')
    expect(outcome.rubric.content).toContain('byte-for-byte identical')
  })
})

describe('following a repair', () => {
  it('reports progress notes the agent printed, and a step count', async () => {
    const { client, state } = fake()
    const { jobId } = await startRepair(client, input)
    const events = state.events.get(jobId)!
    events.push(
      { id: 'e1', type: 'agent.tool_use', name: 'bash', input: { command: 'echo "PROGRESS: Opening your workbook."' } },
      { id: 'e2', type: 'agent.tool_use', name: 'bash', input: { command: 'python3 audit.py' } },
      { id: 'e3', type: 'agent.tool_use', name: 'bash', input: { command: 'echo "PROGRESS: Comparing every price with its data tab." && python3 x.py' } }
    )
    const status = await repairStatus(client, jobId)
    expect(status).toMatchObject({
      state: 'working',
      progress: ['Opening your workbook.', 'Comparing every price with its data tab.'],
      stage: 'Comparing every price with its data tab.',
      steps: 3,
    })
    events.push({ id: 'e4', type: 'span.outcome_evaluation_start', iteration: 0 })
    expect(await repairStatus(client, jobId)).toMatchObject({ stage: 'Double-checking the repaired copy against the checklist.' })
  })

  it('returns the report, an independent after-check, and the fixed file when done', async () => {
    const { client, state } = fake()
    const { jobId } = await startRepair(client, input)
    finish(state, jobId, { [FIXED_NAME]: repaired, [REPORT_NAME]: strToU8(goodReport) })

    const status = await repairStatus(client, jobId)
    if (status.state !== 'done') throw new Error(`expected done, got ${status.state}`)
    const { result } = status
    expect(result.fileName).toBe('Dad tracker.xlsx')
    expect(result.report?.effect).toMatchObject({ cellsChanged: 45, latestBefore: 'WAIT', latestAfter: 'GO' })
    expect(result.costCents).toBe(312)
    expect(result.downloadable).toBe(true)
    // The after-check is ours, not the agent's: every first-pass finding is gone and nothing is missing
    expect(result.check).toMatchObject({ opened: true, resolved: 11, remaining: [], fresh: [], verdict: 'pass' })
    expect(result.check.parts).toMatchObject({ missing: [], fullCalcOnLoad: true })
    expect(result.check.parts!.changed.sort()).toEqual(['xl/workbook.xml', 'xl/worksheets/sheet1.xml'])

    const file = await fixedWorkbook(client, jobId)
    expect(file?.fileName).toBe('Dad tracker (fixed).xlsx')
    expect(file?.bytes.length).toBe(repaired.length)
  })

  it('withholds a fixed copy that lost part of the original workbook', async () => {
    const { client, state } = fake()
    const { jobId } = await startRepair(client, input)
    const parts = unzipSync(repaired)
    delete parts['xl/styles.xml']
    finish(state, jobId, { [FIXED_NAME]: zipSync(parts), [REPORT_NAME]: strToU8(goodReport) })
    const status = await repairStatus(client, jobId)
    if (status.state !== 'done') throw new Error('expected done')
    expect(status.result.check.verdict).toBe('fail')
    expect(status.result.check.parts?.missing).toEqual(['xl/styles.xml'])
    expect(status.result.downloadable).toBe(false)
    expect(await fixedWorkbook(client, jobId)).toBeNull()
  })

  it('still hands out a sound fixed copy when the written report is unreadable', async () => {
    const { client, state } = fake()
    const { jobId } = await startRepair(client, input)
    finish(state, jobId, { [FIXED_NAME]: repaired, [REPORT_NAME]: strToU8('not json') })
    const status = await repairStatus(client, jobId)
    if (status.state !== 'done') throw new Error('expected done')
    expect(status.result.report).toBeNull()
    expect(status.result.downloadable).toBe(true)
  })

  it('says so plainly when the spend ceiling stopped the run', async () => {
    const { client, state } = fake()
    const { jobId } = await startRepair(client, input)
    finish(state, jobId, {}, 'budget_reached')
    expect(await repairStatus(client, jobId)).toMatchObject({ state: 'failed', code: 'budget' })
  })

  it('stops a run that has gone on too long', async () => {
    const { client, state } = fake()
    vi.stubEnv('CHECKUP_RUN_MINUTES', '10')
    const { jobId } = await startRepair(client, input)
    state.sessions.get(jobId).created_at = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    expect(await repairStatus(client, jobId)).toMatchObject({ state: 'failed', code: 'timeout' })
    expect(state.calls.sent).toEqual([{ type: 'user.interrupt' }])
  })

  it('refuses job ids that are malformed or belong to something else', async () => {
    const { client, state } = fake()
    expect(await repairStatus(client, 'sesn_doesnotexist1')).toMatchObject({ state: 'failed', code: 'not-found' })
    expect(await repairStatus(client, '../../etc/passwd')).toMatchObject({ state: 'failed', code: 'not-found' })
    state.sessions.set('sesn_someoneelse1', { id: 'sesn_someoneelse1', status: 'idle', metadata: { app: 'another-app' }, outcome_evaluations: [] })
    expect(await repairStatus(client, 'sesn_someoneelse1')).toMatchObject({ state: 'failed', code: 'not-found' })
  })

  it('counts the last day of repairs from the sessions themselves', async () => {
    const { client, state } = fake()
    await startRepair(client, input)
    await startRepair(client, input)
    state.sessions.set('sesn_other', { id: 'sesn_other', metadata: { app: 'another-app' } })
    expect(await runsInLastDay(client)).toBe(2)
  })
})

describe('removing old runs', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

  it('deletes this app\'s runs older than a week and nothing else', async () => {
    const { client, state } = fake()
    const fresh = (await startRepair(client, input)).jobId
    const old = (await startRepair(client, input)).jobId
    const oldButRunning = (await startRepair(client, input)).jobId
    state.sessions.get(old).created_at = daysAgo(8)
    state.sessions.get(old).status = 'idle'
    state.sessions.get(oldButRunning).created_at = daysAgo(8)
    state.sessions.set('sesn_notours', { id: 'sesn_notours', status: 'idle', created_at: daysAgo(30), metadata: { app: 'another-app' } })

    expect(await deleteOldRepairs(client)).toBe(1)
    expect(state.deleted).toEqual([old])
    // ...along with the workbook and screenshot that were uploaded for it
    expect(state.deletedFiles).toHaveLength(2)
    expect(state.sessions.has(fresh)).toBe(true)
    expect(state.sessions.has('sesn_notours')).toBe(true)
    // A removed run is simply not found afterwards
    expect(await repairStatus(client, old)).toMatchObject({ state: 'failed', code: 'not-found' })
  })

  it('keeps everything when the keeping period is switched off', async () => {
    const { client, state } = fake()
    vi.stubEnv('CHECKUP_KEEP_DAYS', '0')
    const { jobId } = await startRepair(client, input)
    state.sessions.get(jobId).created_at = daysAgo(400)
    state.sessions.get(jobId).status = 'idle'
    expect(await deleteOldRepairs(client)).toBe(0)
    expect(state.deleted).toEqual([])
    expect(state.uploads.every((u) => u.expires === undefined)).toBe(true)
  })
})

describe('the independent after-check', () => {
  const before = snapshotBefore(analysis, partManifest(faulty))

  it('reports what is still flagged when nothing was actually fixed', () => {
    const check = afterCheck(before, faulty)
    expect(check.resolved).toBe(0)
    expect(check.remaining).toHaveLength(before.findings.length)
    expect(check.verdict).toBe('notes')
    expect(check.parts).toMatchObject({ identical: before.parts.length, changed: [], missing: [] })
  })

  it('notices a copy that Excel would not be told to recalculate', () => {
    const check = afterCheck(before, buildSyntheticWorkbook({ clean: true }))
    expect(check.remaining).toEqual([])
    expect(check.parts?.fullCalcOnLoad).toBe(false)
    expect(check.verdict).toBe('notes')
    expect(check.lines.join(' ')).toContain('Ctrl+Alt+F9')
  })

  it('fails a file that cannot be opened', () => {
    const check = afterCheck(before, strToU8('this is not a workbook'))
    expect(check).toMatchObject({ opened: false, verdict: 'fail' })
  })

  it('accepts the stale calculation chain being removed, and nothing else', () => {
    const withChain = unzipSync(faulty)
    withChain['xl/calcChain.xml'] = strToU8('<calcChain/>')
    const original = zipSync(withChain)
    const check = afterCheck(snapshotBefore(analysis, partManifest(original)), repaired)
    expect(check.parts).toMatchObject({ missing: [], calcChainRemoved: true })
    expect(strFromU8(unzipSync(repaired)['xl/workbook.xml'])).toContain('fullCalcOnLoad="1"')
  })
})

describe('small pieces', () => {
  it('reads progress notes out of commands and ignores the template text', () => {
    expect(progressNotes(['echo "PROGRESS: Reading the notes tab."', "echo 'PROGRESS: Writing the fixed copy.' && zip x", 'echo "PROGRESS: <one plain sentence>"'])).toEqual([
      'Reading the notes tab.',
      'Writing the fixed copy.',
    ])
  })

  it('reads a report leniently', () => {
    const report = parseRepairReport(JSON.stringify({ summary: 'Only a summary.', changes: [{ title: 'A', basis: 'nonsense', cells: -4 }] }))
    expect(report?.summary).toBe('Only a summary.')
    expect(report?.changes[0]).toMatchObject({ title: 'A', basis: 'error', cells: 0 })
    expect(report?.effect.cellsChanged).toBe(0)
    expect(parseRepairReport('{{')).toBeNull()
  })
})
