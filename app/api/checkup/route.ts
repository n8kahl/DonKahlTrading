import { NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit'
import { CheckupError, MAX_UPLOAD_BYTES, checkWorkbook } from '@/lib/checkup'
import { baseResult, explainCheckup, type Reference } from '@/lib/checkup/explain'
import { MAX_REFERENCE_CHARS, MAX_SCREENSHOT_BYTES, SCREENSHOT_TYPES } from '@/lib/checkup/limits'
import { CHECKUP_RATE_LIMIT, takeAiWriteUp } from '@/lib/checkup/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

function fail(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status })
}

/**
 * POST /api/checkup
 * multipart/form-data with "file" (.xlsx up to 10 MB) and, optionally, background from the
 * author of the method the workbook follows: "context" (pasted text) and "screenshot" (one image).
 *
 * Everything is read from memory. Nothing is written to disk or to the database,
 * and the workbook is never re-saved.
 */
export async function POST(request: Request) {
  // 1. Rate limit per address.
  const limited = withRateLimit(request, CHECKUP_RATE_LIMIT)
  if (limited.response) {
    return fail('Too many check-ups in a short time. Wait a few minutes and try again.', 429, 'rate-limited')
  }

  // 2. Size, before reading the body.
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_UPLOAD_BYTES + MAX_SCREENSHOT_BYTES + 256 * 1024) {
    return fail('That file is larger than 10 MB, which is the most the check-up can take.', 413, 'too-large')
  }

  let file: File
  let contextText = ''
  let screenshot: File | null = null
  try {
    const form = await request.formData()
    const entry = form.get('file')
    if (!(entry instanceof File)) {
      return fail('No file arrived. Choose an .xlsx workbook and try again.', 400, 'no-file')
    }
    file = entry
    const context = form.get('context')
    if (typeof context === 'string') contextText = context.trim()
    const shot = form.get('screenshot')
    if (shot instanceof File && shot.size > 0) screenshot = shot
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
  if (contextText.length > MAX_REFERENCE_CHARS) {
    return fail('The pasted text is very long. Paste just the part that explains the rules and try again.', 400, 'context-too-long')
  }
  if (screenshot && !SCREENSHOT_TYPES.includes(screenshot.type)) {
    return fail('The screenshot needs to be a picture (PNG or JPEG).', 400, 'screenshot-type')
  }
  if (screenshot && screenshot.size > MAX_SCREENSHOT_BYTES) {
    return fail('That screenshot is larger than 3 MB. Try a smaller picture.', 413, 'screenshot-too-large')
  }

  // 3. The checks: pure, in memory.
  let result
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    result = baseResult(file.name, file.size, checkWorkbook(bytes))
  } catch (error) {
    if (error instanceof CheckupError) return fail(error.message, error.status, 'unreadable')
    console.error('[checkup] check failed:', error instanceof Error ? error.message : error)
    return fail('Something went wrong while reading that workbook. Nothing was saved; please try again.', 500, 'check-failed')
  }

  // 4. Plain-language wording, within the hourly allowance. If the allowance is used up or the
  //    call fails, the findings are returned with their standard wording.
  let explained = result
  if (!process.env.ANTHROPIC_API_KEY || takeAiWriteUp()) {
    const reference: Reference = {}
    if (contextText) reference.text = contextText
    if (screenshot) reference.image = { bytes: new Uint8Array(await screenshot.arrayBuffer()), mediaType: screenshot.type }
    explained = await explainCheckup(result, { reference })
  } else {
    explained = {
      ...result,
      aiNote:
        'The plain-English write-up has been used a lot in the last hour, so the standard wording is shown. The findings themselves are complete; try again later for the fuller write-up.',
    }
  }
  console.log(
    `[checkup] ${Math.round(file.size / 1024)} KB, ${explained.structure.sheets.length} tabs, ${explained.problems.length} problems, ${explained.questions.length} questions, ai=${explained.explainedByAI}, reference=${explained.usedReference}`
  )

  return NextResponse.json(explained, { headers: { 'Cache-Control': 'no-store' } })
}
