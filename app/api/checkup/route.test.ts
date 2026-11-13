import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import { buildSyntheticWorkbook } from '@/lib/checkup/testing/synthetic-workbook'
import { MAX_UPLOAD_BYTES } from '@/lib/checkup/limits'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
let caller = 0

function upload(
  options: { name?: string; bytes?: Uint8Array; ip?: string; noFile?: boolean; context?: string; screenshot?: File } = {}
) {
  const form = new FormData()
  if (!options.noFile) {
    const bytes = options.bytes ?? buildSyntheticWorkbook()
    form.append('file', new File([bytes as BlobPart], options.name ?? 'sample.xlsx', { type: XLSX }))
  }
  if (options.context !== undefined) form.append('context', options.context)
  if (options.screenshot) form.append('screenshot', options.screenshot)
  const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? `10.0.0.${++caller}` }
  return new Request('http://localhost/api/checkup', { method: 'POST', headers, body: form })
}

describe('POST /api/checkup', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('checks a workbook and still answers when the AI is unavailable', async () => {
    const res = await POST(upload())
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
    expect((await fine.json()).usedReference).toBe(false)

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
    for (let i = 0; i < 12; i++) {
      statuses.push((await POST(upload({ ip: '203.0.113.9' }))).status)
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
  })
})
