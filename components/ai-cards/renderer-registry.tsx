'use client'

import type { ReactNode } from 'react'
import type { ResultEnvelope, PinConfig } from './types'
import { ComparisonChart } from './comparison-chart'
import { OptionsChainTable } from './options-chain-table'
import { MarketPulseHUD } from './market-pulse-hud'
import { HeatmapCard } from './heatmap-card'
import { BreadthPanel } from './breadth-panel'

// =============================================================================
// Renderer Registry
// Maps ResultEnvelope.type to React component renderers
// =============================================================================

type RendererFn = (data: ResultEnvelope, onPin?: (config: PinConfig) => void) => ReactNode

const renderers: Record<string, RendererFn> = {
  market_dashboard: (data, onPin) => (
    <ComparisonChart
      data={data as ResultEnvelope & { type: 'market_dashboard' }}
      onPin={onPin}
    />
  ),

  options_chain: (data, onPin) => (
    <OptionsChainTable
      data={data as ResultEnvelope & { type: 'options_chain' }}
      onPin={onPin}
    />
  ),

  pulse: (data, onPin) => (
    <MarketPulseHUD
      data={data as ResultEnvelope & { type: 'pulse' }}
      onPin={onPin}
    />
  ),

  heatmap: (data, onPin) => (
    <HeatmapCard
      data={data as ResultEnvelope & { type: 'heatmap' }}
      onPin={onPin}
    />
  ),

  breadth: (data, onPin) => (
    <BreadthPanel
      data={data as ResultEnvelope & { type: 'breadth' }}
      onPin={onPin}
    />
  ),

  // Price chart fallback (renders as comparison chart summary)
  price_chart: (data, onPin) => {
    const chartData = data as ResultEnvelope & { type: 'price_chart' }
    if (!chartData.data) {
      return (
        <div className="rounded-lg border border-white/10 bg-black/40 p-4 text-sm text-white/60">
          {chartData.error || 'No chart data available'}
        </div>
      )
    }
    // Convert to a simplified pulse display
    return (
      <MarketPulseHUD
        data={{
          type: 'pulse',
          symbols: [
            {
              symbol: chartData.symbol,
              price: chartData.data.summary.latestClose,
              change: chartData.data.summary.change,
              changePercent: chartData.data.summary.changePercent,
              volume: chartData.data.bars.reduce((sum, b) => sum + b.volume, 0),
              signal:
                chartData.data.summary.changePercent > 1
                  ? 'bullish'
                  : chartData.data.summary.changePercent < -1
                    ? 'bearish'
                    : 'neutral',
            },
          ],
          marketStatus: 'open',
          lastUpdated: new Date().toISOString(),
        }}
        onPin={onPin}
      />
    )
  },
}

// =============================================================================
// Registry API
// =============================================================================

/**
 * Renders a ResultEnvelope using the appropriate registered component.
 * Returns null if no renderer is found for the type.
 */
export function renderResult(
  data: ResultEnvelope,
  onPin?: (config: PinConfig) => void
): ReactNode {
  const renderer = renderers[data.type]
  if (!renderer) {
    console.warn(`[RendererRegistry] No renderer found for type: ${data.type}`)
    return (
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-400">
        Unknown result type: {data.type}
      </div>
    )
  }
  return renderer(data, onPin)
}

/**
 * Checks if a renderer exists for the given type.
 */
export function hasRenderer(type: string): boolean {
  return type in renderers
}

/**
 * Registers a custom renderer for a type.
 * Can be used to extend the registry with custom components.
 */
export function registerRenderer(type: string, renderer: RendererFn): void {
  renderers[type] = renderer
}

/**
 * Gets all registered result types.
 */
export function getRegisteredTypes(): string[] {
  return Object.keys(renderers)
}
