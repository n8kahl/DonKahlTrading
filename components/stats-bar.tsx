"use client"

import { TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react"
import type { HeatmapMetrics } from "@/lib/massive-api"
import { cn } from "@/lib/utils"

interface StatsBarProps {
  data: Record<string, HeatmapMetrics[]>
  lookback: number
}

export function StatsBar({ data, lookback }: StatsBarProps) {
  const symbols = Object.keys(data)
  const totalSymbols = symbols.length

  // Get the most recent metrics for each symbol
  const latestMetrics = symbols
    .map((symbol) => {
      const metrics = data[symbol]
      return metrics?.[metrics.length - 1]
    })
    .filter(Boolean)

  const newHighsToday = latestMetrics.filter((m) => m.daysSinceHigh === 0).length
  const nearHighs = latestMetrics.filter((m) => m.pctFromHigh <= 2 && m.daysSinceHigh > 0).length
  const newLowsToday = latestMetrics.filter((m) => m.daysSinceLow === 0).length
  const nearLows = latestMetrics.filter((m) => m.pctFromLow <= 2 && m.daysSinceLow > 0).length

  const stats = [
    {
      label: "New Highs",
      value: newHighsToday,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
      show: true,
    },
    {
      label: "Near High",
      value: nearHighs,
      icon: Target,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/5",
      show: nearHighs > 0,
    },
    {
      label: "New Lows",
      value: newLowsToday,
      icon: TrendingDown,
      color: "text-rose-600",
      bgColor: "bg-rose-500/10",
      show: true,
    },
    {
      label: "Near Low",
      value: nearLows,
      icon: AlertTriangle,
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
      show: nearLows > 0,
    },
  ]

  return (
    <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {lookback}d Extremes:
      </span>
      <div className="flex items-center gap-1.5">
        {stats.filter(s => s.show).map((stat, i) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap",
                stat.bgColor,
                stat.color
              )}
            >
              <Icon className="w-3 h-3" />
              <span className="font-mono">{stat.value}</span>
              <span className="text-muted-foreground font-normal">{stat.label}</span>
            </div>
          )
        })}
      </div>
      <div className="flex-1" />
      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
        {totalSymbols} symbols
      </span>
    </div>
  )
}
