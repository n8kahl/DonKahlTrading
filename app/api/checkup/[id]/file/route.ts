import { NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit'
import { CHECKUP_POLL_RATE_LIMIT } from '@/lib/checkup/guard'
import { anthropicClient, fixedWorkbook, isJobId, repairConfigured } from '@/lib/checkup/repair/job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/checkup/[id]/file
 * The repaired workbook, once the job is done and the copy has passed our own after-check.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = withRateLimit(request, CHECKUP_POLL_RATE_LIMIT)
  if (limited.response) return limited.response

  const { id } = await params
  if (!isJobId(id) || !repairConfigured()) {
    return NextResponse.json({ error: 'That fixed copy could not be found.' }, { status: 404 })
  }

  try {
    const file = await fixedWorkbook(anthropicClient(), id)
    if (!file) return NextResponse.json({ error: 'There is no fixed copy to download for this check-up.' }, { status: 404 })
    const ascii = file.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    return new Response(Buffer.from(file.bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Content-Length': String(file.bytes.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[checkup] download failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'The fixed copy could not be fetched just now. Please try again.' }, { status: 502 })
  }
}
