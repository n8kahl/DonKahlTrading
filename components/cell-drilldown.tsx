"use client"

import { useState, useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import type { DailyBar, HeatmapMetrics } from "@/lib/massive-api"
import { detectSignal } from "@/lib/heat/colors"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Activity,
  Target,
  GitCompare,
} from "lucide-react"

// =============================================================================
// Types
// =============================================================================

interface CellDrilldownProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  symbol: string
  date: string
  metrics: HeatmapMetrics
  highMetrics?: HeatmapMetrics
  closeMetrics?: HeatmapMetrics
  bars: DailyBar[]
  lookback: number
}

interface ChartDataPoint {
  date: string
  close: number
  high: number
  low: number
  rollingHigh?: number
  rollingLow?: number
  isSelected?: boolean
  isHighDate?: boolean
}

// =============================================================================
// Helper Functions
// =============================================================================

function computeRollingExtremes(
  bars: DailyBar[],
  lookback: number,
  basis: "high" | "close"
): { rollingHighs: number[]; rollingLows: number[]; highDates: string[]; lowDates: string[] } {
  const rollingHighs: number[] = []
  const rollingLows: number[] = []
  const highDates: string[] = []
  const lowDates: string[] = []

  for (let i = 0; i < bars.length; i++) {
    const windowStart = Math.max(0, i - lookback + 1)
    const window = bars.slice(windowStart, i + 1)

    if (basis === "high") {
      const values = window.map((b) => b.high)
      const maxVal = Math.max(...values)
      const minVal = Math.min(...window.map((b) => b.low))
      rollingHighs.push(maxVal)
      rollingLows.push(minVal)

      // Find the date of the high
      const highIdx = values.indexOf(maxVal)
      highDates.push(window[highIdx]?.date || "")

      const lowValues = window.map((b) => b.low)
      const lowIdx = lowValues.indexOf(minVal)
      lowDates.push(window[lowIdx]?.date || "")
    } else {
      const values = window.map((b) => b.close)
      const maxVal = Math.max(...values)
      const minVal = Math.min(...values)
      rollingHighs.push(maxVal)
      rollingLows.push(minVal)

      const highIdx = values.indexOf(maxVal)
      highDates.push(window[highIdx]?.date || "")

      const lowIdx = values.indexOf(minVal)
      lowDates.push(window[lowIdx]?.date || "")
    }
  }

  return { rollingHighs, rollingLows, highDates, lowDates }
}

function formatPrice(value: number): string {
  if (value >= 10000) return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  if (value >= 100) return value.toFixed(2)
  return value.toFixed(2)
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

// =============================================================================
// Sub-Components
// =============================================================================

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  colorClass = "",
}: {
  label: string
  value: string | number
  subValue?: string
  icon: React.ElementType
  colorClass?: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`p-2 rounded-md ${colorClass || "bg-primary/10"}`}>
        <Icon className={`w-4 h-4 ${colorClass ? "text-white" : "text-primary"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
        {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
      </div>
    </div>
  )
}

function SignalBadge({ highMetrics, closeMetrics }: { highMetrics?: HeatmapMetrics; closeMetrics?: HeatmapMetrics }) {
  if (!highMetrics || !closeMetrics) return null

  const signal = detectSignal(highMetrics.daysSinceHigh, closeMetrics.daysSinceHigh)

  if (!signal.type) return null

  return (
    <Badge
      variant={signal.type === "confirmed" ? "default" : "secondary"}
      className={
        signal.type === "confirmed"
          ? "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30"
          : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
      }
    >
      {signal.type === "confirmed" ? "Confirmed Breakout" : "Rejected Breakout"}
    </Badge>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function CellDrilldown({
  open,
  onOpenChange,
  symbol,
  date,
  metrics,
  highMetrics,
  closeMetrics,
  bars,
  lookback,
}: CellDrilldownProps) {
  const [compareBases, setCompareBases] = useState(false)
  const [showingBasis, setShowingBasis] = useState<"high" | "close">("high")

  // Compute chart data with rolling high/low lines
  const chartData = useMemo((): ChartDataPoint[] => {
    if (!bars || bars.length === 0) return []

    // Take last 90 bars for the mini chart
    const recentBars = bars.slice(-90)
    const { rollingHighs, rollingLows, highDates } = computeRollingExtremes(
      recentBars,
      Math.min(lookback, recentBars.length),
      showingBasis
    )

    const selectedIdx = recentBars.findIndex((b) => b.date === date)
    const lastHighDate = selectedIdx >= 0 ? highDates[selectedIdx] : ""

    return recentBars.map((bar, i) => ({
      date: bar.date,
      close: bar.close,
      high: bar.high,
      low: bar.low,
      rollingHigh: rollingHighs[i],
      rollingLow: rollingLows[i],
      isSelected: bar.date === date,
      isHighDate: bar.date === lastHighDate,
    }))
  }, [bars, lookback, date, showingBasis])

  // Find selected bar data
  const selectedBar = useMemo(() => {
    return bars.find((b) => b.date === date)
  }, [bars, date])

  // Compute additional stats
  const stats = useMemo(() => {
    if (!selectedBar || chartData.length === 0) return null

    const selectedPoint = chartData.find((d) => d.date === date)
    const rollingHigh = selectedPoint?.rollingHigh || 0
    const currentValue = showingBasis === "high" ? selectedBar.high : selectedBar.close
    const pctFromHigh = rollingHigh > 0 ? ((rollingHigh - currentValue) / rollingHigh) * 100 : 0

    // Find the high date
    const { highDates } = computeRollingExtremes(
      bars.slice(-90),
      Math.min(lookback, bars.slice(-90).length),
      showingBasis
    )
    const idx = bars.slice(-90).findIndex((b) => b.date === date)
    const lastHighDate = idx >= 0 ? highDates[idx] : ""

    return {
      rollingHigh,
      currentValue,
      pctFromHigh,
      lastHighDate,
      daysSinceHigh: showingBasis === "high"
        ? (highMetrics?.daysSinceHigh ?? metrics.daysSinceHigh)
        : (closeMetrics?.daysSinceHigh ?? metrics.daysSinceHigh),
    }
  }, [selectedBar, chartData, date, showingBasis, lookback, bars, metrics, highMetrics, closeMetrics])

  // Determine color based on days from high
  const getDaysColor = (days: number) => {
    if (days === 0) return "bg-red-500"
    if (days <= 3) return "bg-orange-500"
    if (days <= 10) return "bg-orange-600/70"
    if (days <= 21) return "bg-orange-800/50"
    return "bg-muted"
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <span className="text-lg font-bold">{symbol}</span>
              <SignalBadge highMetrics={highMetrics} closeMetrics={closeMetrics} />
            </SheetTitle>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono">{date}</span>
            <span>•</span>
            <span>{lookback}d lookback</span>
            <span>•</span>
            <span className="capitalize">{showingBasis} basis</span>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Basis Toggle */}
          {highMetrics && closeMetrics && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="compare-toggle" className="text-sm font-medium">
                  Compare Bases
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant={showingBasis === "high" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setShowingBasis("high")}
                >
                  HIGH
                </Button>
                <Button
                  variant={showingBasis === "close" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setShowingBasis("close")}
                >
                  CLOSE
                </Button>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Days Since High"
                value={stats.daysSinceHigh}
                subValue={stats.daysSinceHigh === 0 ? "At new high!" : undefined}
                icon={Calendar}
                colorClass={getDaysColor(stats.daysSinceHigh)}
              />
              <StatCard
                label="Last High Date"
                value={stats.lastHighDate || "N/A"}
                icon={Target}
              />
              <StatCard
                label="Rolling High"
                value={formatPrice(stats.rollingHigh)}
                icon={TrendingUp}
              />
              <StatCard
                label="Current Value"
                value={formatPrice(stats.currentValue)}
                subValue={formatPercent(-stats.pctFromHigh) + " from high"}
                icon={Activity}
              />
            </div>
          )}

          {/* Dual Basis Comparison */}
          {highMetrics && closeMetrics && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <GitCompare className="w-4 h-4" />
                  Basis Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">HIGH Basis</p>
                    <p className="text-lg font-bold tabular-nums">{highMetrics.daysSinceHigh}d</p>
                    <p className="text-xs text-muted-foreground">{highMetrics.pctFromHigh.toFixed(2)}% from high</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">CLOSE Basis</p>
                    <p className="text-lg font-bold tabular-nums">{closeMetrics.daysSinceHigh}d</p>
                    <p className="text-xs text-muted-foreground">{closeMetrics.pctFromHigh.toFixed(2)}% from high</p>
                  </div>
                </div>
                {closeMetrics.daysSinceHigh !== highMetrics.daysSinceHigh && (
                  <div className="mt-3 p-2 rounded bg-muted/50 text-center">
                    <span className="text-sm font-medium">
                      Δ {closeMetrics.daysSinceHigh - highMetrics.daysSinceHigh} days
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {closeMetrics.daysSinceHigh > highMetrics.daysSinceHigh
                        ? "(touched high but closed lower)"
                        : "(close basis leads)"}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Mini Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  90-Day Price Chart
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(d) => d.slice(5)} // Show MM-DD
                        interval="preserveStartEnd"
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatPrice(v)}
                        domain={["auto", "auto"]}
                        stroke="var(--muted-foreground)"
                        width={50}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                        formatter={(value: number, name: string) => [
                          formatPrice(value),
                          name === "close" ? "Close" : name === "rollingHigh" ? `${lookback}d High` : name,
                        ]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />

                      {/* Price line */}
                      <Line
                        type="monotone"
                        dataKey="close"
                        stroke="var(--primary)"
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />

                      {/* Rolling high line */}
                      <Line
                        type="stepAfter"
                        dataKey="rollingHigh"
                        stroke="oklch(0.65 0.15 25)"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                      />

                      {/* Selected date marker */}
                      {selectedBar && (
                        <ReferenceLine
                          x={date}
                          stroke="var(--primary)"
                          strokeWidth={2}
                          strokeDasharray="3 3"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-primary" />
                    <span>Close Price</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 border-t-2 border-dashed" style={{ borderColor: "oklch(0.65 0.15 25)" }} />
                    <span>{lookback}d Rolling High</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent OHLC Data */}
          {selectedBar && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  OHLC Data ({date})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-[10px] text-muted-foreground uppercase">Open</p>
                    <p className="text-sm font-mono font-semibold">{formatPrice(selectedBar.open)}</p>
                  </div>
                  <div className="p-2 rounded bg-green-500/10">
                    <p className="text-[10px] text-green-600 dark:text-green-400 uppercase">High</p>
                    <p className="text-sm font-mono font-semibold">{formatPrice(selectedBar.high)}</p>
                  </div>
                  <div className="p-2 rounded bg-red-500/10">
                    <p className="text-[10px] text-red-600 dark:text-red-400 uppercase">Low</p>
                    <p className="text-sm font-mono font-semibold">{formatPrice(selectedBar.low)}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-[10px] text-muted-foreground uppercase">Close</p>
                    <p className="text-sm font-mono font-semibold">{formatPrice(selectedBar.close)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
