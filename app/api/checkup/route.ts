import { NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit'
import { CheckupError, MAX_UPLOAD_BYTES, checkWorkbook } from '@/lib/checkup'
import { baseResult, explainCheckup } from '@/lib/checkup/explain'
import { CHECKUP_RATE_LIMIT, PASSCODE_HEADER, checkPasscode } from '@/lib/checkup/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

function fail(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status })
}

/**
 * POST /api/checkup
 * multipart/form-data with one field, "file" (.xlsx up to 10 MB), and the shared
 * passcode in the x-checkup-passcode header.
 *
 * The workbook is read from memory, checked and described. It is never written
 * to disk or to the database, and it is never re-saved.
 */
export async function POST(request: Request) {
  // 1. Rate limit first, so wrong passcodes are throttled too.
  const limited = withRateLimit(request, CHECKUP_RATE_LIMIT)
  if (limited.response) {
    return fail('Too many check-ups in a short time. Wait a few minutes and try again.', 429, 'rate-limited')
  }

  // 2. Shared passcode.
  const pass = checkPasscode(request.headers.get(PASSCODE_HEADER))
  if (pass === 'not-configured') {
    return fail('The spreadsheet check-up has not been switched on yet.', 503, 'not-configured')
  }
  if (pass === 'wrong') {
    return fail('That passcode is not right.', 401, 'bad-passcode')
  }

  // 3. Size, before reading the body.
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return fail('That file is larger than 10 MB, which is the most the check-up can take.', 413, 'too-large')
  }

  let file: File
  try {
    const form = await request.formData()
    const entry = form.get('file')
    if (!(entry instanceof File)) {
      return fail('No file arrived. Choose an .xlsx workbook and try again.', 400, 'no-file')
    }
    file = entry
  } catch {
    return fail('The upload did not arrive in one piece. Please try again.', 400, 'bad-upload')
  }

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return fail('Please choose an Excel workbook saved as .xlsx.', 400, 'wrong-type')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail('That file is larger than 10 MB, which is the most the check-up can take.', 413, 'too-large')
  }
  if (file.size === 0) {
    return fail('That file is empty.', 400, 'empty')
  }

  // 4. The checks: pure, in memory.
  let result
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    result = baseResult(file.name, file.size, checkWorkbook(bytes))
  } catch (error) {
    if (error instanceof CheckupError) return fail(error.message, error.status, 'unreadable')
    console.error('[checkup] check failed:', error instanceof Error ? error.message : error)
    return fail('Something went wrong while reading that workbook. Nothing was saved; please try again.', 500, 'check-failed')
  }

  // 5. Plain-language wording. If this fails the findings are returned with their standard wording.
  const explained = await explainCheckup(result)
  console.log(
    `[checkup] ${Math.round(file.size / 1024)} KB, ${explained.structure.sheets.length} tabs, ${explained.problems.length} problems, ${explained.questions.length} questions, ai=${explained.explainedByAI}`
  )

  return NextResponse.json(explained, { headers: { 'Cache-Control': 'no-store' } })
}
