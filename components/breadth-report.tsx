'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  TrendingDown,
  TrendingUp,
  Calendar,
  Users,
  AlertTriangle,
  Info,
  BarChart3,
} from 'lucide-react'
import type { BreadthEntry } from '@/lib/breadth/compute'
import type { PeakResult, WindowResult } from '@/lib/breadth/extremes'

// =============================================================================
// Types
// =============================================================================

interface BreadthReportProps {
  universe: {
    id: string
    label: string
    disclosureText: string
    etfProxy: string
  }
  params: {
    lookbackDays: number
    searchDays: number
    windowDays: number
    metric: 'new_lows' | 'new_highs'
  }
  constituentsUsed: number
  failedTickers: string[]
  series: BreadthEntry[]
  peak: PeakResult | null
  window: WindowResult | null
  topPeaks?: PeakResult[]
  asOf: string
}

// =============================================================================
// Subcomponents
// =============================================================================

function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  variant = 'default',
}: {
  label: string
  value: string
  subtext?: string
  icon: React.ElementType
  variant?: 'default' | 'warning' | 'success'
}) {
  const variantStyles = {
    default: 'bg-muted/50 border-border',
    warning: 'bg-amber-500/10 border-amber-500/30',
    success: 'bg-emerald-500/10 border-emerald-500/30',
  }

  const iconStyles = {
    default: 'text-muted-foreground',
    warning: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border',
        variantStyles[variant]
      )}
    >
      <Icon className={cn('w-4 h-4 mt-0.5', iconStyles[variant])} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="text-lg font-bold font-mono">{value}</p>
        {subtext && (
          <p className="text-xs text-muted-foreground truncate">{subtext}</p>
        )}
      </div>
    </div>
  )
}

function MiniSparkline({
  series,
  metric,
  peakDate,
}: {
  series: BreadthEntry[]
  metric: 'new_lows' | 'new_highs'
  peakDate?: string
}) {
  // Take last 50 entries for sparkline
  const data = series.slice(-50)
  if (data.length === 0) return null

  const values = data.map(e =>
    metric === 'new_lows' ? e.pctNewLows : e.pctNewHighs
  )
  const max = Math.max(...values, 1)
  const height = 40
  const width = 200

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - (v / max) * height
    return `${x},${y}`
  }).join(' ')

  const peakIndex = peakDate
    ? data.findIndex(e => e.date === peakDate)
    : -1

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-10"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={metric === 'new_lows' ? '#ef4444' : '#22c55e'}
        strokeWidth="1.5"
        points={points}
      />
      {peakIndex >= 0 && (
        <circle
          cx={(peakIndex / (values.length - 1)) * width}
          cy={height - (values[peakIndex] / max) * height}
          r="4"
          fill={metric === 'new_lows' ? '#ef4444' : '#22c55e'}
        />
      )}
    </svg>
  )
}

function TopContributors({
  symbols,
  limit = 10,
}: {
  symbols: string[]
  limit?: number
}) {
  if (symbols.length === 0) return null

  const displayed = symbols.slice(0, limit)
  const remaining = symbols.length - limit

  return (
    <div className="flex flex-wrap gap-1">
      {displayed.map(symbol => (
        <Badge
          key={symbol}
          variant="outline"
          className="text-[10px] px-1.5 py-0 font-mono"
        >
          {symbol}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 text-muted-foreground"
        >
          +{remaining} more
        </Badge>
      )}
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function BreadthReport({
  universe,
  params,
  constituentsUsed,
  failedTickers,
  series,
  peak,
  window,
  topPeaks,
  asOf,
}: BreadthReportProps) {
  const isNewLows = params.metric === 'new_lows'
  const metricLabel = isNewLows ? 'New Lows' : 'New Highs'
  const Icon = isNewLows ? TrendingDown : TrendingUp

  // Get latest reading
  const latestEntry = series[series.length - 1]
  const latestValue = latestEntry
    ? isNewLows
      ? latestEntry.pctNewLows
      : latestEntry.pctNewHighs
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Breadth Analysis: {metricLabel}</h3>
          <Badge
            variant="outline"
            className="text-[10px] font-mono"
          >
            {universe.label}
          </Badge>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              <p className="text-xs">{universe.disclosureText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4">
        {/* Key Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {peak && (
            <StatCard
              label={`Peak ${metricLabel}`}
              value={`${peak.value.toFixed(1)}%`}
              subtext={peak.date}
              icon={Icon}
              variant="warning"
            />
          )}
          <StatCard
            label={`Current ${metricLabel}`}
            value={`${latestValue.toFixed(1)}%`}
            subtext={latestEntry?.date}
            icon={Icon}
            variant={latestValue > 15 ? 'warning' : 'default'}
          />
          <StatCard
            label="Constituents"
            value={`${constituentsUsed}`}
            subtext={failedTickers.length > 0 ? `${failedTickers.length} failed` : undefined}
            icon={Users}
            variant="default"
          />
          <StatCard
            label="Lookback"
            value={`${params.lookbackDays}d`}
            subtext={`${params.searchDays}d search`}
            icon={Calendar}
            variant="default"
          />
        </div>

        {/* Sparkline */}
        {series.length > 0 && (
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground mb-2">
              {metricLabel} % (Last 50 days)
            </p>
            <MiniSparkline
              series={series}
              metric={params.metric}
              peakDate={peak?.date}
            />
          </div>
        )}

        {/* Peak Window Info */}
        {window && (
          <div className="p-3 border border-amber-500/30 bg-amber-500/5 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  Worst {params.windowDays}-Day Stretch
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-mono">{window.windowStart}</span>
                  {' → '}
                  <span className="font-mono">{window.windowEnd}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Peak: <span className="font-mono font-bold">{window.peakValue.toFixed(1)}%</span>
                  {' | '}
                  Avg: <span className="font-mono">{window.avgValue.toFixed(1)}%</span>
                  {' | '}
                  {window.tradingDays} trading days
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top Contributors on Peak Day */}
        {peak && peak.symbols.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {isNewLows ? 'Stocks at New Lows' : 'Stocks at New Highs'} on Peak Day ({peak.count} total)
            </p>
            <TopContributors symbols={peak.symbols} limit={15} />
          </div>
        )}

        {/* Failed Tickers Warning */}
        {failedTickers.length > 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span>
              Failed to fetch: {failedTickers.slice(0, 5).join(', ')}
              {failedTickers.length > 5 && ` +${failedTickers.length - 5} more`}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
        <span>Using {universe.etfProxy} ETF constituents as proxy</span>
        <span className="font-mono">{new Date(asOf).toLocaleTimeString()}</span>
      </div>
    </motion.div>
  )
}

export default BreadthReport
