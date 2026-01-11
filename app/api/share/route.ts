import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
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

    const dashboard = await prisma.dashboard.create({
      data: {
        config: JSON.stringify(config),
        results: JSON.stringify(results),
      },
    })

    return NextResponse.json({ id: dashboard.id })
  } catch (error) {
    console.error("Error creating dashboard:", error)
    const message = error instanceof Error ? error.message : "Failed to create dashboard"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
