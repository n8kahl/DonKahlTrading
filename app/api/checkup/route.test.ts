import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The repair job talks to Anthropic; here it is replaced so the route's own decisions can be tested.
const job = vi.hoisted(() => ({
  repairConfigured: vi.fn(() => false),
  runsInLastDay: vi.fn(async () => 0),
  runsPerDay: vi.fn(() => 5),
  startRepair: vi.fn(async () => ({ jobId: 'sesn_test123456' })),
  deleteOldRepairs: vi.fn(async () => 0),
  anthropicClient: vi.fn(() => ({})),
  repairStatus: vi.fn(),
  fixedWorkbook: vi.fn(),
  isJobId: (id: string) => /^sesn_[A-Za-z0-9_-]{6,80}$/.test(id),
}))
vi.mock('@/lib/checkup/repair/job', () => job)

import { POST } from './route'
import { GET as getStatus } from './[id]/route'
import { GET as getFile } from './[id]/file/route'
import { buildSyntheticWorkbook } from '@/lib/checkup/testing/synthetic-workbook'
import { MAX_UPLOAD_BYTES } from '@/lib/checkup/limits'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
let caller = 0

function upload(
  options: {
    name?: string
    bytes?: Uint8Array
    ip?: string
    noFile?: boolean
    context?: string
    complaint?: string
    screenshot?: File
  } = {}
) {
  const form = new FormData()
  if (!options.noFile) {
    const bytes = options.bytes ?? buildSyntheticWorkbook()
    form.append('file', new File([bytes as BlobPart], options.name ?? 'sample.xlsx', { type: XLSX }))
  }
  if (options.context !== undefined) form.append('context', options.context)
  if (options.complaint !== undefined) form.append('complaint', options.complaint)
  if (options.screenshot) form.append('screenshot', options.screenshot)
  const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? `10.0.0.${++caller}` }
  return new Request('http://localhost/api/checkup', { method: 'POST', headers, body: form })
}

describe('POST /api/checkup', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    job.repairConfigured.mockReturnValue(false)
    job.runsInLastDay.mockResolvedValue(0)
    job.startRepair.mockClear()
    job.startRepair.mockResolvedValue({ jobId: 'sesn_test123456' })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('starts a repair job and hands back its id', async () => {
    job.repairConfigured.mockReturnValue(true)
    const res = await POST(upload({ complaint: "My dad says some formulas aren't working", context: 'Net = ups minus downs.' }))
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ mode: 'repair', jobId: 'sesn_test123456', fileName: 'sample.xlsx', flagged: 11 })
    const [, input] = job.startRepair.mock.calls[0] as unknown as [unknown, { complaint: string; reference: { text?: string }; analysis: { problems: unknown[] } }]
    expect(input.complaint).toBe("My dad says some formulas aren't working")
    expect(input.reference.text).toBe('Net = ups minus downs.')
    expect(input.analysis.problems).toHaveLength(9)
    // Starting a run also tidies up runs past their keeping period
    expect(job.deleteOldRepairs).toHaveBeenCalled()
  })

  it('falls back to a plain report when today\'s repairs are used up', async () => {
    job.repairConfigured.mockReturnValue(true)
    job.runsInLastDay.mockResolvedValue(5)
    const res = await POST(upload())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mode).toBe('report')
    expect(body.result.aiNote).toMatch(/allowance of repairs has been used/)
    expect(body.result.problems).toHaveLength(9)
    expect(job.startRepair).not.toHaveBeenCalled()
  })

  it('falls back to a plain report when the repair cannot be started', async () => {
    job.repairConfigured.mockReturnValue(true)
    job.startRepair.mockRejectedValue(new Error('upstream is down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = await (await POST(upload())).json()
    expect(body.mode).toBe('report')
    expect(body.result.aiNote).toMatch(/could not be started/)
  })

  it('checks a workbook and still answers when no AI is available at all', async () => {
    const res = await POST(upload())
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { mode, result: body } = await res.json()
    expect(mode).toBe('report')
    expect(body.fileName).toBe('sample.xlsx')
    expect(body.explainedByAI).toBe(false)
    expect(body.aiNote).toBeTruthy()
    expect(body.problems).toHaveLength(9)
    expect(body.questions).toHaveLength(2)
    expect(body.problems[0].title).toContain('7 rows up')
    expect(body.problems.every((p: { kind: string }) => p.kind !== 'question')).toBe(true)
  })

  it('turns away files that are not .xlsx workbooks', async () => {
    const notExcel = await POST(upload({ name: 'notes.csv' }))
    expect(notExcel.status).toBe(400)
    const fake = await POST(upload({ bytes: new TextEncoder().encode('not a zip at all') }))
    expect(fake.status).toBe(400)
    expect((await fake.json()).error).toMatch(/does not look like an Excel/)
    const none = await POST(upload({ noFile: true }))
    expect(none.status).toBe(400)
  })

  it('turns away files over 10 MB', async () => {
    const res = await POST(upload({ bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1) }))
    expect(res.status).toBe(413)
  })

  it('accepts optional background text and a screenshot, and checks their size and type', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'table.png', { type: 'image/png' })
    const fine = await POST(upload({ context: 'Net means ups minus downs.', screenshot: png }))
    expect(fine.status).toBe(200)
    // No AI in this test, so the background cannot have been used
    expect((await fine.json()).result.usedReference).toBe(false)

    const longText = await POST(upload({ context: 'x'.repeat(12_001) }))
    expect(longText.status).toBe(400)
    const notPicture = await POST(upload({ screenshot: new File(['hello'], 'notes.pdf', { type: 'application/pdf' }) }))
    expect(notPicture.status).toBe(400)
    const hugePicture = await POST(upload({ screenshot: new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }) }))
    expect(hugePicture.status).toBe(413)
  })

  it('needs no passcode or sign-in', async () => {
    const res = await POST(upload())
    expect(res.status).toBe(200)
  })

  it('rate-limits repeated uploads from one address', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 8; i++) {
      statuses.push((await POST(upload({ ip: '203.0.113.9' }))).status)
    }
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true)
    expect(statuses.slice(6)).toEqual([429, 429])
  })
})

describe('GET /api/checkup/[id] and its file', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
  const req = (path: string) => new Request(`http://localhost${path}`, { headers: { 'x-forwarded-for': '10.9.9.9' } })

  beforeEach(() => {
    job.repairConfigured.mockReturnValue(true)
    job.repairStatus.mockReset()
    job.fixedWorkbook.mockReset()
  })

  it('reports where a job has got to', async () => {
    job.repairStatus.mockResolvedValue({ state: 'working', progress: ['Opening your workbook.'], stage: 'Opening your workbook.', steps: 3, elapsedSeconds: 40 })
    const res = await getStatus(req('/api/checkup/sesn_test123456'), ctx('sesn_test123456'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ state: 'working', steps: 3 })
  })

  it('treats a hiccup while asking as still working, not as a failed repair', async () => {
    job.repairStatus.mockRejectedValue(new Error('timeout'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await getStatus(req('/api/checkup/sesn_test123456'), ctx('sesn_test123456'))
    expect(await res.json()).toMatchObject({ state: 'working' })
  })

  it('refuses ids that are not job ids without asking anyone', async () => {
    const res = await getStatus(req('/api/checkup/whatever'), ctx('whatever'))
    expect(res.status).toBe(404)
    expect(job.repairStatus).not.toHaveBeenCalled()
  })

  it('serves the fixed copy as a download under a sensible name', async () => {
    job.fixedWorkbook.mockResolvedValue({ bytes: new Uint8Array([80, 75, 3, 4]), fileName: 'Dad’s tracker (fixed).xlsx' })
    const res = await getFile(req('/api/checkup/sesn_test123456/file'), ctx('sesn_test123456'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="Dad_s tracker (fixed).xlsx"')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]))
  })

  it('has nothing to download when the copy failed the after-check', async () => {
    job.fixedWorkbook.mockResolvedValue(null)
    const res = await getFile(req('/api/checkup/sesn_test123456/file'), ctx('sesn_test123456'))
    expect(res.status).toBe(404)
  })
})
