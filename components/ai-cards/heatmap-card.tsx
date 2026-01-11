'use client'

import { cn } from '@/lib/utils'
import { Grid3x3, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CardProps, HeatmapData, PinConfig } from './types'

interface HeatmapCardProps extends CardProps {
  data: HeatmapData
}

export function HeatmapCard({ data, onPin, className }: HeatmapCardProps) {
  const handlePin = () => {
    if (!onPin) return
    const config: PinConfig = {
      type: 'heatmap',
      title: `${data.lookback}d Heatmap`,
      config: { lookback: data.lookback, symbols: Object.keys(data.data) },
      pinnedAt: new Date().toISOString(),
    }
    onPin(config)
  }

  const symbols = Object.keys(data.data)
  const recentDates = data.dates.slice(-10) // Show last 10 days

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
          <Grid3x3 className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-medium text-white">
            {data.lookback}d Rolling High Heatmap
          </span>
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

      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-white/40">
              <th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-black/60 backdrop-blur-sm">
                Symbol
              </th>
              {recentDates.map((date) => (
                <th key={date} className="text-center px-1 py-1.5 font-mono whitespace-nowrap">
                  {formatDate(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map((symbol) => {
              const values = data.data[symbol] || []
              const recentValues = values.slice(-10)

              return (
                <tr key={symbol} className="border-t border-white/5">
                  <td className="px-2 py-1.5 font-mono font-semibold text-white sticky left-0 bg-black/60 backdrop-blur-sm">
                    {symbol}
                  </td>
                  {recentValues.map((value, i) => (
                    <td key={i} className="p-0.5">
                      <HeatmapCell value={value} lookback={data.lookback} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-white/5 bg-white/5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/40">Days since {data.lookback}d high</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/40">0</span>
            <div className="flex gap-0.5">
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map((intensity, i) => (
                <div
                  key={i}
                  className={cn('w-3 h-3 rounded-sm', getHeatmapColor(intensity))}
                />
              ))}
            </div>
            <span className="text-[10px] text-white/40">{data.lookback}+</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeatmapCell({ value, lookback }: { value: number; lookback: number }) {
  const intensity = Math.min(value / lookback, 1)
  const bgColor = getHeatmapColor(intensity)

  return (
    <div
      className={cn(
        'w-full h-6 rounded-sm flex items-center justify-center',
        bgColor
      )}
      title={`${value} days`}
    >
      <span className="text-[9px] font-mono text-white/80">{value}</span>
    </div>
  )
}

function getHeatmapColor(intensity: number): string {
  if (intensity <= 0.05) return 'bg-emerald-500'
  if (intensity <= 0.15) return 'bg-emerald-600'
  if (intensity <= 0.3) return 'bg-yellow-500'
  if (intensity <= 0.5) return 'bg-orange-500'
  if (intensity <= 0.7) return 'bg-red-500'
  return 'bg-red-700'
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
