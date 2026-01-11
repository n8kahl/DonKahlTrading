'use client'

import type { ReactNode } from 'react'
import type { ResultEnvelope, PinConfig } from './types'
import { ComparisonChart } from './comparison-chart'
import { OptionsChainTable } from './options-chain-table'
import { MarketPulseHUD } from './market-pulse-hud'
import { HeatmapCard } from './heatmap-card'
import { BreadthPanel } from './breadth-panel'
import { ErrorCard } from './error-card'
import { BreadthReport } from '@/components/breadth-report'

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

  breadth_report: (data) => {
    // Type assertion for breadth report data from AI tool
    const reportData = data as unknown as {
      type: 'breadth_report'
      universe: {
        id: string
        label: string
        disclosureText: string
        etfProxy: string
      }
      params: {
        lookbackDays: number
        searchDays: number
        windowDays: number
        metric: 'new_lows' | 'new_highs'
      }
      constituentsUsed: number
      failedTickers: string[]
      series: Array<{
        date: string
        pctNewLows: number
        pctNewHighs: number
        countNewLows: number
        countNewHighs: number
        countValid: number
        newLowSymbols: string[]
        newHighSymbols: string[]
      }>
      peak: {
        date: string
        value: number
        count: number
        countValid: number
        symbols: string[]
      } | null
      window: {
        windowStart: string
        windowEnd: string
        peakDate: string
        peakValue: number
        avgValue: number
        windowDays: number
        tradingDays: number
      } | null
      topPeaks?: Array<{
        date: string
        value: number
        count: number
        countValid: number
        symbols: string[]
      }>
      asOf: string
    }

    return (
      <BreadthReport
        universe={reportData.universe}
        params={reportData.params}
        constituentsUsed={reportData.constituentsUsed}
        failedTickers={reportData.failedTickers}
        series={reportData.series}
        peak={reportData.peak}
        window={reportData.window}
        topPeaks={reportData.topPeaks}
        asOf={reportData.asOf}
      />
    )
  },

  // Universe explanation (text response)
  universe_explanation: (data) => {
    const explainData = data as unknown as {
      type: 'universe_explanation'
      found: boolean
      message?: string
      universe?: {
        id: string
        label: string
        description: string
        disclosureText: string
        etfProxy: string
        symbolCount: number
        sampleSymbols: string[]
      }
    }

    if (!explainData.found) {
      return (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
          {explainData.message}
        </div>
      )
    }

    const u = explainData.universe!
    return (
      <div className="rounded-lg border border-white/10 bg-black/40 p-4 text-sm">
        <h4 className="font-semibold text-white mb-2">{u.label}</h4>
        <p className="text-white/70 mb-3">{u.description}</p>
        <div className="space-y-2 text-xs text-white/60">
          <p><span className="text-white/40">ETF Proxy:</span> {u.etfProxy}</p>
          <p><span className="text-white/40">Constituents:</span> {u.symbolCount}</p>
          <p><span className="text-white/40">Sample:</span> {u.sampleSymbols.join(', ')}</p>
        </div>
        <p className="mt-3 text-xs text-amber-400/80 italic">{u.disclosureText}</p>
      </div>
    )
  },

  // Universe list
  universe_list: (data) => {
    const listData = data as unknown as {
      type: 'universe_list'
      universes: Array<{
        id: string
        label: string
        description: string
        etfProxy: string
        symbolCount: number
      }>
    }

    return (
      <div className="rounded-lg border border-white/10 bg-black/40 p-4">
        <h4 className="font-semibold text-white mb-3">Available Breadth Universes</h4>
        <div className="space-y-2">
          {listData.universes.map(u => (
            <div key={u.id} className="flex items-center justify-between text-sm border-b border-white/5 pb-2">
              <div>
                <span className="font-mono text-primary">{u.id}</span>
                <span className="text-white/40 mx-2">→</span>
                <span className="text-white/70">{u.label}</span>
              </div>
              <span className="text-xs text-white/40">{u.symbolCount} symbols</span>
            </div>
          ))}
        </div>
      </div>
    )
  },

  error: (data) => (
    <ErrorCard
      data={data as ResultEnvelope & { type: 'error' }}
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
