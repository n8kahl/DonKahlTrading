'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowUp,
  ArrowDown,
  Pin,
  ExternalLink,
  Activity,
} from 'lucide-react'
import type { DailyBar, HeatmapMetrics } from '@/lib/massive-api'
import { getHeatStyle, type HeatMetric } from '@/lib/heat/colors'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface SymbolDrillSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  symbol: string
  bars: DailyBar[]
  metricsHigh?: HeatmapMetrics
  metricsClose?: HeatmapMetrics
  lookback: number
  onPin?: (symbol: string) => void
}

// -----------------------------------------------------------------------------
// Mini Chart Component (SVG-based sparkline with rolling high)
// -----------------------------------------------------------------------------

function MiniChart({
  bars,
  lookback,
  width = 400,
  height = 120,
}: {
  bars: DailyBar[]
  lookback: number
  width?: number
  height?: number
}) {
  const chartData = useMemo(() => {
    if (bars.length < 2) return null

    // Use last 90 days or available
    const displayBars = bars.slice(-90)
    const closes = displayBars.map((b) => b.close)
    const highs = displayBars.map((b) => b.high)

    // Compute rolling high for each point
    const rollingHighs: number[] = []
    for (let i = 0; i < displayBars.length; i++) {
      const windowStart = Math.max(0, i - lookback + 1)
      const window = highs.slice(windowStart, i + 1)
      rollingHighs.push(Math.max(...window))
    }

    // Find min/max for scaling
    const allValues = [...closes, ...rollingHighs]
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const range = max - min || 1

    // Padding
    const padding = { top: 10, bottom: 20, left: 10, right: 10 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // Scale functions
    const scaleX = (i: number) => padding.left + (i / (displayBars.length - 1)) * chartWidth
    const scaleY = (v: number) => padding.top + chartHeight - ((v - min) / range) * chartHeight

    // Generate paths
    const closePath = closes
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(c)}`)
      .join(' ')

    const rollingHighPath = rollingHighs
      .map((h, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(h)}`)
      .join(' ')

    // Find where close touched/exceeded rolling high (new high events)
    const newHighPoints: { x: number; y: number }[] = []
    for (let i = 1; i < displayBars.length; i++) {
      if (highs[i] >= rollingHighs[i - 1]) {
        newHighPoints.push({ x: scaleX(i), y: scaleY(highs[i]) })
      }
    }

    return {
      closePath,
      rollingHighPath,
      newHighPoints,
      currentClose: closes[closes.length - 1],
      currentRollingHigh: rollingHighs[rollingHighs.length - 1],
      min,
      max,
      lastDate: displayBars[displayBars.length - 1].date,
      firstDate: displayBars[0].date,
    }
  }, [bars, lookback, width, height])

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-[120px] bg-muted/30 rounded">
        <span className="text-xs text-muted-foreground">Insufficient data</span>
      </div>
    )
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Rolling high line (dashed) */}
      <path
        d={chartData.rollingHighPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 2"
        className="text-emerald-500/50"
      />

      {/* Close price line */}
      <path
        d={chartData.closePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-foreground"
      />

      {/* New high markers */}
      {chartData.newHighPoints.map((point, i) => (
        <circle
          key={i}
          cx={point.x}
          cy={point.y}
          r={3}
          className="fill-emerald-500"
        />
      ))}

      {/* Current price marker */}
      <circle
        cx={width - 15}
        cy={height / 2 + 5}
        r={4}
        className="fill-foreground"
      />

      {/* Date labels */}
      <text
        x={10}
        y={height - 5}
        className="text-[9px] fill-muted-foreground"
      >
        {chartData.firstDate}
      </text>
      <text
        x={width - 10}
        y={height - 5}
        textAnchor="end"
        className="text-[9px] fill-muted-foreground"
      >
        {chartData.lastDate}
      </text>
    </svg>
  )
}

// -----------------------------------------------------------------------------
// Metric Row Component
// -----------------------------------------------------------------------------

function MetricRow({
  label,
  value,
  subValue,
  icon: Icon,
  colorClass,
}: {
  label: string
  value: string | number
  subValue?: string
  icon: React.ElementType
  colorClass?: string
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <Icon className={cn('w-4 h-4', colorClass || 'text-muted-foreground')} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-right">
        <span className={cn('font-mono font-semibold', colorClass)}>{value}</span>
        {subValue && (
          <span className="text-xs text-muted-foreground ml-1">({subValue})</span>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export function SymbolDrillSheet({
  open,
  onOpenChange,
  symbol,
  bars,
  metricsHigh,
  metricsClose,
  lookback,
  onPin,
}: SymbolDrillSheetProps) {
  // Get color styles for metrics
  const highStyle = metricsHigh
    ? getHeatStyle({ metric: 'daysSinceHigh' as HeatMetric, value: metricsHigh.daysSinceHigh, lookback })
    : null

  const closeStyle = metricsClose
    ? getHeatStyle({ metric: 'daysSinceHigh' as HeatMetric, value: metricsClose.daysSinceHigh, lookback })
    : null

  // Get latest bar info
  const latestBar = bars[bars.length - 1]
  const prevBar = bars[bars.length - 2]

  const dailyChange = latestBar && prevBar
    ? ((latestBar.close - prevBar.close) / prevBar.close) * 100
    : 0

  // Determine if at new high (either basis)
  const isAtHighIntraday = metricsHigh?.daysSinceHigh === 0
  const isAtHighClose = metricsClose?.daysSinceHigh === 0
  const isRejection = isAtHighIntraday && !isAtHighClose

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <span className="text-2xl font-bold">{symbol}</span>
                {isAtHighClose && (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    At Highs
                  </Badge>
                )}
                {isRejection && (
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                    Rejected
                  </Badge>
                )}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <Calendar className="w-3 h-3" />
                <span>{latestBar?.date || 'No data'}</span>
                {dailyChange !== 0 && (
                  <span
                    className={cn(
                      'flex items-center text-xs font-mono',
                      dailyChange > 0 ? 'text-emerald-500' : 'text-red-500'
                    )}
                  >
                    {dailyChange > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {dailyChange.toFixed(2)}%
                  </span>
                )}
              </SheetDescription>
            </div>
            {onPin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPin(symbol)}
                className="gap-1"
              >
                <Pin className="w-3.5 h-3.5" />
                Pin
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Mini Chart */}
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4" />
                90-Day Chart
              </h4>
              <div className="flex items-center gap-3 text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-foreground rounded" />
                  <span className="text-muted-foreground">Close</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-emerald-500/50 rounded border-dashed border-b" />
                  <span className="text-muted-foreground">{lookback}d High</span>
                </div>
              </div>
            </div>
            <MiniChart bars={bars} lookback={lookback} />
          </div>

          {/* Metrics Grid */}
          <div className="space-y-1">
            <h4 className="text-sm font-medium mb-3">Current Position</h4>

            {/* HIGH basis metrics */}
            {metricsHigh && (
              <div className="bg-amber-500/5 rounded-lg p-3 mb-2">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-2">
                  HIGH Basis (Intraday)
                </p>
                <MetricRow
                  label="Days Since High"
                  value={metricsHigh.daysSinceHigh}
                  icon={TrendingUp}
                  colorClass={
                    metricsHigh.daysSinceHigh === 0
                      ? 'text-emerald-500'
                      : metricsHigh.daysSinceHigh <= 3
                      ? 'text-emerald-400'
                      : metricsHigh.daysSinceHigh >= 15
                      ? 'text-red-500'
                      : undefined
                  }
                />
                <MetricRow
                  label="% From High"
                  value={`${metricsHigh.pctFromHigh.toFixed(2)}%`}
                  icon={ArrowDown}
                />
                <MetricRow
                  label="Rolling High"
                  value={metricsHigh.rollingHigh.toFixed(2)}
                  icon={TrendingUp}
                  colorClass="text-emerald-500"
                />
              </div>
            )}

            {/* CLOSE basis metrics */}
            {metricsClose && (
              <div className="bg-blue-500/5 rounded-lg p-3">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-2">
                  CLOSE Basis (EOD)
                </p>
                <MetricRow
                  label="Days Since High"
                  value={metricsClose.daysSinceHigh}
                  icon={TrendingUp}
                  colorClass={
                    metricsClose.daysSinceHigh === 0
                      ? 'text-emerald-500'
                      : metricsClose.daysSinceHigh <= 3
                      ? 'text-emerald-400'
                      : metricsClose.daysSinceHigh >= 15
                      ? 'text-red-500'
                      : undefined
                  }
                />
                <MetricRow
                  label="% From High"
                  value={`${metricsClose.pctFromHigh.toFixed(2)}%`}
                  icon={ArrowDown}
                />
                <MetricRow
                  label="Rolling High"
                  value={metricsClose.rollingHigh.toFixed(2)}
                  icon={TrendingUp}
                  colorClass="text-emerald-500"
                />
              </div>
            )}

            {/* Delta (if rejection) */}
            {isRejection && metricsHigh && metricsClose && (
              <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20 mt-3">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
                  Rejection Analysis
                </p>
                <p className="text-sm">
                  Tagged new high intraday but closed{' '}
                  <span className="font-bold text-amber-500">
                    {metricsClose.daysSinceHigh} days
                  </span>{' '}
                  from the high. This suggests the breakout wasn&apos;t confirmed by end-of-day buyers.
                </p>
              </div>
            )}
          </div>

          {/* Price Info */}
          {latestBar && (
            <div className="space-y-1">
              <h4 className="text-sm font-medium mb-3">Latest Session</h4>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">Open</p>
                  <p className="font-mono text-sm">{latestBar.open.toFixed(2)}</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">High</p>
                  <p className="font-mono text-sm text-emerald-500">{latestBar.high.toFixed(2)}</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">Low</p>
                  <p className="font-mono text-sm text-red-500">{latestBar.low.toFixed(2)}</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">Close</p>
                  <p className="font-mono text-sm">{latestBar.close.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          {/* External link placeholder */}
          <div className="pt-4 border-t border-border">
            <Button variant="outline" className="w-full gap-2" asChild>
              <a
                href={`https://www.tradingview.com/chart/?symbol=${symbol}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4" />
                Open in TradingView
              </a>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
