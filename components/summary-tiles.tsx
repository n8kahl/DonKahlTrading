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
      gradient: "from-emerald-500/20 to-emerald-600/10",
      iconBg: "bg-emerald-500",
      iconColor: "text-white",
      glow: "shadow-emerald-500/20",
      valueColor: "text-emerald-400",
    },
    {
      label: "Within 1% of Highs",
      value: within1PctOfHighs,
      total: totalSymbols,
      icon: Target,
      gradient: "from-[var(--arizona-turquoise)]/20 to-[var(--arizona-sky)]/10",
      iconBg: "bg-[var(--arizona-turquoise)]",
      iconColor: "text-white",
      glow: "shadow-[var(--arizona-turquoise)]/20",
      valueColor: "text-[var(--arizona-turquoise)]",
    },
    {
      label: `New ${lookback}d Lows`,
      value: newLowsToday,
      total: totalSymbols,
      icon: TrendingDown,
      gradient: "from-red-500/20 to-red-600/10",
      iconBg: "bg-red-500",
      iconColor: "text-white",
      glow: "shadow-red-500/20",
      valueColor: "text-red-400",
    },
    {
      label: "Near 1% of Lows",
      value: within1PctOfLows,
      total: totalSymbols,
      icon: AlertTriangle,
      gradient: "from-[var(--arizona-sunset)]/20 to-[var(--arizona-copper)]/10",
      iconBg: "bg-[var(--arizona-sunset)]",
      iconColor: "text-white",
      glow: "shadow-[var(--arizona-sunset)]/20",
      valueColor: "text-[var(--arizona-sunset)]",
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {tiles.map((tile, index) => {
        const Icon = tile.icon
        const percentage = totalSymbols > 0 ? Math.round((tile.value / totalSymbols) * 100) : 0

        return (
          <Card
            key={index}
            className={`
              card-premium border-border/50 overflow-hidden hover-lift cursor-default
              relative group
            `}
          >
            {/* Gradient background overlay */}
            <div className={`absolute inset-0 bg-gradient-to-br ${tile.gradient} opacity-50`} />

            <CardContent className="pt-5 pb-4 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {tile.label}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold tabular-nums ${tile.valueColor}`}>
                      {tile.value}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / {tile.total}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 w-full bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${tile.iconBg} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

                {/* Icon */}
                <div className={`
                  p-2.5 rounded-xl ${tile.iconBg} ${tile.glow}
                  shadow-lg group-hover:scale-110 transition-transform duration-200
                `}>
                  <Icon className={`h-5 w-5 ${tile.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
