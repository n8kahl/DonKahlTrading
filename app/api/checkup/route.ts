import { NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit'
import { CheckupError, MAX_UPLOAD_BYTES, checkWorkbook } from '@/lib/checkup'
import { baseResult, explainCheckup, type Reference } from '@/lib/checkup/explain'
import { MAX_COMPLAINT_CHARS, MAX_REFERENCE_CHARS, MAX_SCREENSHOT_BYTES, SCREENSHOT_TYPES } from '@/lib/checkup/limits'
import {
  anthropicClient,
  deleteOldRepairs,
  repairConfigured,
  runsInLastDay,
  runsPerDay,
  startRepair,
} from '@/lib/checkup/repair/job'
import { CHECKUP_RATE_LIMIT, takeAiWriteUp } from '@/lib/checkup/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

function fail(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status })
}

/**
 * POST /api/checkup
 * multipart/form-data with "file" (.xlsx up to 10 MB) and, optionally, "complaint" (what the
 * owner says is wrong, one line), and background from the author of the method the workbook
 * follows: "context" (pasted text) and "screenshot" (one image).
 *
 * Runs the deterministic checks, then starts a repair job (a Managed Agents session) and
 * returns its id for GET /api/checkup/[id] to follow. When no repair can be started (no key,
 * today's allowance used up, or the start fails) it returns the findings in plain words instead.
 *
 * Nothing is written to this server's disk or database. The workbook is sent to Anthropic for
 * the repair; the original is never changed.
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
  let complaint = ''
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
    const said = form.get('complaint')
    if (typeof said === 'string') complaint = said.trim().slice(0, MAX_COMPLAINT_CHARS)
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
  let bytes: Uint8Array
  let analysis
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
    analysis = checkWorkbook(bytes)
  } catch (error) {
    if (error instanceof CheckupError) return fail(error.message, error.status, 'unreadable')
    console.error('[checkup] check failed:', error instanceof Error ? error.message : error)
    return fail('Something went wrong while reading that workbook. Nothing was saved; please try again.', 500, 'check-failed')
  }

  const reference: Reference = {}
  if (contextText) reference.text = contextText
  if (screenshot) reference.image = { bytes: new Uint8Array(await screenshot.arrayBuffer()), mediaType: screenshot.type }

  // 4. Start the repair, if one may run.
  let whyNoRepair = 'Fixing is not switched on, so this is a report only.'
  if (repairConfigured()) {
    try {
      const client = anthropicClient()
      if ((await runsInLastDay(client)) >= runsPerDay()) {
        whyNoRepair = 'Today’s allowance of repairs has been used, so this is a report only. Try again tomorrow for a fixed copy.'
      } else {
        const { jobId } = await startRepair(client, { bytes, fileName: file.name, complaint, reference, analysis })
        // Tidy up runs past their keeping period. Not awaited: it must never hold up or fail this one.
        void deleteOldRepairs(client)
          .then((n) => {
            if (n > 0) console.log(`[checkup] removed ${n} old repair run${n === 1 ? '' : 's'}`)
          })
          .catch((error) => console.error('[checkup] clean-up failed:', error instanceof Error ? error.message : error))
        console.log(`[checkup] repair ${jobId} started: ${Math.round(file.size / 1024)} KB, ${analysis.problems.length} problems, ${analysis.questions.length} questions`)
        return NextResponse.json(
          { mode: 'repair', jobId, fileName: file.name, flagged: analysis.problems.length + analysis.questions.length },
          { status: 202, headers: { 'Cache-Control': 'no-store' } }
        )
      }
    } catch (error) {
      console.error('[checkup] could not start a repair:', error instanceof Error ? error.message : error)
      whyNoRepair = 'The repair could not be started this time, so this is a report only. Please try again in a little while.'
    }
  }

  // 5. No repair: report what the checks found, in plain words where the write-up is available.
  const result = baseResult(file.name, file.size, analysis)
  let explained = result
  if (!process.env.ANTHROPIC_API_KEY || takeAiWriteUp()) {
    explained = await explainCheckup(result, { reference })
  }
  explained = { ...explained, aiNote: explained.aiNote ? `${whyNoRepair} ${explained.aiNote}` : whyNoRepair }
  console.log(
    `[checkup] report only: ${Math.round(file.size / 1024)} KB, ${explained.problems.length} problems, ${explained.questions.length} questions, ai=${explained.explainedByAI}`
  )

  return NextResponse.json({ mode: 'report', result: explained }, { headers: { 'Cache-Control': 'no-store' } })
}
