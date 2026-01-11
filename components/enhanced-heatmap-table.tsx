"use client"

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import type { HeatmapMetrics, DailyBar } from "@/lib/massive-api"
import { CellDrilldown } from "./cell-drilldown"
import { getHeatStyle, detectSignal, getSignalBorderStyle, type HeatMetric } from "@/lib/heat/colors"
import {
  Columns2,
  ArrowUp,
  ArrowDown,
  GitCompare,
  AlertTriangle,
  Info,
  HelpCircle,
} from "lucide-react"
import { InlineHeatLegend } from "./heat-legend"

// =============================================================================
// Types
// =============================================================================

type ViewMode = "single" | "dual" | "delta"

interface EnhancedHeatmapTableProps {
  dates: string[]
  basisHigh?: Record<string, HeatmapMetrics[]>
  basisClose?: Record<string, HeatmapMetrics[]>
  data: Record<string, HeatmapMetrics[]>
  rawBars: Record<string, DailyBar[]>
  lookback: number
  metric: "pctFromHigh" | "daysSinceHigh" | "pctFromLow" | "daysSinceLow"
  sortBy?: string
  currentBasis?: "close" | "intraday"
  sanity?: {
    staleSymbols: string[]
    constantDays: string[]
  }
}

// =============================================================================
// Storage Helpers
// =============================================================================

const VIEW_MODE_KEY = "heatmap-view-mode"

function loadViewMode(): ViewMode {
  if (typeof window === "undefined") return "single"
  const saved = localStorage.getItem(VIEW_MODE_KEY)
  if (saved && ["single", "dual", "delta"].includes(saved)) {
    return saved as ViewMode
  }
  return "single"
}

function saveViewMode(mode: ViewMode) {
  if (typeof window !== "undefined") {
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

function ViewModeButton({
  mode,
  currentMode,
  onClick,
  icon: Icon,
  label,
}: {
  mode: ViewMode
  currentMode: ViewMode
  onClick: () => void
  icon: React.ElementType
  label: string
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={currentMode === mode ? "secondary" : "ghost"}
            size="sm"
            onClick={onClick}
            className={cn(
              "h-7 px-2",
              currentMode === mode && "bg-primary/10 text-primary"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function SanityBadge({ type, symbols }: { type: "stale" | "constant"; symbols: string[] }) {
  if (symbols.length === 0) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            <span>
              {symbols.length} {type === "stale" ? "Stale" : "Suspicious"}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium mb-1">
            {type === "stale" ? "Potentially Stale Data" : "Suspicious Constant Values"}
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            {type === "stale"
              ? "These symbols have data more than 3 days old."
              : "These symbols show constant daysSinceHigh values, which may indicate data issues."}
          </p>
          <p className="text-xs font-mono">{symbols.join(", ")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function InfoTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Single:</span> Shows one basis at a time.
            </p>
            <p>
              <span className="font-medium text-foreground">Dual:</span> Side-by-side HIGH vs CLOSE comparison.
            </p>
            <p>
              <span className="font-medium text-foreground">Delta:</span> Shows (Close - High) days to detect
              breakout rejections. Positive = touched high but closed lower.
            </p>
            <div className="pt-2 border-t border-border space-y-1">
              <p><span className="inline-block w-3 h-3 rounded-sm border-2 border-green-500 mr-1" /> Confirmed breakout</p>
              <p><span className="inline-block w-3 h-3 rounded-sm border-2 border-amber-500 mr-1" /> Rejected breakout</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// =============================================================================
// Memoized Heat Cell
// =============================================================================

interface HeatCellProps {
  metrics?: HeatmapMetrics
  highMetrics?: HeatmapMetrics
  closeMetrics?: HeatmapMetrics
  metric: "pctFromHigh" | "daysSinceHigh" | "pctFromLow" | "daysSinceLow"
  lookback: number
  isDelta?: boolean
  deltaValue?: number
  isRecent?: boolean  // Last 10 rows for signal borders
  onClick?: () => void
}

const HeatCell = memo(function HeatCell({
  metrics,
  highMetrics,
  closeMetrics,
  metric,
  lookback,
  isDelta = false,
  deltaValue = 0,
  isRecent = false,
  onClick,
}: HeatCellProps) {
  if (!metrics && !isDelta) {
    return (
      <td className="border-b border-border px-3 py-2 text-center text-muted-foreground/50">
        —
      </td>
    )
  }

  // Delta mode styling
  if (isDelta) {
    const intensity = Math.min(Math.abs(deltaValue) / 10, 1)
    const isRejection = deltaValue > 0
    const isConfirmed = deltaValue === 0

    let bgColor = "transparent"
    let textColor = "var(--muted-foreground)"

    if (isConfirmed) {
      bgColor = "oklch(0.55 0.15 160)"
      textColor = "#ffffff"
    } else if (isRejection && intensity > 0.3) {
      bgColor = `oklch(${0.45 + intensity * 0.1} ${intensity * 0.15} 35)`
      textColor = intensity > 0.5 ? "#ffffff" : "var(--foreground)"
    }

    return (
      <td
        onClick={onClick}
        style={{ backgroundColor: bgColor, color: textColor }}
        className={cn(
          "border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums",
          "transition-all duration-200 ease-out",
          isConfirmed && "font-semibold",
          onClick && "cursor-pointer hover:brightness-110"
        )}
      >
        {deltaValue > 0 ? "+" : ""}{deltaValue}
      </td>
    )
  }

  // Regular cell
  const value = metrics![metric]
  const style = getHeatStyle({ metric: metric as HeatMetric, value, lookback })

  // Signal detection (only for recent rows and days metrics)
  let signalStyle: ReturnType<typeof getSignalBorderStyle> = null
  if (isRecent && metric.includes("days") && highMetrics && closeMetrics) {
    const signal = detectSignal(highMetrics.daysSinceHigh, closeMetrics.daysSinceHigh)
    signalStyle = getSignalBorderStyle(signal.type)
  }

  const getDisplayValue = () => {
    switch (metric) {
      case "pctFromHigh":
        return `${metrics!.pctFromHigh.toFixed(1)}%`
      case "daysSinceHigh":
        return metrics!.daysSinceHigh.toString()
      case "pctFromLow":
        return `${metrics!.pctFromLow.toFixed(1)}%`
      case "daysSinceLow":
        return metrics!.daysSinceLow.toString()
    }
  }

  return (
    <td
      onClick={onClick}
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        borderColor: signalStyle?.borderColor,
        borderWidth: signalStyle?.borderWidth,
        borderStyle: signalStyle?.borderStyle as any,
        boxShadow: signalStyle?.boxShadow,
      }}
      className={cn(
        "border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums",
        "transition-all duration-200 ease-out",
        style.intensity > 0.5 && "font-semibold",
        onClick && "cursor-pointer hover:brightness-110",
        signalStyle?.cornerDot && "relative"
      )}
    >
      {getDisplayValue()}
      {/* Corner dot for confirmed breakouts */}
      {signalStyle?.cornerDot && (
        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-black" />
      )}
    </td>
  )
})

// =============================================================================
// Main Component
// =============================================================================

export function EnhancedHeatmapTable({
  dates,
  basisHigh,
  basisClose,
  data,
  rawBars,
  lookback,
  metric,
  sortBy,
  currentBasis = "close",
  sanity,
}: EnhancedHeatmapTableProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("single")
  const [mounted, setMounted] = useState(false)
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const [drilldownData, setDrilldownData] = useState<{
    symbol: string
    date: string
    dateIndex: number
    metrics: HeatmapMetrics
    highMetrics?: HeatmapMetrics
    closeMetrics?: HeatmapMetrics
    bars: DailyBar[]
  } | null>(null)

  // Refs for scroll sync in dual mode
  const highTableRef = useRef<HTMLDivElement>(null)
  const closeTableRef = useRef<HTMLDivElement>(null)

  // Load persisted view mode
  useEffect(() => {
    setViewMode(loadViewMode())
    setMounted(true)
  }, [])

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    saveViewMode(mode)
  }, [])

  // Scroll sync handler for dual mode
  const handleScroll = useCallback((source: "high" | "close") => {
    const sourceRef = source === "high" ? highTableRef.current : closeTableRef.current
    const targetRef = source === "high" ? closeTableRef.current : highTableRef.current

    if (sourceRef && targetRef) {
      targetRef.scrollTop = sourceRef.scrollTop
      targetRef.scrollLeft = sourceRef.scrollLeft
    }
  }, [])

  // Determine which data to use
  const hasDualData = Boolean(basisHigh && basisClose)
  const highData = basisHigh || data
  const closeData = basisClose || data

  // Get sorted symbols - memoized
  const symbols = useMemo(() => {
    let syms = Object.keys(data)
    const isHighMetric = metric.includes("High")

    if (sortBy && sortBy !== "none" && syms.length > 0) {
      const latestIndex = dates.length - 1
      syms = [...syms].sort((a, b) => {
        const aMetric = data[a]?.[latestIndex]
        const bMetric = data[b]?.[latestIndex]

        if (!aMetric || !bMetric) return 0

        if (sortBy === "closestToExtreme") {
          const aVal = isHighMetric ? aMetric.pctFromHigh : aMetric.pctFromLow
          const bVal = isHighMetric ? bMetric.pctFromHigh : bMetric.pctFromLow
          return aVal - bVal
        } else if (sortBy === "mostDays") {
          const aVal = isHighMetric ? aMetric.daysSinceHigh : aMetric.daysSinceLow
          const bVal = isHighMetric ? bMetric.daysSinceHigh : bMetric.daysSinceLow
          return bVal - aVal
        } else if (sortBy === "freshBreakouts") {
          const aVal = isHighMetric ? aMetric.daysSinceHigh : aMetric.daysSinceLow
          const bVal = isHighMetric ? bMetric.daysSinceHigh : bMetric.daysSinceLow
          return aVal - bVal
        }
        return 0
      })
    }
    return syms
  }, [data, dates.length, metric, sortBy])

  const handleCellClick = useCallback((
    symbol: string,
    dateIndex: number,
    tableData: Record<string, HeatmapMetrics[]>
  ) => {
    const metrics = tableData[symbol]?.[dateIndex]
    if (!metrics) return

    setDrilldownData({
      symbol,
      date: dates[dateIndex],
      dateIndex,
      metrics,
      highMetrics: highData[symbol]?.[dateIndex],
      closeMetrics: closeData[symbol]?.[dateIndex],
      bars: rawBars[symbol] || [],
    })
    setDrilldownOpen(true)
  }, [dates, highData, closeData, rawBars])

  // Don't render until mounted (avoid hydration issues)
  if (!mounted) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Render a single table
  const renderTable = (
    tableData: Record<string, HeatmapMetrics[]>,
    label: string,
    labelColor: string,
    tableRef?: React.RefObject<HTMLDivElement | null>,
    onScroll?: () => void
  ) => (
    <div
      ref={tableRef}
      onScroll={onScroll}
      className="relative w-full overflow-auto"
    >
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 bg-muted border-b border-r border-border px-3 py-2 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              {label ? (
                <span className={labelColor}>{label}</span>
              ) : (
                "Date"
              )}
            </th>
            {symbols.map((symbol) => (
              <th
                key={symbol}
                className={cn(
                  "bg-muted border-b border-border px-3 py-2 text-center font-bold text-xs uppercase tracking-wider",
                  sanity?.staleSymbols.includes(symbol) && "text-amber-500",
                  sanity?.constantDays.includes(symbol) && "text-red-500"
                )}
              >
                {symbol}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...dates].reverse().map((date, reversedIndex) => {
            const dateIndex = dates.length - 1 - reversedIndex // Original index for data access
            const isRecent = dateIndex >= dates.length - 10
            return (
              <tr key={date} className="hover:bg-muted/50 transition-colors">
                <td className="sticky left-0 z-10 bg-card border-b border-r border-border px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {date}
                </td>
                {symbols.map((symbol) => {
                  const metrics = tableData[symbol]?.[dateIndex]
                  return (
                    <HeatCell
                      key={symbol}
                      metrics={metrics}
                      highMetrics={highData[symbol]?.[dateIndex]}
                      closeMetrics={closeData[symbol]?.[dateIndex]}
                      metric={metric}
                      lookback={lookback}
                      isRecent={isRecent}
                      onClick={() => handleCellClick(symbol, dateIndex, tableData)}
                    />
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // Render delta table
  const renderDeltaTable = () => (
    <div className="relative w-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 bg-muted border-b border-r border-border px-3 py-2 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              <span className="text-purple-500">Delta (C-H)</span>
            </th>
            {symbols.map((symbol) => (
              <th
                key={symbol}
                className="bg-muted border-b border-border px-3 py-2 text-center font-bold text-xs uppercase tracking-wider"
              >
                {symbol}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...dates].reverse().map((date, reversedIndex) => {
            const dateIndex = dates.length - 1 - reversedIndex // Original index for data access
            return (
              <tr key={date} className="hover:bg-muted/50 transition-colors">
                <td className="sticky left-0 z-10 bg-card border-b border-r border-border px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {date}
                </td>
                {symbols.map((symbol) => {
                  const highMetrics = highData[symbol]?.[dateIndex]
                  const closeMetrics = closeData[symbol]?.[dateIndex]

                  if (!highMetrics || !closeMetrics) {
                    return (
                      <td key={symbol} className="border-b border-border px-3 py-2 text-center text-muted-foreground/50">
                        —
                      </td>
                    )
                  }

                  const deltaValue = closeMetrics.daysSinceHigh - highMetrics.daysSinceHigh

                  return (
                    <HeatCell
                      key={symbol}
                      metric={metric}
                      lookback={lookback}
                      isDelta
                      deltaValue={deltaValue}
                      onClick={() => handleCellClick(symbol, dateIndex, closeData)}
                    />
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      {/* Header with Legend and View Mode Controls */}
      <div className="border-b border-border bg-muted/30">
        {/* Top row: Legend - always visible */}
        <div className="px-4 py-2 border-b border-border/50">
          <InlineHeatLegend
            metricType={metric.includes('High') ? 'high' : 'low'}
            isDays={metric.includes('days')}
          />
        </div>

        {/* Bottom row: Controls */}
        <div className="flex items-center justify-between gap-4 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Heatmap</span>
            <InfoTooltip />

            {/* Sanity Badges */}
            {sanity && (
              <div className="flex items-center gap-2">
                <SanityBadge type="stale" symbols={sanity.staleSymbols} />
                <SanityBadge type="constant" symbols={sanity.constantDays} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Buttons - only show if we have dual data */}
            {hasDualData && (
              <div className="flex items-center gap-0.5 p-0.5 bg-muted rounded">
                <ViewModeButton
                  mode="single"
                  currentMode={viewMode}
                  onClick={() => handleViewModeChange("single")}
                  icon={currentBasis === "intraday" ? ArrowUp : ArrowDown}
                  label="Single View (current basis)"
                />
                <ViewModeButton
                  mode="dual"
                  currentMode={viewMode}
                  onClick={() => handleViewModeChange("dual")}
                  icon={Columns2}
                  label="Dual View (High vs Close)"
                />
                <ViewModeButton
                  mode="delta"
                  currentMode={viewMode}
                  onClick={() => handleViewModeChange("delta")}
                  icon={GitCompare}
                  label="Delta View (breakout rejections)"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <TooltipProvider>
        <LayoutGroup>
          <AnimatePresence mode="wait">
            {/* Single Mode */}
            {viewMode === "single" && (
              <motion.div
                key="single"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {renderTable(data, "", "")}
              </motion.div>
            )}

            {/* Dual Mode - Side by side */}
            {viewMode === "dual" && hasDualData && (
              <motion.div
                key="dual"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3"
              >
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="px-3 py-1.5 bg-amber-500/10 border-b border-border">
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-500">
                      HIGH Basis (Intraday)
                    </span>
                  </div>
                  {renderTable(
                    highData,
                    "",
                    "",
                    highTableRef,
                    () => handleScroll("high")
                  )}
                </div>
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="px-3 py-1.5 bg-blue-500/10 border-b border-border">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-500">
                      CLOSE Basis (EOD)
                    </span>
                  </div>
                  {renderTable(
                    closeData,
                    "",
                    "",
                    closeTableRef,
                    () => handleScroll("close")
                  )}
                </div>
              </motion.div>
            )}

            {/* Delta Mode */}
            {viewMode === "delta" && hasDualData && (
              <motion.div
                key="delta"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {renderDeltaTable()}
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </TooltipProvider>

      {/* Cell Drilldown */}
      {drilldownData && (
        <CellDrilldown
          open={drilldownOpen}
          onOpenChange={setDrilldownOpen}
          symbol={drilldownData.symbol}
          date={drilldownData.date}
          metrics={drilldownData.metrics}
          highMetrics={drilldownData.highMetrics}
          closeMetrics={drilldownData.closeMetrics}
          bars={drilldownData.bars}
          lookback={lookback}
        />
      )}
    </>
  )
}
