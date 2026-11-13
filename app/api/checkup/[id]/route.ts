import { NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rate-limit'
import { CHECKUP_POLL_RATE_LIMIT } from '@/lib/checkup/guard'
import { anthropicClient, isJobId, repairConfigured, repairStatus } from '@/lib/checkup/repair/job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/checkup/[id]
 * Where a repair job has got to: working (with plain-language progress), done (with the report
 * and our own after-check), or failed (with a plain reason).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = withRateLimit(request, CHECKUP_POLL_RATE_LIMIT)
  if (limited.response) return limited.response

  const { id } = await params
  if (!isJobId(id) || !repairConfigured()) {
    return NextResponse.json(
      { state: 'failed', code: 'not-found', reason: 'That check-up could not be found. Please start again.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  try {
    const status = await repairStatus(anthropicClient(), id)
    return NextResponse.json(status, {
      status: status.state === 'failed' && status.code === 'not-found' ? 404 : 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[checkup] status failed:', error instanceof Error ? error.message : error)
    // A hiccup while asking is not a failed repair: the page keeps polling.
    return NextResponse.json(
      { state: 'working', progress: [], stage: 'Still working. Checking again in a moment.', steps: 0, elapsedSeconds: 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
