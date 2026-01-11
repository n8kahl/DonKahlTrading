"use client"

import { useEffect, useState, use } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { AlertCircle, Copy, TrendingUp, Activity, Calendar } from "lucide-react"
import { ExportMenu } from "@/components/export-menu"
import { EnhancedHeatmapTable } from "@/components/enhanced-heatmap-table"
import { StatsBar } from "@/components/stats-bar"
import { HeatLegend } from "@/components/heat-legend"
import type { DashboardConfig } from "@/components/dashboard-controls"
import type { HeatmapMetrics } from "@/lib/massive-api"
import { ThemeToggle } from "@/components/theme-toggle"

interface SharedDashboard {
  id: string
  createdAt: string
  config: DashboardConfig
  results: {
    dates: string[]
    data: Record<string, HeatmapMetrics[]>
    rawBars?: Record<string, any[]>
  }
}

export default function SharedDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [dashboard, setDashboard] = useState<SharedDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch(`/api/dashboard/${id}`)

        if (!response.ok) {
          throw new Error("Dashboard not found")
        }

        const data = await response.json()
        setDashboard(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard")
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboard()
  }, [id])

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    alert("Link copied to clipboard!")
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-[1800px] mx-auto px-4 py-4">
          <LoadingSkeleton />
        </div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-[1800px] mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || "Dashboard not found"}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  const legendType = dashboard.config.metric.includes("High") ? "high" : "low"
  const dataDateRange = dashboard.results.dates?.length
    ? { from: dashboard.results.dates[0], to: dashboard.results.dates[dashboard.results.dates.length - 1] }
    : null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="max-w-[1800px] mx-auto px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded bg-primary">
                <TrendingUp className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  Tucson Trader
                </h1>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  <span className="text-amber-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    Shared View
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <ExportMenu data={dashboard.results} config={dashboard.config} />
              <Button onClick={copyLink} size="sm" variant="outline" className="h-8">
                <Copy className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline text-xs">Copy Link</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Info Bar */}
      <div className="border-b border-border bg-muted/50 px-4 py-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          <span>Created {new Date(dashboard.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span>Lookback: <span className="font-mono">{dashboard.config.lookback}d</span></span>
        <span>Basis: <span className="capitalize">{dashboard.config.basis}</span></span>
        {dataDateRange && (
          <>
            <div className="h-4 w-px bg-border" />
            <span className="font-mono">{dataDateRange.from} → {dataDateRange.to}</span>
          </>
        )}
      </div>

      {/* Stats Bar */}
      {dashboard.results.data && Object.keys(dashboard.results.data).length > 0 && (
        <div className="border-b border-border bg-muted/30">
          <StatsBar data={dashboard.results.data} lookback={dashboard.config.lookback} />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto p-4">
        {dashboard.results.dates && dashboard.results.data && (
          <>
            <div className="border border-border rounded-md overflow-hidden">
              <EnhancedHeatmapTable
                dates={dashboard.results.dates}
                data={dashboard.results.data}
                basisHigh={dashboard.results.basisHigh}
                basisClose={dashboard.results.basisClose}
                rawBars={dashboard.results.rawBars || {}}
                lookback={dashboard.config.lookback}
                metric={dashboard.config.metric}
                sortBy={dashboard.config.sortBy}
                currentBasis={dashboard.config.basis}
                sanity={dashboard.results.sanity}
              />
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center justify-between">
              <HeatLegend metricType={legendType} compact />
              <span className="text-xs text-muted-foreground">
                Click any cell for details
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
