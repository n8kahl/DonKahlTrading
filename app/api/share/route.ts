import { type NextRequest, NextResponse } from "next/server"
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// Maximum payload size: 500KB
const MAX_PAYLOAD_SIZE = 500 * 1024

export async function POST(request: NextRequest) {
  // Rate limit check
  const rateLimit = withRateLimit(request, RATE_LIMITS.heavy)
  if (rateLimit.response) {
    return rateLimit.response
  }

  // Check if database is configured
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Share feature requires database configuration. Please set DATABASE_URL." },
      { status: 503 }
    )
  }

  try {
    // Dynamic import to avoid build-time errors
    const { prisma } = await import("@/lib/prisma")

    const body = await request.json()
    const { config, results } = body

    // Check payload size
    const resultsStr = JSON.stringify(results)
    if (resultsStr.length > MAX_PAYLOAD_SIZE) {
      return NextResponse.json(
        { error: "Share data too large. Reduce the number of symbols or days." },
        { status: 413 }
      )
    }

    const dashboard = await prisma.dashboard.create({
      data: {
        config: JSON.stringify(config),
        results: resultsStr,
      },
    })

    return NextResponse.json({ id: dashboard.id })
  } catch (error) {
    console.error("Error creating dashboard:", error)
    const message = error instanceof Error ? error.message : "Failed to create dashboard"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
