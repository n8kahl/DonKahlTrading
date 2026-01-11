'use client'

import { useMemo } from 'react'
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
  Zap,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  LineChart,
  Pin,
  Info,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import type { HeatmapMetrics } from '@/lib/massive-api'
import {
  detectDivergences,
  extractLatestRow,
  type DivergenceSignal,
  type DivergenceType,
} from '@/lib/trader-signals'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface DivergenceSpotlightProps {
  basisClose: Record<string, HeatmapMetrics[]>
  dates: string[]
  onViewChart?: (symbol: string) => void
  onPin?: (symbol: string) => void
  maxItems?: number
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getDivergenceIcon(type: DivergenceType) {
  switch (type) {
    case 'small-caps-lagging':
      return TrendingDown
    case 'semis-leading':
      return Zap
    case 'growth-leading':
      return TrendingUp
    case 'dow-leading':
      return TrendingUp
    case 'breadth-divergence':
      return AlertCircle
    default:
      return Sparkles
  }
}

function getConfidenceConfig(confidence: 'High' | 'Medium' | 'Low') {
  switch (confidence) {
    case 'High':
      return {
        bgClass: 'bg-emerald-500/10',
        textClass: 'text-emerald-600 dark:text-emerald-400',
        borderClass: 'border-emerald-500/20',
      }
    case 'Medium':
      return {
        bgClass: 'bg-amber-500/10',
        textClass: 'text-amber-600 dark:text-amber-400',
        borderClass: 'border-amber-500/20',
      }
    case 'Low':
      return {
        bgClass: 'bg-slate-500/10',
        textClass: 'text-slate-600 dark:text-slate-400',
        borderClass: 'border-slate-500/20',
      }
  }
}

// -----------------------------------------------------------------------------
// Sub-Components
// -----------------------------------------------------------------------------

function DivergenceItem({
  divergence,
  onViewChart,
  onPin,
}: {
  divergence: DivergenceSignal
  onViewChart?: (symbol: string) => void
  onPin?: (symbol: string) => void
}) {
  const Icon = getDivergenceIcon(divergence.type)
  const confidenceConfig = getConfidenceConfig(divergence.confidence)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-start gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-3 rounded-md border',
        'bg-gradient-to-r from-transparent to-muted/30',
        confidenceConfig.borderClass
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
          confidenceConfig.bgClass
        )}
      >
        <Icon className={cn('w-4 h-4', confidenceConfig.textClass)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title + Confidence */}
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold truncate">{divergence.title}</h4>
          <Badge
            variant="outline"
            className={cn(
              'text-[9px] px-1.5 py-0',
              confidenceConfig.bgClass,
              confidenceConfig.textClass,
              confidenceConfig.borderClass
            )}
          >
            {divergence.confidence}
          </Badge>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {divergence.description}
        </p>

        {/* Symbol comparison */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
              {divergence.symbols.leader}
            </span>
            <span className="text-emerald-500 text-[10px]">{divergence.leaderDays}d</span>
          </div>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono font-medium text-red-600 dark:text-red-400">
              {divergence.symbols.laggard}
            </span>
            <span className="text-red-500 text-[10px]">{divergence.laggardDays}d</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1">
        {onViewChart && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => onViewChart(divergence.symbols.leader)}
                >
                  <LineChart className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">View {divergence.symbols.leader} chart</TooltipContent>
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
                  onClick={() => onPin(divergence.symbols.leader)}
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

export function DivergenceSpotlight({
  basisClose,
  dates,
  onViewChart,
  onPin,
  maxItems = 3,
}: DivergenceSpotlightProps) {
  // Compute divergences from latest close row
  const divergences = useMemo(() => {
    if (dates.length === 0) return []
    const latestRow = extractLatestRow(basisClose, dates)
    return detectDivergences(latestRow, maxItems)
  }, [basisClose, dates, maxItems])

  const hasDivergences = divergences.length > 0

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h3 className="text-xs sm:text-sm font-semibold">Divergence Spotlight</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium">Rotation & Leadership Cues</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Detects when certain indices are leading or lagging vs others,
                  signaling potential sector rotation or changing market character.
                </p>
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  <p><span className="text-emerald-500">Leader:</span> Near highs (strong)</p>
                  <p><span className="text-red-500">Laggard:</span> Far from highs (weak)</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {hasDivergences && (
          <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400">
            {divergences.length} detected
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="p-2 sm:p-3">
        {hasDivergences ? (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {divergences.map((divergence, index) => (
                <DivergenceItem
                  key={divergence.type}
                  divergence={divergence}
                  onViewChart={onViewChart}
                  onPin={onPin}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No major divergences detected
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Indices are moving relatively in sync
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
