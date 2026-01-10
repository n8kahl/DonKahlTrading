import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 })
  }
}
