'use client'

import { getHeatLegend, type LegendItem } from '@/lib/heat/colors'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface HeatLegendProps {
  /** Which metric type to show legend for */
  metricType: 'high' | 'low' | 'both'
  /** Whether showing days metric (true) or percentage (false) */
  isDays?: boolean
  /** Compact mode for smaller displays */
  compact?: boolean
  /** Show signal border explanations */
  showSignals?: boolean
}

function LegendSection({ items, label }: { items: LegendItem[]; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
        {label}:
      </span>
      <div className="flex items-center gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-sm border border-border/30"
              style={{ backgroundColor: item.bg }}
            />
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Signal indicators component
function SignalIndicators() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <div
          className="w-4 h-4 rounded-sm border-2 border-black"
          style={{
            boxShadow: '0 0 0 2px #10b981, inset 0 0 4px rgba(16, 185, 129, 0.3)',
            backgroundColor: '#059669'
          }}
        />
        <span className="text-[10px] text-muted-foreground">Confirmed</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="w-4 h-4 rounded-sm border-2 border-black"
          style={{
            boxShadow: '0 0 0 2px #f59e0b, inset 0 0 4px rgba(245, 158, 11, 0.3)',
            backgroundColor: '#34d399'
          }}
        />
        <span className="text-[10px] text-muted-foreground">Rejected</span>
      </div>
    </div>
  )
}

// Contextual hint for understanding the colors
function ColorMeaningHint({ metricType }: { metricType: 'high' | 'low' }) {
  const isHigh = metricType === 'high'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <Info className="w-3 h-3" />
            <span className="underline decoration-dotted">What do colors mean?</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs p-3">
          <div className="space-y-2 text-xs">
            {isHigh ? (
              <>
                <p className="font-medium text-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-green-500" />
                  Days/% from Rolling High
                </p>
                <div className="space-y-1 text-muted-foreground">
                  <p><span className="text-green-500 font-medium">Green</span> = Near highs (strong/bullish)</p>
                  <p><span className="text-amber-500 font-medium">Amber</span> = Pulling back (watch)</p>
                  <p><span className="text-red-500 font-medium">Red</span> = Far from highs (weak)</p>
                </div>
                <p className="pt-1 border-t border-border text-muted-foreground">
                  0 days = Made new high today
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-red-500" />
                  Days/% from Rolling Low
                </p>
                <div className="space-y-1 text-muted-foreground">
                  <p><span className="text-red-500 font-medium">Red</span> = Near lows (weak/bearish)</p>
                  <p><span className="text-amber-500 font-medium">Amber</span> = Recovering (watch)</p>
                  <p><span className="text-green-500 font-medium">Green</span> = Far from lows (strong)</p>
                </div>
                <p className="pt-1 border-t border-border text-muted-foreground">
                  0 days = Made new low today
                </p>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function HeatLegend({ metricType, isDays = true, compact = false, showSignals = false }: HeatLegendProps) {
  const highLegend = getHeatLegend('high', isDays)
  const lowLegend = getHeatLegend('low', isDays)

  if (compact) {
    // Compact single-line legend with gradient visualization
    const items = metricType === 'low' ? lowLegend : highLegend
    const isHigh = metricType !== 'low'

    return (
      <div className="flex items-center gap-3">
        {/* Color gradient with labels */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            {isHigh ? (
              <TrendingUp className="w-3 h-3 text-green-500" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-500" />
            )}
            {isDays ? 'Days' : '%'} from {isHigh ? 'High' : 'Low'}:
          </span>
          <div className="flex items-center gap-0.5">
            <span className="text-[9px] text-green-600 dark:text-green-400 font-medium">
              {isHigh ? 'Strong' : 'Weak'}
            </span>
            {items.map((item) => (
              <div
                key={item.label}
                className="w-4 h-4 rounded-sm border border-border/20"
                style={{ backgroundColor: item.bg }}
                title={item.label}
              />
            ))}
            <span className="text-[9px] text-red-600 dark:text-red-400 font-medium">
              {isHigh ? 'Weak' : 'Strong'}
            </span>
          </div>
        </div>

        {/* Signal indicators */}
        {showSignals && (
          <>
            <div className="h-3 w-px bg-border" />
            <SignalIndicators />
          </>
        )}

        {/* Help hint */}
        <ColorMeaningHint metricType={isHigh ? 'high' : 'low'} />
      </div>
    )
  }

  // Full legend
  return (
    <div className="flex flex-wrap items-center justify-end gap-4 px-4 py-2 border-t border-border bg-muted/30">
      {(metricType === 'high' || metricType === 'both') && (
        <LegendSection
          items={highLegend}
          label={isDays ? "Days from High" : "% from High"}
        />
      )}
      {(metricType === 'low' || metricType === 'both') && (
        <LegendSection
          items={lowLegend}
          label={isDays ? "Days from Low" : "% from Low"}
        />
      )}
    </div>
  )
}

// New: Inline header legend for table - always visible
export function InlineHeatLegend({
  metricType,
  isDays = true
}: {
  metricType: 'high' | 'low'
  isDays?: boolean
}) {
  const items = metricType === 'low' ? getHeatLegend('low', isDays) : getHeatLegend('high', isDays)
  const isHigh = metricType === 'high'

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* Main color scale */}
      <div className="flex items-center gap-2">
        <span className={cn(
          "text-[10px] font-medium",
          isHigh ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
        )}>
          {isHigh ? '← At highs' : '← At lows'}
        </span>
        <div className="flex items-center gap-0.5">
          {items.map((item, i) => (
            <TooltipProvider key={item.label}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "w-5 h-5 rounded-sm border border-border/30 cursor-help",
                      "transition-transform hover:scale-110"
                    )}
                    style={{ backgroundColor: item.bg }}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
        <span className={cn(
          "text-[10px] font-medium",
          isHigh ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
        )}>
          {isHigh ? 'Far from highs →' : 'Far from lows →'}
        </span>
      </div>

      {/* Signal indicators with explanations */}
      <div className="flex items-center gap-3 pl-3 border-l border-border">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-help">
                <div
                  className="w-4 h-4 rounded-sm border-2 border-black relative"
                  style={{
                    boxShadow: '0 0 0 2px #10b981',
                    backgroundColor: '#059669'
                  }}
                >
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-black" />
                </div>
                <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Confirmed</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-medium">Confirmed Breakout</p>
              <p className="text-xs text-muted-foreground">Both intraday high AND close made new highs = strong signal</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-help">
                <div
                  className="w-4 h-4 rounded-sm border-2 border-black"
                  style={{
                    boxShadow: '0 0 0 2px #f59e0b',
                    backgroundColor: '#34d399'
                  }}
                />
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Rejected</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-medium">Rejected Breakout</p>
              <p className="text-xs text-muted-foreground">Intraday touched new high but closed lower = potential reversal warning</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
