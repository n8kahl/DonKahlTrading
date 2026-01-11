import { NextResponse } from 'next/server'
import { parseNLQuery, describePlan } from '@/lib/nl-planner'
import { massiveRequest, transformForVisualization } from '@/lib/massive-openapi'

export const dynamic = 'force-dynamic'

/**
 * POST /api/nl-query
 * Execute a natural language query against the Massive API
 */
export async function POST(request: Request) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    // Parse NL query into API plan
    const plan = parseNLQuery(query)

    if (!plan) {
      return NextResponse.json({
        success: false,
        error: 'Could not understand the query. Try asking about a specific stock (e.g., "AAPL last month") or market data (e.g., "top gainers").',
        suggestions: [
          'AAPL last month',
          'Show me NVDA chart',
          'Top gainers today',
          'Market status',
          'How is TSLA doing?',
        ],
      })
    }

    // Execute the API request
    const result = await massiveRequest(plan.operationId, plan.params)

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        plan: {
          operationId: plan.operationId,
          params: plan.params,
          explanation: plan.explanation,
        },
      })
    }

    // Transform result for visualization
    const visualization = transformForVisualization(plan.operationId, result.data)

    return NextResponse.json({
      success: true,
      plan: {
        operationId: plan.operationId,
        params: plan.params,
        explanation: plan.explanation,
        description: describePlan(plan),
      },
      visualization,
      followupQuestions: plan.followupQuestions,
      rawData: result.data,
    })
  } catch (error) {
    console.error('NL Query error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
