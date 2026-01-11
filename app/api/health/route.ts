import { NextResponse } from 'next/server'
import { performHealthCheck } from '@/lib/massive-api'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Health check endpoint for monitoring and load balancers.
 * GET /api/health
 *
 * Returns:
 * - 200: healthy or degraded
 * - 503: unhealthy
 */
export async function GET() {
  const startTime = Date.now()

  try {
    const result = await performHealthCheck()
    const responseTimeMs = Date.now() - startTime

    const response = {
      ...result,
      responseTimeMs,
    }

    // Return 503 if unhealthy for load balancer detection
    const status = result.status === 'unhealthy' ? 503 : 200

    return NextResponse.json(response, {
      status,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${responseTimeMs}ms`,
      },
    })
  } catch (error) {
    const responseTimeMs = Date.now() - startTime

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs,
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Response-Time': `${responseTimeMs}ms`,
        },
      }
    )
  }
}
