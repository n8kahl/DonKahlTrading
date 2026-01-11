'use client'

import { cn } from '@/lib/utils'
import { BarChart3, Pin, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CardProps, BreadthData, PinConfig } from './types'

interface BreadthPanelProps extends CardProps {
  data: BreadthData
}

export function BreadthPanel({ data, onPin, className }: BreadthPanelProps) {
  const handlePin = () => {
    if (!onPin) return
    const config: PinConfig = {
      type: 'breadth',
      title: 'Market Breadth',
      config: {},
      pinnedAt: new Date().toISOString(),
    }
    onPin(config)
  }

  const total = data.advancers + data.decliners + data.unchanged
  const advanceRatio = total > 0 ? data.advancers / total : 0
  const declineRatio = total > 0 ? data.decliners / total : 0
  const adLine = data.advancers - data.decliners

  const breadthSignal =
    advanceRatio > 0.6 ? 'strong-bullish' :
    advanceRatio > 0.5 ? 'bullish' :
    declineRatio > 0.6 ? 'strong-bearish' :
    declineRatio > 0.5 ? 'bearish' : 'neutral'

  const volumeRatio = data.upVolume + data.downVolume > 0
    ? data.upVolume / (data.upVolume + data.downVolume)
    : 0.5

  return (
    <div
      className={cn(
        'rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium text-white">Market Breadth</span>
        </div>
        <div className="flex items-center gap-2">
          <BreadthSignalBadge signal={breadthSignal} />
          {onPin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePin}
              className="h-6 w-6 p-0 text-white/50 hover:text-white hover:bg-white/10"
            >
              <Pin className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-3 gap-px bg-white/5">
        <MetricBox
          label="Advancers"
          value={data.advancers.toLocaleString()}
          color="emerald"
          percent={advanceRatio * 100}
        />
        <MetricBox
          label="Decliners"
          value={data.decliners.toLocaleString()}
          color="red"
          percent={declineRatio * 100}
        />
        <MetricBox
          label="Unchanged"
          value={data.unchanged.toLocaleString()}
          color="gray"
          percent={((data.unchanged / total) * 100) || 0}
        />
      </div>

      {/* A/D Line */}
      <div className="px-3 py-2 border-t border-white/5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-white/40">Advance/Decline Line</span>
          <span
            className={cn(
              'text-xs font-mono font-semibold',
              adLine > 0 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {adLine > 0 ? '+' : ''}
            {adLine.toLocaleString()}
          </span>
        </div>
        <ADBar advanceRatio={advanceRatio} />
      </div>

      {/* New Highs/Lows */}
      <div className="grid grid-cols-2 gap-px bg-white/5 border-t border-white/5">
        <div className="bg-black/20 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-white/40">New Highs</span>
          </div>
          <span className="text-sm font-mono font-semibold text-white">
            {data.newHighs.toLocaleString()}
          </span>
        </div>
        <div className="bg-black/20 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingDown className="w-3 h-3 text-red-400" />
            <span className="text-[10px] text-white/40">New Lows</span>
          </div>
          <span className="text-sm font-mono font-semibold text-white">
            {data.newLows.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Volume Breadth */}
      <div className="px-3 py-2 border-t border-white/5 bg-white/5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-white/40">Volume Breadth</span>
          <span className="text-[10px] text-white/60 font-mono">
            {(volumeRatio * 100).toFixed(0)}% up
          </span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${volumeRatio * 100}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${(1 - volumeRatio) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function MetricBox({
  label,
  value,
  color,
  percent,
}: {
  label: string
  value: string
  color: 'emerald' | 'red' | 'gray'
  percent: number
}) {
  const colors = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    gray: 'text-white/60',
  }

  return (
    <div className="bg-black/20 px-3 py-2.5 text-center">
      <p className="text-[10px] text-white/40 mb-1">{label}</p>
      <p className={cn('text-lg font-mono font-bold', colors[color])}>{value}</p>
      <p className="text-[10px] text-white/40 mt-0.5">{percent.toFixed(1)}%</p>
    </div>
  )
}

function ADBar({ advanceRatio }: { advanceRatio: number }) {
  return (
    <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full bg-emerald-500"
        style={{ width: `${advanceRatio * 100}%` }}
      />
      <div
        className="absolute right-0 top-0 h-full bg-red-500"
        style={{ width: `${(1 - advanceRatio) * 100}%` }}
      />
      {/* Center line */}
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/30" />
    </div>
  )
}

function BreadthSignalBadge({
  signal,
}: {
  signal: 'strong-bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong-bearish'
}) {
  const config = {
    'strong-bullish': { label: 'Strong', color: 'text-emerald-400 bg-emerald-500/10' },
    bullish: { label: 'Bullish', color: 'text-emerald-400 bg-emerald-500/10' },
    neutral: { label: 'Neutral', color: 'text-white/60 bg-white/5' },
    bearish: { label: 'Bearish', color: 'text-red-400 bg-red-500/10' },
    'strong-bearish': { label: 'Weak', color: 'text-red-400 bg-red-500/10' },
  }

  const { label, color } = config[signal]

  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', color)}>
      {label}
    </span>
  )
}
