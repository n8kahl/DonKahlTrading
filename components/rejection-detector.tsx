'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  XCircle,
  AlertTriangle,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  LineChart,
  Pin,
  Info,
} from 'lucide-react'
import type { HeatmapMetrics, DailyBar } from '@/lib/massive-api'
import {
  getAllRecentRejections,
  extractLatestRow,
  detectRejections,
  type RejectionSignal,
  type RejectionSeverity,
  TRADER_CONFIG,
} from '@/lib/trader-signals'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface RejectionDetectorProps {
  basisHigh: Record<string, HeatmapMetrics[]>
  basisClose: Record<string, HeatmapMetrics[]>
  dates: string[]
  rawBars?: Record<string, DailyBar[]>
  onViewChart?: (symbol: string) => void
  onPin?: (symbol: string) => void
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getSeverityConfig(severity: RejectionSeverity) {
  switch (severity) {
    case 'mild':
      return {
        label: 'Mild',
        bgClass: 'bg-amber-500/10',
        textClass: 'text-amber-600 dark:text-amber-400',
        borderClass: 'border-amber-500/20',
      }
    case 'notable':
      return {
        label: 'Notable',
        bgClass: 'bg-orange-500/10',
        textClass: 'text-orange-600 dark:text-orange-400',
        borderClass: 'border-orange-500/20',
      }
    case 'strong':
      return {
        label: 'Strong',
        bgClass: 'bg-red-500/10',
        textClass: 'text-red-600 dark:text-red-400',
        borderClass: 'border-red-500/20',
      }
  }
}

// -----------------------------------------------------------------------------
// Sub-Components
// -----------------------------------------------------------------------------

function RejectionItem({
  rejection,
  isLatest,
  onViewChart,
  onPin,
}: {
  rejection: RejectionSignal
  isLatest: boolean
  onViewChart?: (symbol: string) => void
  onPin?: (symbol: string) => void
}) {
  const severityConfig = getSeverityConfig(rejection.severity)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2 rounded-md border',
        'transition-colors duration-150',
        severityConfig.bgClass,
        severityConfig.borderClass,
        isLatest && 'ring-1 ring-amber-500/30'
      )}
    >
      <div className="flex items-center gap-3">
        {/* Symbol */}
        <span className="font-mono font-bold text-sm min-w-[50px]">
          {rejection.symbol}
        </span>

        {/* Delta */}
        <div className="flex items-center gap-1.5">
          <TrendingDown className={cn('w-3.5 h-3.5', severityConfig.textClass)} />
          <span className={cn('text-xs font-medium', severityConfig.textClass)}>
            +{rejection.delta}d
          </span>
        </div>

        {/* Severity badge */}
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] px-1.5 py-0',
            severityConfig.bgClass,
            severityConfig.textClass,
            severityConfig.borderClass
          )}
        >
          {severityConfig.label}
        </Badge>

        {/* Date indicator for non-latest */}
        {!isLatest && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {rejection.date}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {onViewChart && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => onViewChart(rejection.symbol)}
                >
                  <LineChart className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">View chart</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {onPin && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => onPin(rejection.symbol)}
                >
                  <Pin className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Pin to dashboard</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </motion.div>
  )
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export function RejectionDetector({
  basisHigh,
  basisClose,
  dates,
  rawBars,
  onViewChart,
  onPin,
}: RejectionDetectorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Get latest date rejections
  const latestRejections = useMemo(() => {
    if (dates.length === 0) return []

    const latestIndex = dates.length - 1
    const latestDate = dates[latestIndex]

    const highRow: Record<string, number> = {}
    const closeRow: Record<string, number> = {}

    for (const symbol of Object.keys(basisHigh)) {
      if (basisHigh[symbol][latestIndex]) {
        highRow[symbol] = basisHigh[symbol][latestIndex].daysSinceHigh
      }
      if (basisClose[symbol][latestIndex]) {
        closeRow[symbol] = basisClose[symbol][latestIndex].daysSinceHigh
      }
    }

    return detectRejections(highRow, closeRow, latestDate)
  }, [basisHigh, basisClose, dates])

  // Get all recent rejections (excluding today to avoid duplicates when expanded)
  const recentRejections = useMemo(() => {
    const all = getAllRecentRejections(basisHigh, basisClose, dates)
    // Filter out latest date since we show those separately
    const latestDate = dates[dates.length - 1]
    return all.filter((r) => r.date !== latestDate)
  }, [basisHigh, basisClose, dates])

  // Stats
  const totalRecent = latestRejections.length + recentRejections.length
  const hasRejections = latestRejections.length > 0
  const hasRecentHistory = recentRejections.length > 0

  if (!hasRejections && !hasRecentHistory) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <XCircle className="w-4 h-4" />
          <span className="text-sm">No rejected breakouts detected</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Rejections occur when an index touches a new intraday high but fails to close there.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Rejection Detector</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium">Failed Breakout Confirmations</p>
                <p className="text-xs text-muted-foreground mt-1">
                  These indices hit new intraday highs but couldn&apos;t hold the level into the close.
                  This often signals exhaustion or distribution.
                </p>
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  <p><span className="text-amber-500">Mild:</span> 1-2 days gap</p>
                  <p><span className="text-orange-500">Notable:</span> 3-5 days gap</p>
                  <p><span className="text-red-500">Strong:</span> 5+ days gap</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-2">
          {/* Today's count */}
          {hasRejections && (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            >
              {latestRejections.length} today
            </Badge>
          )}

          {/* Recent count + expand */}
          {hasRecentHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 text-xs gap-1"
            >
              <span className="text-muted-foreground">
                +{recentRejections.length} recent
              </span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Today's rejections */}
        <AnimatePresence mode="popLayout">
          {latestRejections.map((rejection) => (
            <RejectionItem
              key={`${rejection.symbol}-${rejection.date}`}
              rejection={rejection}
              isLatest
              onViewChart={onViewChart}
              onPin={onPin}
            />
          ))}
        </AnimatePresence>

        {/* Recent history (expandable) */}
        <AnimatePresence>
          {isExpanded && hasRecentHistory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-2 pt-2 border-t border-border/50"
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium px-1">
                Previous {TRADER_CONFIG.RECENT_ROWS} Sessions
              </p>
              {recentRejections.map((rejection) => (
                <RejectionItem
                  key={`${rejection.symbol}-${rejection.date}`}
                  rejection={rejection}
                  isLatest={false}
                  onViewChart={onViewChart}
                  onPin={onPin}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* No today rejections but has history */}
        {!hasRejections && hasRecentHistory && (
          <p className="text-xs text-muted-foreground py-2">
            No rejections today. Click to see recent history.
          </p>
        )}
      </div>
    </div>
  )
}
