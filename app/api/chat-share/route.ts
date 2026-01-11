import { type NextRequest, NextResponse } from 'next/server'

// =============================================================================
// Chat Share API - Save and retrieve AI chat conversations
// =============================================================================

export async function POST(request: NextRequest) {
  // Check if database is configured
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'Share feature requires database configuration.' },
      { status: 503 }
    )
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const body = await request.json()

    const { messages, title } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Missing or invalid messages array' },
        { status: 400 }
      )
    }

    // Auto-generate title from first user message if not provided
    const autoTitle = title || messages.find((m: { role: string }) => m.role === 'user')?.content?.slice(0, 100) || 'Chat Export'

    const chatShare = await prisma.chatShare.create({
      data: {
        title: autoTitle,
        messages: JSON.stringify(messages),
      },
    })

    return NextResponse.json({
      id: chatShare.id,
      title: chatShare.title,
      createdAt: chatShare.createdAt,
    })
  } catch (error) {
    console.error('Error creating chat share:', error)
    const message = error instanceof Error ? error.message : 'Failed to create chat share'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json(
      { error: 'Missing chat share id' },
      { status: 400 }
    )
  }

  // Check if database is configured
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'Share feature requires database configuration.' },
      { status: 503 }
    )
  }

  try {
    const { prisma } = await import('@/lib/prisma')

    const chatShare = await prisma.chatShare.findUnique({
      where: { id },
    })

    if (!chatShare) {
      return NextResponse.json(
        { error: 'Chat share not found' },
        { status: 404 }
      )
    }

    // Update view count
    await prisma.chatShare.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
    })

    return NextResponse.json({
      id: chatShare.id,
      title: chatShare.title,
      messages: JSON.parse(chatShare.messages),
      createdAt: chatShare.createdAt,
      viewCount: chatShare.viewCount + 1,
    })
  } catch (error) {
    console.error('Error fetching chat share:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch chat share'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
