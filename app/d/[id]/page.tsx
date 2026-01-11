"use client"

import { useEffect, useState, use } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { AlertCircle, Copy, TrendingUp, Activity } from "lucide-react"
import { ExportMenu } from "@/components/export-menu"
import { EnhancedHeatmapTable } from "@/components/enhanced-heatmap-table"
import { MarketExtremesTable } from "@/components/market-extremes-table"
import { SummaryTiles } from "@/components/summary-tiles"
import { EnhancedControls, type EnhancedDashboardConfig } from "@/components/enhanced-controls"
import type { HeatmapMetrics } from "@/lib/massive-api"

interface SharedDashboard {
  id: string
  createdAt: string
  config: EnhancedDashboardConfig
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logo and Branding */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-9 h-9 rounded bg-primary">
                <TrendingUp className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground truncate">
                  Tucson Trader
                </h1>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <Activity className="w-3 h-3 flex-shrink-0" />
                  <span className="hidden xs:inline">Shared Dashboard</span>
                  <span className="text-amber-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    Read-only
                  </span>
                </div>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-sm bg-muted text-xs text-muted-foreground">
                <span>Created {new Date(dashboard.createdAt).toLocaleDateString()}</span>
              </div>
              <ExportMenu data={dashboard.results} config={dashboard.config} />
              <Button onClick={copyLink} size="sm" variant="outline">
                <Copy className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Copy Link</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 py-4 space-y-4">
        {/* Summary Tiles */}
        {dashboard.results.data && Object.keys(dashboard.results.data).length > 0 && (
          <SummaryTiles data={dashboard.results.data} lookback={dashboard.config.lookback} />
        )}

        {/* Market Extremes Table */}
        {dashboard.results.rawBars && Object.keys(dashboard.results.rawBars).length > 0 && (
          <Card className="border-border overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-base font-semibold">
                Market Extremes
              </CardTitle>
              <CardDescription className="text-xs">
                Days since {dashboard.config.lookback}-day rolling high by price basis
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <MarketExtremesTable
                rawBars={dashboard.results.rawBars}
                lookback={dashboard.config.lookback}
              />
            </CardContent>
          </Card>
        )}

        {/* Main Heatmap Card */}
        <Card className="border-border overflow-hidden">
          <CardHeader className="pb-0 border-b border-border px-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg sm:text-xl font-semibold">
                  Heatmap Analysis (Read-only)
                </CardTitle>
                <CardDescription className="mt-1 text-xs sm:text-sm">
                  Tracking {dashboard.config.lookback}-day rolling extremes with {dashboard.config.basis} basis
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Read-only controls */}
            <div className="border-b border-border">
              <EnhancedControls
                config={dashboard.config}
                onConfigChange={() => {}}
                onRefresh={() => {}}
                disabled
              />
            </div>

            {dashboard.results.dates && dashboard.results.data && (
              <div className="p-3 overflow-x-auto">
                <EnhancedHeatmapTable
                  dates={dashboard.results.dates}
                  data={dashboard.results.data}
                  rawBars={dashboard.results.rawBars || {}}
                  lookback={dashboard.config.lookback}
                  metric={dashboard.config.metric}
                  sortBy={dashboard.config.sortBy}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-3 text-xs text-muted-foreground">
          <p>Tucson Trader - Shared Dashboard</p>
        </div>
      </main>
    </div>
  )
}
