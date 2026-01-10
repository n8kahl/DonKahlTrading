import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
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
    return NextResponse.json({ error: "Failed to create dashboard" }, { status: 500 })
  }
}
