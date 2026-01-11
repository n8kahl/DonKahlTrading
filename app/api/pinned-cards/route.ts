import { type NextRequest, NextResponse } from 'next/server'

// =============================================================================
// Pinned Cards API - Manages AI-generated cards pinned to dashboard
// =============================================================================

export async function GET() {
  // Check if database is configured
  if (!process.env.DATABASE_URL) {
    // Fallback to localStorage on client-side
    return NextResponse.json({
      cards: [],
      source: 'none',
      message: 'Database not configured. Cards will be stored locally.'
    })
  }

  try {
    const { prisma } = await import('@/lib/prisma')

    const cards = await prisma.pinnedCard.findMany({
      where: { active: true },
      orderBy: { position: 'asc' },
    })

    return NextResponse.json({
      cards: cards.map((card) => ({
        id: card.id,
        type: card.type,
        title: card.title,
        config: JSON.parse(card.config),
        position: card.position,
        createdAt: card.createdAt,
      })),
      source: 'database',
    })
  } catch (error) {
    console.error('Error fetching pinned cards:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pinned cards', cards: [] },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Check if database is configured
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'Database not configured. Use localStorage for pinned cards.' },
      { status: 503 }
    )
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const body = await request.json()

    const { type, title, config } = body

    if (!type || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title' },
        { status: 400 }
      )
    }

    // Get the next position
    const lastCard = await prisma.pinnedCard.findFirst({
      where: { active: true },
      orderBy: { position: 'desc' },
    })
    const nextPosition = (lastCard?.position ?? -1) + 1

    const card = await prisma.pinnedCard.create({
      data: {
        type,
        title,
        config: JSON.stringify(config || {}),
        position: nextPosition,
        active: true,
      },
    })

    return NextResponse.json({
      id: card.id,
      type: card.type,
      title: card.title,
      config: JSON.parse(card.config),
      position: card.position,
      createdAt: card.createdAt,
    })
  } catch (error) {
    console.error('Error creating pinned card:', error)
    const message = error instanceof Error ? error.message : 'Failed to create pinned card'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // Check if database is configured
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    )
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing card id' },
        { status: 400 }
      )
    }

    // Soft delete by setting active to false
    await prisma.pinnedCard.update({
      where: { id },
      data: { active: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting pinned card:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete pinned card'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  // Check if database is configured
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    )
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const body = await request.json()
    const { id, position, title } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Missing card id' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (typeof position === 'number') updateData.position = position
    if (typeof title === 'string') updateData.title = title

    const card = await prisma.pinnedCard.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      id: card.id,
      type: card.type,
      title: card.title,
      position: card.position,
    })
  } catch (error) {
    console.error('Error updating pinned card:', error)
    const message = error instanceof Error ? error.message : 'Failed to update pinned card'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
