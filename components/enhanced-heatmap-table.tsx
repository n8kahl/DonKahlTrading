"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import type { HeatmapMetrics } from "@/lib/massive-api"
import { DrilldownSheet } from "./drilldown-sheet"
import { getHeatStyle, type HeatMetric } from "@/lib/heat/colors"
import {
  Columns2,
  ArrowUp,
  ArrowDown,
  GitCompare,
  AlertTriangle,
  Info,
} from "lucide-react"

// =============================================================================
// Types
// =============================================================================

type ViewMode = "single" | "dual" | "delta"

interface EnhancedHeatmapTableProps {
  dates: string[]
  // Both basis data (for dual view)
  basisHigh?: Record<string, HeatmapMetrics[]>
  basisClose?: Record<string, HeatmapMetrics[]>
  // Legacy single-basis data (backward compat)
  data: Record<string, HeatmapMetrics[]>
  rawBars: Record<string, any[]>
  lookback: number
  metric: "pctFromHigh" | "daysSinceHigh" | "pctFromLow" | "daysSinceLow"
  sortBy?: string
  // Currently selected basis from controls (for single mode)
  currentBasis?: "close" | "intraday"
  // Sanity check data
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
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Heat cell with animation
function HeatCell({
  metrics,
  metric,
  lookback,
  isDelta = false,
  deltaValue = 0,
}: {
  metrics?: HeatmapMetrics
  metric: "pctFromHigh" | "daysSinceHigh" | "pctFromLow" | "daysSinceLow"
  lookback: number
  isDelta?: boolean
  deltaValue?: number
}) {
  if (!metrics && !isDelta) {
    return (
      <td className="border-b border-border px-3 py-2 text-center text-muted-foreground/50">
        —
      </td>
    )
  }

  // Delta mode styling
  if (isDelta) {
    // Delta = closeDays - highDays
    // Positive = close took longer to reach high (rejection signal)
    // Zero = confirmed breakout
    // Negative = anomaly (shouldn't happen often)
    const intensity = Math.min(Math.abs(deltaValue) / 10, 1)
    const isRejection = deltaValue > 0
    const isConfirmed = deltaValue === 0

    let bgColor = "transparent"
    let textColor = "var(--muted-foreground)"

    if (isConfirmed) {
      bgColor = "oklch(0.55 0.15 160)" // Bright teal for confirmed
      textColor = "#ffffff"
    } else if (isRejection && intensity > 0.3) {
      bgColor = `oklch(${0.45 + intensity * 0.1} ${intensity * 0.15} 35)` // Amber/orange
      textColor = intensity > 0.5 ? "#ffffff" : "var(--foreground)"
    }

    return (
      <motion.td
        layout
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 1, backgroundColor: bgColor, color: textColor }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={cn(
          "border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums",
          isConfirmed && "font-semibold"
        )}
      >
        {deltaValue > 0 ? "+" : ""}{deltaValue}
      </motion.td>
    )
  }

  // Regular cell
  const value = metrics![metric]
  const style = getHeatStyle({ metric: metric as HeatMetric, value, lookback })

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
    <motion.td
      layout
      initial={{ opacity: 0.5 }}
      animate={{
        opacity: 1,
        backgroundColor: style.bg,
        color: style.fg,
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "border-b border-border/50 px-3 py-2 text-center font-mono text-xs tabular-nums cursor-pointer",
        "hover:brightness-110",
        style.intensity > 0.5 && "font-semibold"
      )}
    >
      {getDisplayValue()}
    </motion.td>
  )
}

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
  const [drilldownSymbol, setDrilldownSymbol] = useState<string | null>(null)
  const [drilldownDateIndex, setDrilldownDateIndex] = useState<number | null>(null)

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

  // Get sorted symbols
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

  const handleCellClick = (symbol: string, dateIndex: number) => {
    setDrilldownSymbol(symbol)
    setDrilldownDateIndex(dateIndex)
  }

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
    tableRef?: React.RefObject<HTMLDivElement>,
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
          {dates.map((date, dateIndex) => (
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
                    metric={metric}
                    lookback={lookback}
                  />
                )
              })}
            </tr>
          ))}
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
          {dates.map((date, dateIndex) => (
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

                // Delta = Close days - High days
                const deltaValue = closeMetrics.daysSinceHigh - highMetrics.daysSinceHigh

                return (
                  <HeatCell
                    key={symbol}
                    metric={metric}
                    lookback={lookback}
                    isDelta
                    deltaValue={deltaValue}
                  />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      {/* Header with View Mode Controls */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
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

      {/* Drilldown Sheet */}
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
