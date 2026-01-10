"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { HeatmapMetrics } from "@/lib/massive-api"
import { DrilldownSheet } from "./drilldown-sheet"

interface EnhancedHeatmapTableProps {
  dates: string[]
  data: Record<string, HeatmapMetrics[]>
  rawBars: Record<string, any[]>
  lookback: number
  metric: "pctFromHigh" | "daysSinceHigh" | "pctFromLow" | "daysSinceLow"
  sortBy?: string
}

export function EnhancedHeatmapTable({ dates, data, rawBars, lookback, metric, sortBy }: EnhancedHeatmapTableProps) {
  const [drilldownSymbol, setDrilldownSymbol] = useState<string | null>(null)
  const [drilldownDateIndex, setDrilldownDateIndex] = useState<number | null>(null)

  let symbols = Object.keys(data)

  // Apply sorting
  if (sortBy && symbols.length > 0) {
    const latestIndex = dates.length - 1
    symbols = [...symbols].sort((a, b) => {
      const aMetric = data[a]?.[latestIndex]
      const bMetric = data[b]?.[latestIndex]

      if (!aMetric || !bMetric) return 0

      if (sortBy === "closestToHigh") {
        return aMetric.pctFromHigh - bMetric.pctFromHigh
      } else if (sortBy === "mostDays") {
        return bMetric.daysSinceHigh - aMetric.daysSinceHigh
      } else if (sortBy === "freshBreakouts") {
        return aMetric.daysSinceHigh - bMetric.daysSinceHigh
      }
      return 0
    })
  }

  const getDisplayValue = (metrics: HeatmapMetrics) => {
    switch (metric) {
      case "pctFromHigh":
        return `${metrics.pctFromHigh.toFixed(1)}%`
      case "daysSinceHigh":
        return metrics.daysSinceHigh.toString()
      case "pctFromLow":
        return `${metrics.pctFromLow.toFixed(1)}%`
      case "daysSinceLow":
        return metrics.daysSinceLow.toString()
    }
  }

  // Arizona-themed heatmap colors
  const getHeatmapColor = (metrics: HeatmapMetrics) => {
    let intensity = 0

    switch (metric) {
      case "pctFromHigh":
        intensity = 1 - Math.min(metrics.pctFromHigh / 10, 1)
        break
      case "daysSinceHigh":
        intensity = 1 - metrics.daysSinceHigh / lookback
        break
      case "pctFromLow":
        intensity = 1 - Math.min(metrics.pctFromLow / 10, 1)
        break
      case "daysSinceLow":
        intensity = 1 - metrics.daysSinceLow / lookback
        break
    }

    // Arizona-themed colors: copper/terracotta for lows, turquoise/sage for highs
    if (metric.includes("High")) {
      // Turquoise to sage gradient for highs (good = close to high)
      if (intensity > 0.8) {
        return `oklch(0.65 0.14 195 / ${0.7 + intensity * 0.3})` // Bright turquoise
      } else if (intensity > 0.5) {
        return `oklch(0.55 0.10 175 / ${0.5 + intensity * 0.3})` // Teal
      } else if (intensity > 0.2) {
        return `oklch(0.45 0.06 160 / ${0.3 + intensity * 0.2})` // Sage
      }
      return `oklch(0.25 0.02 160 / 0.2)` // Muted
    } else {
      // Copper to sunset for lows (good = close to low means buy opportunity)
      if (intensity > 0.8) {
        return `oklch(0.65 0.20 30 / ${0.7 + intensity * 0.3})` // Bright sunset
      } else if (intensity > 0.5) {
        return `oklch(0.55 0.18 45 / ${0.5 + intensity * 0.3})` // Copper
      } else if (intensity > 0.2) {
        return `oklch(0.45 0.12 50 / ${0.3 + intensity * 0.2})` // Terracotta
      }
      return `oklch(0.25 0.05 50 / 0.2)` // Muted
    }
  }

  const getTextColor = (metrics: HeatmapMetrics) => {
    let intensity = 0

    switch (metric) {
      case "pctFromHigh":
        intensity = 1 - Math.min(metrics.pctFromHigh / 10, 1)
        break
      case "daysSinceHigh":
        intensity = 1 - metrics.daysSinceHigh / lookback
        break
      case "pctFromLow":
        intensity = 1 - Math.min(metrics.pctFromLow / 10, 1)
        break
      case "daysSinceLow":
        intensity = 1 - metrics.daysSinceLow / lookback
        break
    }

    return intensity > 0.5 ? "text-white font-semibold" : "text-foreground/80"
  }

  const handleCellClick = (symbol: string, dateIndex: number) => {
    setDrilldownSymbol(symbol)
    setDrilldownDateIndex(dateIndex)
  }

  return (
    <>
      <TooltipProvider>
        <div className="relative w-full overflow-auto rounded-lg border border-border/50">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-muted/80 backdrop-blur-sm border-b border-r border-border/50 px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Date
                </th>
                {symbols.map((symbol) => (
                  <th
                    key={symbol}
                    className="bg-muted/80 backdrop-blur-sm border-b border-border/50 px-4 py-3 text-center font-bold text-xs uppercase tracking-wider text-foreground"
                  >
                    {symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date, dateIndex) => (
                <tr
                  key={date}
                  className="group hover:bg-muted/30 transition-colors"
                >
                  <td className="sticky left-0 z-10 bg-card/95 backdrop-blur-sm border-b border-r border-border/30 px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap group-hover:bg-muted/50">
                    {date}
                  </td>
                  {symbols.map((symbol) => {
                    const metrics = data[symbol]?.[dateIndex]
                    if (!metrics) {
                      return (
                        <td key={symbol} className="border-b border-border/30 px-4 py-2.5 text-center text-muted-foreground/50">
                          —
                        </td>
                      )
                    }

                    return (
                      <Tooltip key={symbol}>
                        <TooltipTrigger asChild>
                          <td
                            className={cn(
                              "border-b border-border/20 px-3 py-2 text-center font-mono text-xs tabular-nums cursor-pointer",
                              "transition-all duration-150 hover:scale-105 hover:shadow-lg hover:z-10 relative",
                              getTextColor(metrics)
                            )}
                            style={{
                              backgroundColor: getHeatmapColor(metrics),
                            }}
                            onClick={() => handleCellClick(symbol, dateIndex)}
                          >
                            {getDisplayValue(metrics)}
                          </td>
                        </TooltipTrigger>
                        <TooltipContent
                          className="max-w-xs bg-popover/95 backdrop-blur-sm border-border/50"
                          side="top"
                        >
                          <div className="space-y-2 text-xs p-1">
                            <p className="font-bold text-sm border-b border-border/50 pb-1.5">
                              {symbol} • {date}
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                              <span className="text-muted-foreground">Days since high:</span>
                              <span className="font-mono font-medium text-[var(--arizona-turquoise)]">
                                {metrics.daysSinceHigh}
                              </span>
                              <span className="text-muted-foreground">% from high:</span>
                              <span className="font-mono font-medium text-[var(--arizona-turquoise)]">
                                {metrics.pctFromHigh.toFixed(2)}%
                              </span>
                              <span className="text-muted-foreground">Days since low:</span>
                              <span className="font-mono font-medium text-[var(--arizona-sunset)]">
                                {metrics.daysSinceLow}
                              </span>
                              <span className="text-muted-foreground">% from low:</span>
                              <span className="font-mono font-medium text-[var(--arizona-sunset)]">
                                {metrics.pctFromLow.toFixed(2)}%
                              </span>
                              <span className="text-muted-foreground">Rolling high:</span>
                              <span className="font-mono">{metrics.rollingHigh.toFixed(2)}</span>
                              <span className="text-muted-foreground">Rolling low:</span>
                              <span className="font-mono">{metrics.rollingLow.toFixed(2)}</span>
                              <span className="text-muted-foreground">Current:</span>
                              <span className="font-mono font-medium">{metrics.currentValue.toFixed(2)}</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TooltipProvider>

      {drilldownSymbol && drilldownDateIndex !== null && (
        <DrilldownSheet
          symbol={drilldownSymbol}
          date={dates[drilldownDateIndex]}
          bars={rawBars[drilldownSymbol] || []}
          lookback={lookback}
          onClose={() => {
            setDrilldownSymbol(null)
            setDrilldownDateIndex(null)
          }}
        />
      )}
    </>
  )
}
