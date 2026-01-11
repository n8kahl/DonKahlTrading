'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { cn } from '@/lib/utils'
import { getHeatStyle, type HeatMetric } from '@/lib/heat/colors'
import { HeatLegend } from './heat-legend'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Info,
  Columns2,
  ArrowUp,
  ArrowDown,
  GitCompare,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  X,
} from 'lucide-react'
import type { MarketExtremesResponse, DivergenceAlert } from '@/app/api/market-extremes/route'

// =============================================================================
// Types
// =============================================================================

type ViewMode = 'split' | 'high' | 'close' | 'delta'

interface MarketExtremesPanelProps {
  symbols?: string
  lookback?: number
  days?: number
  className?: string
}

// Symbol display mapping
const SYMBOL_DISPLAY: Record<string, string> = {
  DJI: 'Dow',
  SPX: 'S&P',
  IXIC: 'Comp',
  NDX: 'NDX',
  RUT: 'Russ',
  SOX: 'Semi',
  VIX: 'VIX',
  NYA: 'NYSE',
}

// =============================================================================
// Persistence Helpers
// =============================================================================

const STORAGE_KEY = 'market-extremes-view-mode'
const SHOW_PCT_KEY = 'market-extremes-show-pct'

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'split'
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && ['split', 'high', 'close', 'delta'].includes(saved)) {
    return saved as ViewMode
  }
  return 'split'
}

function saveViewMode(mode: ViewMode) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, mode)
  }
}

function loadShowPct(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SHOW_PCT_KEY) === 'true'
}

function saveShowPct(show: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SHOW_PCT_KEY, show ? 'true' : 'false')
  }
}

// =============================================================================
// Fetcher
// =============================================================================

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// =============================================================================
// Sub-Components
// =============================================================================

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
  )
}

function SignalBadge({
  type,
  count,
  symbols,
}: {
  type: 'confirmed' | 'rejected'
  count: number
  symbols: string[]
}) {
  if (count === 0) return null

  const isConfirmed = type === 'confirmed'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
              isConfirmed
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
            )}
          >
            {isConfirmed ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            <span>
              {count} {isConfirmed ? 'Confirmed' : 'Rejected'}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium mb-1">
            {isConfirmed ? 'Confirmed Breakouts' : 'Rejected Breakouts'}
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            {isConfirmed
              ? 'Both intraday high AND close at new highs. Strong bullish confirmation.'
              : 'Intraday touched new high but closed lower. Potential reversal warning.'}
          </p>
          <p className="text-xs font-mono">{symbols.join(', ')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function DivergenceCallout({ alert }: { alert: DivergenceAlert }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
      <span className="text-amber-700 dark:text-amber-400">{alert.message}</span>
    </div>
  )
}

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
            variant={currentMode === mode ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onClick}
            className={cn(
              'h-7 px-2',
              currentMode === mode && 'bg-primary/10 text-primary'
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
          <p className="font-medium mb-2">High vs Close Basis</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-amber-600">HIGH basis:</span> Uses intraday
              high prices. Detects when price touched a new rolling high, even if it
              closed lower.
            </p>
            <p>
              <span className="font-medium text-blue-600">CLOSE basis:</span> Uses closing
              prices only. More conservative - shows where price actually settled.
            </p>
            <p className="pt-1 border-t border-border">
              <span className="font-medium text-emerald-600">Delta view:</span> Shows
              (High - Close) to highlight breakout rejections. Positive delta = touched
              high but closed lower.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Quick symbol search overlay
function QuickSearch({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (symbols: string) => void
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (isOpen) {
      setValue('')
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) {
      onSubmit(value.trim().toUpperCase())
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-12 right-4 z-50 bg-card border border-border rounded-md shadow-lg p-2"
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AAPL,MSFT,GOOGL..."
          className="bg-transparent border-none outline-none text-sm w-40 placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </form>
    </motion.div>
  )
}

// =============================================================================
// Cell Component with Animation
// =============================================================================

function HeatCell({
  value,
  lookback,
  pctFromHigh,
  showPct,
  isDelta = false,
}: {
  value: number
  lookback: number
  pctFromHigh?: number
  showPct: boolean
  isDelta?: boolean
}) {
  // For delta view, use different styling
  if (isDelta) {
    const isPositive = value > 0
    const intensity = Math.min(Math.abs(value) / 10, 1) // Cap at 10 days difference

    return (
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          'px-2 py-2 text-center font-mono text-sm tabular-nums',
          intensity > 0.3
            ? isPositive
              ? 'text-amber-600 dark:text-amber-400 font-medium'
              : 'text-blue-600 dark:text-blue-400 font-medium'
            : 'text-muted-foreground'
        )}
      >
        {value > 0 ? '+' : ''}
        {value}
      </motion.div>
    )
  }

  const style = getHeatStyle({ metric: 'daysSinceHigh', value, lookback })

  return (
    <motion.div
      layout
      initial={{ opacity: 0.5 }}
      animate={{
        opacity: 1,
        backgroundColor: style.bg,
        color: style.fg,
      }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'px-2 py-2 text-center font-mono text-sm tabular-nums',
        style.intensity > 0.5 && 'font-semibold'
      )}
    >
      <span>{value}</span>
      {showPct && pctFromHigh !== undefined && (
        <span className="block text-[10px] opacity-70 font-normal">
          {pctFromHigh.toFixed(1)}%
        </span>
      )}
    </motion.div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function MarketExtremesPanel({
  symbols = 'DJI,SPX,IXIC,NDX,RUT,SOX',
  lookback = 63,
  days = 20,
  className,
}: MarketExtremesPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [showPct, setShowPct] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [customSymbols, setCustomSymbols] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)

  // Load persisted settings on mount
  useEffect(() => {
    setViewMode(loadViewMode())
    setShowPct(loadShowPct())
    setMounted(true)
  }, [])

  // Keyboard shortcut: 'g' for go to symbol
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setShowSearch(true)
      }
      if (e.key === 'Escape') {
        setShowSearch(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    saveViewMode(mode)
  }, [])

  const handleTogglePct = useCallback(() => {
    setShowPct((prev) => {
      const next = !prev
      saveShowPct(next)
      return next
    })
  }, [])

  const handleSymbolSearch = useCallback((newSymbols: string) => {
    setCustomSymbols(newSymbols)
  }, [])

  // Build API URL
  const activeSymbols = customSymbols || symbols
  const params = new URLSearchParams({
    symbols: activeSymbols,
    lookback: lookback.toString(),
    days: days.toString(),
  })

  const { data, error, isLoading, isValidating } = useSWR<MarketExtremesResponse>(
    `/api/market-extremes?${params}`,
    fetcher,
    {
      refreshInterval: 60000, // 1 minute
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  )

  // Compute latest values for display
  const latestData = useMemo(() => {
    if (!data?.basis?.high || !data?.basis?.close) return null

    const result: Record<
      string,
      { high: number; close: number; delta: number; highPct: number; closePct: number }
    > = {}

    data.symbols.forEach((symbol) => {
      const highRows = data.basis.high[symbol] || []
      const closeRows = data.basis.close[symbol] || []

      const latestHigh = highRows[highRows.length - 1]
      const latestClose = closeRows[closeRows.length - 1]

      if (latestHigh && latestClose) {
        result[symbol] = {
          high: latestHigh.daysSinceHigh,
          close: latestClose.daysSinceHigh,
          delta: latestHigh.daysSinceHigh - latestClose.daysSinceHigh,
          highPct: latestHigh.pctFromHigh,
          closePct: latestClose.pctFromHigh,
        }
      }
    })

    return result
  }, [data])

  // Don't render anything until mounted (avoid hydration issues)
  if (!mounted) {
    return (
      <div className={cn('border border-border rounded-lg bg-card', className)}>
        <div className="h-32 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={cn('border border-border rounded-lg bg-card p-4', className)}>
        <div className="text-center text-destructive text-sm">
          Failed to load market extremes data
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative border border-border rounded-lg bg-card overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Market Extremes</h3>
            <InfoTooltip />
          </div>

          {/* Signal Badges */}
          {data?.summary && (
            <div className="flex items-center gap-2">
              <SignalBadge
                type="confirmed"
                count={data.summary.confirmedBreakouts.length}
                symbols={data.summary.confirmedBreakouts}
              />
              <SignalBadge
                type="rejected"
                count={data.summary.rejectedBreakouts.length}
                symbols={data.summary.rejectedBreakouts}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Show % toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={showPct ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={handleTogglePct}
                  className="h-7 px-2 text-xs"
                >
                  %
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Show % from high under days</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* View Mode Buttons */}
          <div className="flex items-center gap-0.5 p-0.5 bg-muted rounded">
            <ViewModeButton
              mode="split"
              currentMode={viewMode}
              onClick={() => handleViewModeChange('split')}
              icon={Columns2}
              label="Split View (High vs Close)"
            />
            <ViewModeButton
              mode="high"
              currentMode={viewMode}
              onClick={() => handleViewModeChange('high')}
              icon={ArrowUp}
              label="High Basis Only"
            />
            <ViewModeButton
              mode="close"
              currentMode={viewMode}
              onClick={() => handleViewModeChange('close')}
              icon={ArrowDown}
              label="Close Basis Only"
            />
            <ViewModeButton
              mode="delta"
              currentMode={viewMode}
              onClick={() => handleViewModeChange('delta')}
              icon={GitCompare}
              label="Delta (High - Close)"
            />
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 pl-2">
            <LivePulse />
            {isValidating && !isLoading && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Quick Search Overlay */}
      <AnimatePresence>
        {showSearch && (
          <QuickSearch
            isOpen={showSearch}
            onClose={() => setShowSearch(false)}
            onSubmit={handleSymbolSearch}
          />
        )}
      </AnimatePresence>

      {/* Divergence Alerts */}
      {data?.summary?.divergences && data.summary.divergences.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-amber-500/5 flex flex-wrap gap-2">
          {data.summary.divergences.map((alert, i) => (
            <DivergenceCallout key={i} alert={alert} />
          ))}
        </div>
      )}

      {/* Loading State */}
      {isLoading && !data && (
        <div className="h-24 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Table */}
      {latestData && data && (
        <div className="overflow-x-auto">
          <LayoutGroup>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-r border-border w-24">
                    {lookback}d High
                  </th>
                  {data.symbols.map((symbol) => (
                    <th
                      key={symbol}
                      className="px-2 py-2 text-center text-xs font-semibold min-w-[60px]"
                    >
                      {SYMBOL_DISPLAY[symbol] || symbol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="wait">
                  {/* Split View */}
                  {viewMode === 'split' && (
                    <>
                      <motion.tr
                        key="high-row"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-t border-border/50"
                      >
                        <td className="px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-500 border-r border-border whitespace-nowrap">
                          HIGH basis
                        </td>
                        {data.symbols.map((symbol) => (
                          <td key={`high-${symbol}`} className="p-0">
                            <HeatCell
                              value={latestData[symbol]?.high ?? lookback}
                              lookback={lookback}
                              pctFromHigh={latestData[symbol]?.highPct}
                              showPct={showPct}
                            />
                          </td>
                        ))}
                      </motion.tr>
                      <motion.tr
                        key="close-row"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-t border-border/50"
                      >
                        <td className="px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-500 border-r border-border whitespace-nowrap">
                          CLOSE basis
                        </td>
                        {data.symbols.map((symbol) => (
                          <td key={`close-${symbol}`} className="p-0">
                            <HeatCell
                              value={latestData[symbol]?.close ?? lookback}
                              lookback={lookback}
                              pctFromHigh={latestData[symbol]?.closePct}
                              showPct={showPct}
                            />
                          </td>
                        ))}
                      </motion.tr>
                    </>
                  )}

                  {/* High Only */}
                  {viewMode === 'high' && (
                    <motion.tr
                      key="high-only"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-t border-border/50"
                    >
                      <td className="px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-500 border-r border-border whitespace-nowrap">
                        Days
                      </td>
                      {data.symbols.map((symbol) => (
                        <td key={`high-${symbol}`} className="p-0">
                          <HeatCell
                            value={latestData[symbol]?.high ?? lookback}
                            lookback={lookback}
                            pctFromHigh={latestData[symbol]?.highPct}
                            showPct={showPct}
                          />
                        </td>
                      ))}
                    </motion.tr>
                  )}

                  {/* Close Only */}
                  {viewMode === 'close' && (
                    <motion.tr
                      key="close-only"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-t border-border/50"
                    >
                      <td className="px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-500 border-r border-border whitespace-nowrap">
                        Days
                      </td>
                      {data.symbols.map((symbol) => (
                        <td key={`close-${symbol}`} className="p-0">
                          <HeatCell
                            value={latestData[symbol]?.close ?? lookback}
                            lookback={lookback}
                            pctFromHigh={latestData[symbol]?.closePct}
                            showPct={showPct}
                          />
                        </td>
                      ))}
                    </motion.tr>
                  )}

                  {/* Delta View */}
                  {viewMode === 'delta' && (
                    <motion.tr
                      key="delta-row"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-t border-border/50"
                    >
                      <td className="px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border whitespace-nowrap">
                        H - C
                      </td>
                      {data.symbols.map((symbol) => (
                        <td key={`delta-${symbol}`} className="p-0">
                          <HeatCell
                            value={latestData[symbol]?.delta ?? 0}
                            lookback={lookback}
                            showPct={false}
                            isDelta
                          />
                        </td>
                      ))}
                    </motion.tr>
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </LayoutGroup>
        </div>
      )}

      {/* Footer with legend and breadth */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20">
        <HeatLegend metricType="high" compact />

        {data?.summary?.marketBreadth && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {data.summary.marketBreadth.atHighsCount}/{data.summary.marketBreadth.totalSymbols} at
              highs
            </span>
            <span>Avg: {data.summary.marketBreadth.avgDaysSinceHigh}d</span>
            <span className="text-muted-foreground/60">Press 'g' for quick search</span>
          </div>
        )}
      </div>

      {/* Custom symbols indicator */}
      {customSymbols && (
        <div className="absolute top-2 right-20 flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded text-xs">
          <span className="text-primary">Custom</span>
          <button
            type="button"
            onClick={() => setCustomSymbols(null)}
            className="text-primary hover:text-primary/80"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}
