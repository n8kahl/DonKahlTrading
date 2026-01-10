"use client"

import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react"
import type { HeatmapMetrics } from "@/lib/massive-api"

interface SummaryTilesProps {
  data: Record<string, HeatmapMetrics[]>
  lookback: number
}

export function SummaryTiles({ data, lookback }: SummaryTilesProps) {
  const symbols = Object.keys(data)
  const totalSymbols = symbols.length

  // Get the most recent metrics for each symbol
  const latestMetrics = symbols
    .map((symbol) => {
      const metrics = data[symbol]
      return metrics[metrics.length - 1]
    })
    .filter(Boolean)

  const newHighsToday = latestMetrics.filter((m) => m.daysSinceHigh === 0).length
  const within1PctOfHighs = latestMetrics.filter((m) => m.pctFromHigh <= 1).length
  const newLowsToday = latestMetrics.filter((m) => m.daysSinceLow === 0).length
  const within1PctOfLows = latestMetrics.filter((m) => m.pctFromLow <= 1).length

  const tiles = [
    {
      label: `New ${lookback}d Highs`,
      value: newHighsToday,
      total: totalSymbols,
      icon: TrendingUp,
      iconBg: "bg-emerald-600",
      iconColor: "text-white",
      valueColor: "text-emerald-600",
      progressColor: "bg-emerald-600",
    },
    {
      label: "Within 1% of Highs",
      value: within1PctOfHighs,
      total: totalSymbols,
      icon: Target,
      iconBg: "bg-primary",
      iconColor: "text-white",
      valueColor: "text-primary",
      progressColor: "bg-primary",
    },
    {
      label: `New ${lookback}d Lows`,
      value: newLowsToday,
      total: totalSymbols,
      icon: TrendingDown,
      iconBg: "bg-red-600",
      iconColor: "text-white",
      valueColor: "text-red-600",
      progressColor: "bg-red-600",
    },
    {
      label: "Near 1% of Lows",
      value: within1PctOfLows,
      total: totalSymbols,
      icon: AlertTriangle,
      iconBg: "bg-amber-600",
      iconColor: "text-white",
      valueColor: "text-amber-600",
      progressColor: "bg-amber-600",
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((tile, index) => {
        const Icon = tile.icon
        const percentage = totalSymbols > 0 ? Math.round((tile.value / totalSymbols) * 100) : 0

        return (
          <Card key={index} className="border-border">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {tile.label}
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-2xl font-bold font-mono tabular-nums ${tile.valueColor}`}>
                      {tile.value}
                    </span>
                    <span className="text-sm text-muted-foreground font-mono">
                      / {tile.total}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 w-full bg-muted rounded overflow-hidden">
                    <div
                      className={`h-full ${tile.progressColor}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

                {/* Icon */}
                <div className={`p-2 rounded ${tile.iconBg}`}>
                  <Icon className={`h-4 w-4 ${tile.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
