'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pin, X, TrendingUp, TrendingDown, Table, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartDataPoint {
  date: string
  value: number
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

interface QueryResultCardProps {
  type: 'chart' | 'table' | 'value'
  title: string
  chartData?: ChartDataPoint[]
  tableData?: Array<Record<string, any>>
  value?: { label: string; value: string | number }
  onPin?: () => void
  onDismiss?: () => void
  isPinned?: boolean
}

// Simple sparkline component
function Sparkline({ data, color = 'currentColor' }: { data: number[]; color?: string }) {
  if (!data.length) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 120
  const height = 40
  const padding = 2

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - 2 * padding)
    const y = padding + (1 - (value - min) / range) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  )
}

// Mini price chart
function MiniChart({ data }: { data: ChartDataPoint[] }) {
  if (!data.length) return null

  const values = data.map((d) => d.value)
  const firstValue = values[0]
  const lastValue = values[values.length - 1]
  const change = ((lastValue - firstValue) / firstValue) * 100
  const isPositive = change >= 0

  return (
    <div className="flex flex-col gap-2">
      {/* Price change header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-mono font-bold tabular-nums">
            {lastValue.toFixed(2)}
          </span>
          <div className={cn(
            'flex items-center gap-1 text-sm font-medium',
            isPositive ? 'text-emerald-600' : 'text-rose-600'
          )}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{isPositive ? '+' : ''}{change.toFixed(2)}%</span>
          </div>
        </div>
        <Sparkline
          data={values}
          color={isPositive ? 'rgb(16, 185, 129)' : 'rgb(225, 29, 72)'}
        />
      </div>

      {/* Mini bar chart */}
      <div className="h-20 flex items-end gap-px">
        {data.slice(-30).map((d, i) => {
          const height = ((d.value - Math.min(...values)) / (Math.max(...values) - Math.min(...values) || 1)) * 100
          return (
            <div
              key={i}
              className={cn(
                'flex-1 min-w-[2px] rounded-t-sm transition-all',
                d.close && d.open
                  ? d.close >= d.open
                    ? 'bg-emerald-500/70'
                    : 'bg-rose-500/70'
                  : 'bg-primary/50'
              )}
              style={{ height: `${Math.max(height, 5)}%` }}
              title={`${d.date}: ${d.value.toFixed(2)}`}
            />
          )
        })}
      </div>

      {/* Date range */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  )
}

// Data table component
function DataTable({ data }: { data: Array<Record<string, any>> }) {
  if (!data.length) return null

  const columns = Object.keys(data[0])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col}
                className="px-2 py-1.5 text-left font-medium text-muted-foreground uppercase text-xs"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
              {columns.map((col) => (
                <td key={col} className="px-2 py-1.5 font-mono text-xs tabular-nums">
                  {String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Value display component
function ValueDisplay({ label, value }: { label: string; value: string | number }) {
  const isPositive = typeof value === 'string' && value.startsWith('+')
  const isNegative = typeof value === 'string' && value.startsWith('-')

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <span className="text-sm text-muted-foreground mb-1">{label}</span>
      <span className={cn(
        'text-3xl font-mono font-bold tabular-nums',
        isPositive && 'text-emerald-600',
        isNegative && 'text-rose-600'
      )}>
        {value}
      </span>
    </div>
  )
}

export function QueryResultCard({
  type,
  title,
  chartData,
  tableData,
  value,
  onPin,
  onDismiss,
  isPinned = false,
}: QueryResultCardProps) {
  const TypeIcon = type === 'chart' ? BarChart3 : type === 'table' ? Table : TrendingUp

  return (
    <Card className={cn(
      'border-border overflow-hidden transition-all',
      isPinned && 'ring-2 ring-primary/50'
    )}>
      <CardHeader className="py-2 px-3 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <TypeIcon className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {onPin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onPin}
              title={isPinned ? 'Unpin' : 'Pin to dashboard'}
            >
              <Pin className={cn('h-3 w-3', isPinned && 'text-primary fill-primary')} />
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onDismiss}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {type === 'chart' && chartData && <MiniChart data={chartData} />}
        {type === 'table' && tableData && <DataTable data={tableData} />}
        {type === 'value' && value && <ValueDisplay {...value} />}
      </CardContent>
    </Card>
  )
}
