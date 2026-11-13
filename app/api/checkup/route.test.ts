import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import { buildSyntheticWorkbook } from '@/lib/checkup/testing/synthetic-workbook'
import { MAX_UPLOAD_BYTES } from '@/lib/checkup/limits'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
let caller = 0

function upload(options: { passcode?: string; name?: string; bytes?: Uint8Array; ip?: string; noFile?: boolean } = {}) {
  const form = new FormData()
  if (!options.noFile) {
    const bytes = options.bytes ?? buildSyntheticWorkbook()
    form.append('file', new File([bytes as BlobPart], options.name ?? 'sample.xlsx', { type: XLSX }))
  }
  const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? `10.0.0.${++caller}` }
  if (options.passcode !== undefined) headers['x-checkup-passcode'] = options.passcode
  return new Request('http://localhost/api/checkup', { method: 'POST', headers, body: form })
}

describe('POST /api/checkup', () => {
  beforeEach(() => {
    vi.stubEnv('CHECKUP_PASSCODE', 'open-sesame')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('refuses to run when no passcode is configured', async () => {
    vi.stubEnv('CHECKUP_PASSCODE', '')
    const res = await POST(upload({ passcode: 'anything' }))
    expect(res.status).toBe(503)
  })

  it('refuses a missing or wrong passcode', async () => {
    expect((await POST(upload())).status).toBe(401)
    const res = await POST(upload({ passcode: 'guess' }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('bad-passcode')
  })

  it('checks a workbook and still answers when the AI is unavailable', async () => {
    const res = await POST(upload({ passcode: 'open-sesame' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.fileName).toBe('sample.xlsx')
    expect(body.explainedByAI).toBe(false)
    expect(body.aiNote).toBeTruthy()
    expect(body.problems).toHaveLength(9)
    expect(body.questions).toHaveLength(2)
    expect(body.problems[0].title).toContain('7 rows up')
    expect(body.problems.every((p: { kind: string }) => p.kind !== 'question')).toBe(true)
  })

  it('turns away files that are not .xlsx workbooks', async () => {
    const notExcel = await POST(upload({ passcode: 'open-sesame', name: 'notes.csv' }))
    expect(notExcel.status).toBe(400)
    const fake = await POST(upload({ passcode: 'open-sesame', bytes: new TextEncoder().encode('not a zip at all') }))
    expect(fake.status).toBe(400)
    expect((await fake.json()).error).toMatch(/does not look like an Excel/)
    const none = await POST(upload({ passcode: 'open-sesame', noFile: true }))
    expect(none.status).toBe(400)
  })

  it('turns away files over 10 MB', async () => {
    const res = await POST(upload({ passcode: 'open-sesame', bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1) }))
    expect(res.status).toBe(413)
  })

  it('rate-limits repeated attempts from one address, wrong passcodes included', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) {
      statuses.push((await POST(upload({ passcode: 'guess', ip: '203.0.113.9' }))).status)
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
  })
})
