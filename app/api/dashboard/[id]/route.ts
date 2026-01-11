import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    )
  }

  try {
    const { prisma } = await import("@/lib/prisma")
    const { id } = await params
    const dashboard = await prisma.dashboard.findUnique({
      where: { id },
    })

    if (!dashboard) {
      return NextResponse.json({ error: "Dashboard not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: dashboard.id,
      createdAt: dashboard.createdAt,
      config: JSON.parse(dashboard.config),
      results: JSON.parse(dashboard.results),
    })
  } catch (error) {
    console.error("Error fetching dashboard:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch dashboard"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
