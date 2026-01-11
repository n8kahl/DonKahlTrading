'use client'

import { cn } from '@/lib/utils'
import { Activity, Pin, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CardProps, OptionsChainData, PinConfig } from './types'

interface OptionsChainTableProps extends CardProps {
  data: OptionsChainData
}

export function OptionsChainTable({ data, onPin, className }: OptionsChainTableProps) {
  const handlePin = () => {
    if (!onPin) return
    const config: PinConfig = {
      type: 'options_chain',
      title: `${data.symbol} Options`,
      config: { symbol: data.symbol },
      pinnedAt: new Date().toISOString(),
    }
    onPin(config)
  }

  if (data.error || !data.data) {
    return (
      <div
        className={cn(
          'rounded-lg border border-red-500/20 bg-red-500/5 backdrop-blur-sm p-4',
          className
        )}
      >
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{data.error || 'No options data available'}</span>
        </div>
      </div>
    )
  }

  const { putCallRatio, sentiment, topStrike, totalVolume, totalOpenInterest, avgIV, maxPainStrike, underlyingPrice, strikeDistance } = data.data

  const sentimentConfig = {
    Bullish: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: TrendingUp },
    Bearish: { color: 'text-red-400', bg: 'bg-red-500/10', icon: TrendingDown },
    Neutral: { color: 'text-white/60', bg: 'bg-white/5', icon: Minus },
  }

  const config = sentimentConfig[sentiment as keyof typeof sentimentConfig] || sentimentConfig.Neutral
  const SentimentIcon = config.icon

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
          <Activity className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-medium text-white">{data.symbol} Options Flow</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
              config.bg,
              config.color
            )}
          >
            <SentimentIcon className="w-3 h-3" />
            {sentiment}
          </span>
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-px bg-white/5">
        <MetricCell label="P/C Ratio" value={putCallRatio.toFixed(2)} highlight={putCallRatio > 1.2 || putCallRatio < 0.8} />
        <MetricCell label="Underlying" value={`$${underlyingPrice.toFixed(2)}`} />
        <MetricCell label="Max Pain" value={`$${maxPainStrike.toFixed(0)}`} />
        <MetricCell label="Top Strike" value={`$${topStrike.toFixed(0)}`} subtext={`${strikeDistance.toFixed(1)}% away`} />
        <MetricCell label="Avg IV" value={`${(avgIV * 100).toFixed(1)}%`} highlight={avgIV > 0.5} />
        <MetricCell label="Volume" value={formatNumber(totalVolume)} />
        <MetricCell label="Open Interest" value={formatNumber(totalOpenInterest)} colSpan />
      </div>

      {/* Analysis */}
      <div className="px-3 py-2 border-t border-white/5 bg-white/5">
        <p className="text-[10px] text-white/60 leading-relaxed">
          {generateAnalysis(data.data)}
        </p>
      </div>
    </div>
  )
}

function MetricCell({
  label,
  value,
  subtext,
  highlight,
  colSpan,
}: {
  label: string
  value: string
  subtext?: string
  highlight?: boolean
  colSpan?: boolean
}) {
  return (
    <div
      className={cn(
        'bg-black/20 px-3 py-2',
        colSpan && 'col-span-2'
      )}
    >
      <p className="text-[10px] text-white/40 font-medium uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm font-mono font-semibold', highlight ? 'text-primary' : 'text-white')}>
        {value}
      </p>
      {subtext && <p className="text-[10px] text-white/40 mt-0.5">{subtext}</p>}
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}

function generateAnalysis(data: NonNullable<OptionsChainData['data']>): string {
  const parts: string[] = []

  // P/C Ratio interpretation
  if (data.putCallRatio > 1.3) {
    parts.push('Heavy put buying suggests bearish positioning')
  } else if (data.putCallRatio < 0.7) {
    parts.push('Call-heavy flow indicates bullish sentiment')
  } else {
    parts.push('Balanced put/call activity')
  }

  // IV interpretation
  if (data.avgIV > 0.5) {
    parts.push('elevated IV pricing in significant moves')
  } else if (data.avgIV < 0.2) {
    parts.push('low IV suggests complacency')
  }

  // Strike distance
  if (data.strikeDistance < 2) {
    parts.push('activity concentrated near current price')
  } else if (data.strikeDistance > 5) {
    parts.push(`traders targeting ${data.strikeDistance.toFixed(0)}% move`)
  }

  return parts.join('; ') + '.'
}
