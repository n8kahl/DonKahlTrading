"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { HeatmapMetrics } from "@/lib/massive-api"
import { DrilldownSheet } from "./drilldown-sheet"
import { getHeatStyle, type HeatMetric } from "@/lib/heat/colors"

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

  // Apply sorting based on current metric type
  const isHighMetric = metric.includes("High")
  if (sortBy && sortBy !== "none" && symbols.length > 0) {
    const latestIndex = dates.length - 1
    symbols = [...symbols].sort((a, b) => {
      const aMetric = data[a]?.[latestIndex]
      const bMetric = data[b]?.[latestIndex]

      if (!aMetric || !bMetric) return 0

      if (sortBy === "closestToExtreme") {
        // Sort by % from extreme (closest first)
        const aVal = isHighMetric ? aMetric.pctFromHigh : aMetric.pctFromLow
        const bVal = isHighMetric ? bMetric.pctFromHigh : bMetric.pctFromLow
        return aVal - bVal
      } else if (sortBy === "mostDays") {
        // Sort by days since extreme (most days first)
        const aVal = isHighMetric ? aMetric.daysSinceHigh : aMetric.daysSinceLow
        const bVal = isHighMetric ? bMetric.daysSinceHigh : bMetric.daysSinceLow
        return bVal - aVal
      } else if (sortBy === "freshBreakouts") {
        // Sort by days since extreme (fewest days first - fresh breakouts)
        const aVal = isHighMetric ? aMetric.daysSinceHigh : aMetric.daysSinceLow
        const bVal = isHighMetric ? bMetric.daysSinceHigh : bMetric.daysSinceLow
        return aVal - bVal
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

  // Get heat style using shared color system
  const getCellStyle = (metrics: HeatmapMetrics) => {
    const value = metrics[metric]
    return getHeatStyle({ metric: metric as HeatMetric, value, lookback })
  }

  const handleCellClick = (symbol: string, dateIndex: number) => {
    setDrilldownSymbol(symbol)
    setDrilldownDateIndex(dateIndex)
  }

  return (
    <>
      <TooltipProvider>
        <div className="relative w-full overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-muted border-b border-r border-border px-3 py-2 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Date
                </th>
                {symbols.map((symbol) => (
                  <th
                    key={symbol}
                    className="bg-muted border-b border-border px-3 py-2 text-center font-bold text-xs uppercase tracking-wider text-foreground"
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
                  className="hover:bg-muted/50 transition-colors"
                >
                  <td className="sticky left-0 z-10 bg-card border-b border-r border-border px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {date}
                  </td>
                  {symbols.map((symbol) => {
                    const metrics = data[symbol]?.[dateIndex]
                    if (!metrics) {
                      return (
                        <td key={symbol} className="border-b border-border px-3 py-2 text-center text-muted-foreground/50">
                          —
                        </td>
                      )
                    }

                    const style = getCellStyle(metrics)
                    return (
                      <Tooltip key={symbol}>
                        <TooltipTrigger asChild>
                          <td
                            className={cn(
                              "border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums cursor-pointer",
                              "hover:brightness-110",
                              style.intensity > 0.5 ? "font-semibold" : ""
                            )}
                            style={{
                              backgroundColor: style.bg,
                              color: style.fg,
                              transition: "background-color 0.3s ease, color 0.3s ease",
                            }}
                            onClick={() => handleCellClick(symbol, dateIndex)}
                          >
                            {getDisplayValue(metrics)}
                          </td>
                        </TooltipTrigger>
                        <TooltipContent
                          className="max-w-xs bg-popover border-border"
                          side="top"
                        >
                          <div className="space-y-2 text-xs p-1">
                            <p className="font-bold text-sm border-b border-border pb-1.5">
                              {symbol} • {date}
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                              <span className="text-muted-foreground">Days since high:</span>
                              <span className="font-mono font-medium text-emerald-600">
                                {metrics.daysSinceHigh}
                              </span>
                              <span className="text-muted-foreground">% from high:</span>
                              <span className="font-mono font-medium text-emerald-600">
                                {metrics.pctFromHigh.toFixed(2)}%
                              </span>
                              <span className="text-muted-foreground">Days since low:</span>
                              <span className="font-mono font-medium text-red-600">
                                {metrics.daysSinceLow}
                              </span>
                              <span className="text-muted-foreground">% from low:</span>
                              <span className="font-mono font-medium text-red-600">
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
