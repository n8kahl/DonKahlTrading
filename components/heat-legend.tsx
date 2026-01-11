'use client'

import { getHeatLegend, type LegendItem } from '@/lib/heat/colors'

interface HeatLegendProps {
  /** Which metric type to show legend for */
  metricType: 'high' | 'low' | 'both'
  /** Whether showing days metric (true) or percentage (false) */
  isDays?: boolean
  /** Compact mode for smaller displays */
  compact?: boolean
}

function LegendSection({ items, label }: { items: LegendItem[]; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
        {label}:
      </span>
      <div className="flex items-center gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-sm border border-border/30"
              style={{ backgroundColor: item.bg }}
            />
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HeatLegend({ metricType, isDays = true, compact = false }: HeatLegendProps) {
  const highLegend = getHeatLegend('high', isDays)
  const lowLegend = getHeatLegend('low', isDays)

  if (compact) {
    // Compact single-line legend
    const items = metricType === 'low' ? lowLegend : highLegend
    const label = metricType === 'low'
      ? (isDays ? 'Days from Low' : '% from Low')
      : (isDays ? 'Days from High' : '% from High')

    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">
          {label}:
        </span>
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-muted-foreground mr-0.5">Hot</span>
          {items.map((item) => (
            <div
              key={item.label}
              className="w-3 h-3 rounded-sm border border-border/20"
              style={{ backgroundColor: item.bg }}
              title={item.label}
            />
          ))}
          <span className="text-[9px] text-muted-foreground ml-0.5">Cold</span>
        </div>
      </div>
    )
  }

  // Full legend
  return (
    <div className="flex flex-wrap items-center justify-end gap-4 px-4 py-2 border-t border-border bg-muted/30">
      {(metricType === 'high' || metricType === 'both') && (
        <LegendSection
          items={highLegend}
          label={isDays ? "Days from High" : "% from High"}
        />
      )}
      {(metricType === 'low' || metricType === 'both') && (
        <LegendSection
          items={lowLegend}
          label={isDays ? "Days from Low" : "% from Low"}
        />
      )}
    </div>
  )
}
