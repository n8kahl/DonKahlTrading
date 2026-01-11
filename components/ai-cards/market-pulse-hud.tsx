'use client'

import { cn } from '@/lib/utils'
import { Zap, Pin, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CardProps, MarketPulseData, PinConfig } from './types'

interface MarketPulseHUDProps extends CardProps {
  data: MarketPulseData
}

export function MarketPulseHUD({ data, onPin, className }: MarketPulseHUDProps) {
  const handlePin = () => {
    if (!onPin) return
    const config: PinConfig = {
      type: 'pulse',
      title: 'Market Pulse',
      config: { symbols: data.symbols.map((s) => s.symbol) },
      pinnedAt: new Date().toISOString(),
    }
    onPin(config)
  }

  const bullishCount = data.symbols.filter((s) => s.signal === 'bullish').length
  const bearishCount = data.symbols.filter((s) => s.signal === 'bearish').length
  const overallSentiment =
    bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : 'neutral'

  const statusColors = {
    open: 'bg-emerald-500',
    closed: 'bg-red-500',
    'pre-market': 'bg-yellow-500',
    'after-hours': 'bg-purple-500',
  }

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
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-xs font-medium text-white">Market Pulse</span>
          <div className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full animate-pulse', statusColors[data.marketStatus])} />
            <span className="text-[10px] text-white/50 capitalize">{data.marketStatus}</span>
          </div>
        </div>
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

      {/* Symbol Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white/5">
        {data.symbols.map((item) => (
          <SymbolTile key={item.symbol} {...item} />
        ))}
      </div>

      {/* Sentiment Bar */}
      <div className="px-3 py-2 border-t border-white/5 bg-white/5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-white/40">Market Sentiment</span>
          <span
            className={cn(
              'text-[10px] font-medium uppercase',
              overallSentiment === 'bullish'
                ? 'text-emerald-400'
                : overallSentiment === 'bearish'
                  ? 'text-red-400'
                  : 'text-white/60'
            )}
          >
            {overallSentiment}
          </span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${(bullishCount / data.symbols.length) * 100}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${(bearishCount / data.symbols.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-white/5">
        <p className="text-[10px] text-white/30 font-mono">
          Updated {new Date(data.lastUpdated).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}

function SymbolTile({
  symbol,
  price,
  change,
  changePercent,
  signal,
}: {
  symbol: string
  price: number
  change: number
  changePercent: number
  signal: 'bullish' | 'bearish' | 'neutral'
}) {
  const isPositive = change >= 0

  const SignalIcon = signal === 'bullish' ? TrendingUp : signal === 'bearish' ? TrendingDown : Minus
  const signalColor = signal === 'bullish' ? 'text-emerald-400' : signal === 'bearish' ? 'text-red-400' : 'text-white/40'

  return (
    <div className="bg-black/20 px-3 py-2.5 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-semibold text-white text-sm">{symbol}</span>
          <SignalIcon className={cn('w-3 h-3', signalColor)} />
        </div>
        <p className="text-[10px] text-white/40 font-mono">${price.toLocaleString()}</p>
      </div>
      <div className="text-right">
        <p
          className={cn(
            'text-xs font-mono font-semibold',
            isPositive ? 'text-emerald-400' : 'text-red-400'
          )}
        >
          {isPositive ? '+' : ''}
          {changePercent.toFixed(2)}%
        </p>
        <p
          className={cn(
            'text-[10px] font-mono',
            isPositive ? 'text-emerald-400/60' : 'text-red-400/60'
          )}
        >
          {isPositive ? '+' : ''}
          {change.toFixed(2)}
        </p>
      </div>
    </div>
  )
}
