"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Download, FileJson, FileSpreadsheet } from "lucide-react"
import type { DashboardConfig } from "@/components/dashboard-controls"
import type { HeatmapMetrics } from "@/lib/massive-api"

interface ExportMenuProps {
  data: {
    dates: string[]
    data: Record<string, HeatmapMetrics[]>
    rawBars?: Record<string, any[]>
  } | null
  config: DashboardConfig
}

// Metric display names for CSV headers
const METRIC_LABELS: Record<string, string> = {
  pctFromHigh: "% From High",
  daysSinceHigh: "Days Since High",
  pctFromLow: "% From Low",
  daysSinceLow: "Days Since Low",
}

export function ExportMenu({ data, config }: ExportMenuProps) {
  const exportToCSV = () => {
    if (!data) return

    const symbols = Object.keys(data.data)
    const metric = config.metric

    // Header row with selected metric name
    const metricLabel = METRIC_LABELS[metric] || metric
    const headers = ["Date", ...symbols.map((s) => `${s} (${metricLabel})`)]

    // Data rows - extract selected metric from HeatmapMetrics objects
    const rows = data.dates.map((date, index) => {
      return [
        date,
        ...symbols.map((symbol) => {
          const metrics = data.data[symbol]?.[index]
          if (!metrics) return ""

          const value = metrics[metric as keyof HeatmapMetrics]
          // Format percentages to 2 decimal places
          if (typeof value === "number") {
            return metric.includes("pct") ? value.toFixed(2) : value.toString()
          }
          return ""
        }),
      ]
    })

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `tucson-trader-${metric}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportFullCSV = () => {
    if (!data) return

    const symbols = Object.keys(data.data)

    // Header row with all metrics for each symbol
    const metricKeys = ["daysSinceHigh", "pctFromHigh", "daysSinceLow", "pctFromLow"] as const
    const headers = [
      "Date",
      ...symbols.flatMap((s) => metricKeys.map((m) => `${s}_${m}`)),
    ]

    // Data rows - all metrics
    const rows = data.dates.map((date, index) => {
      return [
        date,
        ...symbols.flatMap((symbol) => {
          const metrics = data.data[symbol]?.[index]
          if (!metrics) return metricKeys.map(() => "")

          return metricKeys.map((m) => {
            const value = metrics[m]
            if (typeof value === "number") {
              return m.includes("pct") ? value.toFixed(2) : value.toString()
            }
            return ""
          })
        }),
      ]
    })

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `tucson-trader-full-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportToJSON = () => {
    if (!data) return

    const exportData = {
      config,
      results: data,
      exportedAt: new Date().toISOString(),
    }

    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `tucson-trader-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={!data}>
          <Download className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportToCSV}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export CSV ({METRIC_LABELS[config.metric] || config.metric})
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportFullCSV}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export Full CSV (All Metrics)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToJSON}>
          <FileJson className="h-4 w-4 mr-2" />
          Export JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
