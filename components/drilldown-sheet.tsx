"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DailyBar } from "@/lib/massive-api"

interface DrilldownSheetProps {
  symbol: string
  date: string
  bars: DailyBar[]
  lookback: number
  onClose: () => void
}

export function DrilldownSheet({ symbol, date, bars, lookback, onClose }: DrilldownSheetProps) {
  // Find events where new highs/lows occurred
  const events = []
  for (let i = Math.max(0, bars.length - 10); i < bars.length; i++) {
    const bar = bars[i]
    const startIdx = Math.max(0, i - lookback + 1)
    const window = bars.slice(startIdx, i + 1)
    const rollingHigh = Math.max(...window.map((b) => b.high))
    const rollingLow = Math.min(...window.map((b) => b.low))

    if (bar.high >= rollingHigh) {
      events.push({ date: bar.date, type: "High", value: bar.high })
    }
    if (bar.low <= rollingLow) {
      events.push({ date: bar.date, type: "Low", value: bar.low })
    }
  }

  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{symbol} Drilldown</SheetTitle>
          <p className="text-sm text-muted-foreground">Selected date: {date}</p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent {lookback}d Extremes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Date</th>
                        <th className="text-left py-2">Type</th>
                        <th className="text-right py-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2 font-mono text-xs">{event.date}</td>
                          <td className="py-2">
                            <span
                              className={
                                event.type === "High" ? "text-green-500 font-semibold" : "text-red-500 font-semibold"
                              }
                            >
                              New {event.type}
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums">{event.value.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">No extreme events in recent data</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Price Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm font-mono">
                {bars
                  .slice(-5)
                  .reverse()
                  .map((bar, index) => (
                    <div
                      key={index}
                      className={`flex justify-between py-2 px-2 rounded ${bar.date === date ? "bg-primary/10" : ""}`}
                    >
                      <span className="text-muted-foreground">{bar.date}</span>
                      <span className="tabular-nums">
                        O: {bar.open.toFixed(2)} H: {bar.high.toFixed(2)} L: {bar.low.toFixed(2)} C:{" "}
                        {bar.close.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
