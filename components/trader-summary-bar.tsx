'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
} from 'lucide-react'
import type { HeatmapMetrics } from '@/lib/massive-api'
import {
  computeSignalSummary,
  extractLatestRow,
  detectDivergences,
  type SignalSummary,
  type RegimeLabel,
  TRADER_CONFIG,
} from '@/lib/trader-signals'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface TraderSummaryBarProps {
  basisHigh: Record<string, HeatmapMetrics[]>
  basisClose: Record<string, HeatmapMetrics[]>
  dates: string[]
  lookback: number
  marketOpen?: boolean
  lastUpdated?: string
}

// -----------------------------------------------------------------------------
// Sub-Components
// -----------------------------------------------------------------------------

function RegimeBadge({ label, confidence }: { label: RegimeLabel; confidence: string }) {
  const config = {
    'Risk-On': {
      icon: TrendingUp,
      bgClass: 'bg-emerald-500/15 border-emerald-500/30',
      textClass: 'text-emerald-600 dark:text-emerald-400',
    },
    'Risk-Off': {
      icon: TrendingDown,
      bgClass: 'bg-red-500/15 border-red-500/30',
      textClass: 'text-red-600 dark:text-red-400',
    },
    'Narrow / Mixed': {
      icon: Minus,
      bgClass: 'bg-amber-500/15 border-amber-500/30',
      textClass: 'text-amber-600 dark:text-amber-400',
    },
  }

  const { icon: Icon, bgClass, textClass } = config[label]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border',
              'text-xs font-semibold cursor-help transition-colors',
              bgClass,
              textClass
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
            {confidence === 'high' && (
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">Market Regime: {label}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {label === 'Risk-On' && `60%+ of indices within ${TRADER_CONFIG.HOT_THRESHOLD} days of highs`}
            {label === 'Risk-Off' && `60%+ of indices >${TRADER_CONFIG.COLD_THRESHOLD} days from highs`}
            {label === 'Narrow / Mixed' && 'Mixed signals - no clear directional bias'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Confidence: <span className="font-medium capitalize">{confidence}</span>
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function BreadthIndicator({
  hotCount,
  coldCount,
  neutralCount,
  total,
}: {
  hotCount: number
  coldCount: number
  neutralCount: number
  total: number
}) {
  const hotPct = (hotCount / total) * 100
  const neutralPct = (neutralCount / total) * 100
  const coldPct = (coldCount / total) * 100

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-help">
            {/* Mini heat strip */}
            <div className="flex h-2 w-16 rounded-full overflow-hidden border border-border/50">
              {hotPct > 0 && (
                <div
                  className="bg-emerald-500 transition-all duration-300"
                  style={{ width: `${hotPct}%` }}
                />
              )}
              {neutralPct > 0 && (
                <div
                  className="bg-amber-400 transition-all duration-300"
                  style={{ width: `${neutralPct}%` }}
                />
              )}
              {coldPct > 0 && (
                <div
                  className="bg-red-500 transition-all duration-300"
                  style={{ width: `${coldPct}%` }}
                />
              )}
            </div>

            {/* Labels */}
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="text-emerald-600 dark:text-emerald-400">
                {hotCount}/{total} hot
              </span>
              <span className="text-red-600 dark:text-red-400">
                {coldCount}/{total} cold
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">Market Breadth</p>
          <div className="text-xs text-muted-foreground mt-1 space-y-1">
            <p>
              <span className="text-emerald-500 font-medium">Hot (≤{TRADER_CONFIG.HOT_THRESHOLD}d):</span>{' '}
              {hotCount} indices near highs
            </p>
            <p>
              <span className="text-amber-500 font-medium">Neutral:</span>{' '}
              {neutralCount} indices in middle range
            </p>
            <p>
              <span className="text-red-500 font-medium">Cold (≥{TRADER_CONFIG.COLD_THRESHOLD}d):</span>{' '}
              {coldCount} indices far from highs
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function SignalCounters({
  confirmations,
  rejections,
  recentRate,
  recentSessions,
}: {
  confirmations: number
  rejections: number
  recentRate: number
  recentSessions: number
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Confirmations */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-help',
                confirmations > 0
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>{confirmations}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-medium">Confirmed Breakouts Today</p>
            <p className="text-xs text-muted-foreground">
              Indices that hit new intraday high AND closed at new high
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Rejections */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-help',
                rejections > 0
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <XCircle className="w-3 h-3" />
              <span>{rejections}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-medium">Rejected Breakouts Today</p>
            <p className="text-xs text-muted-foreground">
              Indices that hit new intraday high but failed to close at high
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Multiple rejections warning */}
      {rejections >= 2 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] cursor-help"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Multiple Rejections
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="font-medium text-amber-500">Warning: Multiple Failed Confirmations</p>
              <p className="text-xs text-muted-foreground">
                {rejections} indices tagged new highs but couldn&apos;t hold them.
                This often signals exhaustion or distribution.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Recent rejection rate */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[10px] text-muted-foreground font-mono cursor-help">
              ({recentRate.toFixed(1)}/session last {recentSessions}d)
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-medium">Recent Rejection Rate</p>
            <p className="text-xs text-muted-foreground">
              Average {recentRate.toFixed(2)} rejections per session over last {recentSessions} trading days
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export function TraderSummaryBar({
  basisHigh,
  basisClose,
  dates,
  lookback,
  marketOpen = false,
  lastUpdated,
}: TraderSummaryBarProps) {
  // Compute all signals
  const summary = useMemo(() => {
    return computeSignalSummary(basisHigh, basisClose, dates)
  }, [basisHigh, basisClose, dates])

  if (!summary) {
    return null
  }

  const { regime, confirmations, rejections, recentRejectionRate, totalRecentSessions } = summary

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-card border border-border rounded-lg px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Regime + Breadth */}
        <div className="flex items-center gap-4">
          {/* Market status indicator */}
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            {marketOpen && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Regime badge */}
          <RegimeBadge label={regime.label} confidence={regime.confidence} />

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Breadth indicator */}
          <div className="hidden sm:block">
            <BreadthIndicator
              hotCount={regime.breadth.hotCount}
              coldCount={regime.breadth.coldCount}
              neutralCount={regime.breadth.neutralCount}
              total={regime.breadth.total}
            />
          </div>
        </div>

        {/* Right: Signal counters */}
        <SignalCounters
          confirmations={confirmations.length}
          rejections={rejections.length}
          recentRate={recentRejectionRate}
          recentSessions={totalRecentSessions}
        />
      </div>

      {/* Mobile breadth (shown on smaller screens) */}
      <div className="mt-2 sm:hidden">
        <BreadthIndicator
          hotCount={regime.breadth.hotCount}
          coldCount={regime.breadth.coldCount}
          neutralCount={regime.breadth.neutralCount}
          total={regime.breadth.total}
        />
      </div>
    </motion.div>
  )
}
