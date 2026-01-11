'use client'

import { getHeatLegend, type LegendItem } from '@/lib/heat/colors'

interface HeatLegendProps {
  /** Which metric type to show legend for */
  metricType: 'high' | 'low' | 'both'
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

export function HeatLegend({ metricType, compact = false }: HeatLegendProps) {
  const highLegend = getHeatLegend('high')
  const lowLegend = getHeatLegend('low')

  if (compact) {
    // Compact single-line legend
    const items = metricType === 'low' ? lowLegend : highLegend
    const label = metricType === 'low' ? 'Near Low' : 'Near High'

    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/30">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}:
        </span>
        {items.map((item, idx) => (
          <div key={item.label} className="flex items-center gap-1">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: item.bg }}
            />
            {idx === 0 && (
              <span className="text-[9px] text-muted-foreground">Hot</span>
            )}
            {idx === items.length - 1 && (
              <span className="text-[9px] text-muted-foreground">Cold</span>
            )}
          </div>
        ))}
      </div>
    )
  }

  // Full legend
  return (
    <div className="flex flex-wrap items-center justify-end gap-4 px-4 py-2 border-t border-border bg-muted/30">
      {(metricType === 'high' || metricType === 'both') && (
        <LegendSection items={highLegend} label="Near High" />
      )}
      {(metricType === 'low' || metricType === 'both') && (
        <LegendSection items={lowLegend} label="Near Low" />
      )}
    </div>
  )
}
