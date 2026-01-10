"use client"

import { cn } from "@/lib/utils"

interface HeatmapTableProps {
  dates: string[]
  data: Record<string, number[]>
  lookback: number
}

export function HeatmapTable({ dates, data, lookback }: HeatmapTableProps) {
  const symbols = Object.keys(data)

  // Get color based on days since high (0 = strongest, lookback = weakest)
  const getHeatmapColor = (value: number) => {
    const intensity = 1 - value / lookback
    const hue = 120 // Green hue
    const saturation = 70
    const lightness = 25 + intensity * 40 // 25-65% lightness range

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  }

  const getTextColor = (value: number) => {
    const intensity = 1 - value / lookback
    return intensity > 0.5 ? "text-black" : "text-white"
  }

  return (
    <div className="relative w-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="sticky left-0 z-20 bg-card border border-border px-3 py-2 text-left font-mono text-xs text-muted-foreground">
              Date
            </th>
            {symbols.map((symbol) => (
              <th
                key={symbol}
                className="border border-border px-3 py-2 text-center font-mono text-xs font-semibold text-foreground"
              >
                {symbol}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date, dateIndex) => (
            <tr key={date} className="hover:bg-muted/50 transition-colors">
              <td className="sticky left-0 z-10 bg-card border border-border px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                {date}
              </td>
              {symbols.map((symbol) => {
                const value = data[symbol]?.[dateIndex] ?? 0
                return (
                  <td
                    key={symbol}
                    className="border border-border px-3 py-2 text-center font-mono text-xs font-semibold tabular-nums transition-colors"
                    style={{
                      backgroundColor: getHeatmapColor(value),
                    }}
                  >
                    <span className={cn(getTextColor(value))}>{value}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
