"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { AlertCircle, Share2, TrendingUp, Activity, Zap } from "lucide-react"
import { ExportMenu } from "@/components/export-menu"
import { EnhancedControls, type EnhancedDashboardConfig } from "@/components/enhanced-controls"
import { SummaryTiles } from "@/components/summary-tiles"
import { EnhancedHeatmapTable } from "@/components/enhanced-heatmap-table"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function DashboardPage() {
  const [config, setConfig] = useState<EnhancedDashboardConfig>({
    universe: "core",
    symbols: "DJI,SPX,IXIC,NDX,RUT,SOX",
    lookback: 63,
    metric: "pctFromHigh",
    basis: "close",
    days: 30,
    sortBy: "none",
  })

  const params = new URLSearchParams({
    symbols: config.symbols,
    lookback: config.lookback.toString(),
    basis: config.basis,
    days: config.days.toString(),
  })

  const { data, error, isLoading, mutate } = useSWR(`/api/extremes?${params}`, fetcher, {
    refreshInterval: 300000, // 5 minutes
  })

  const [isSharing, setIsSharing] = useState(false)

  const handleShare = async () => {
    if (!data) return

    setIsSharing(true)
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, results: data }),
      })

      if (!response.ok) throw new Error("Failed to create share link")

      const { id } = await response.json()
      const shareUrl = `${window.location.origin}/d/${id}`

      await navigator.clipboard.writeText(shareUrl)
      alert(`Share link copied to clipboard:\n${shareUrl}`)
    } catch (err) {
      alert("Failed to create share link")
    } finally {
      setIsSharing(false)
    }
  }

  const lastUpdated = data ? new Date() : undefined

  return (
    <div className="min-h-screen bg-background">
      {/* Arizona Sunset Gradient Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.14_0.04_35)] via-[oklch(0.12_0.02_50)] to-[oklch(0.10_0.03_280)]" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[oklch(0.55_0.18_45)] opacity-[0.03] blur-[100px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[oklch(0.60_0.14_195)] opacity-[0.03] blur-[80px] rounded-full" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 glass">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Branding */}
            <div className="flex items-center gap-4">
              {/* Arizona-inspired logo mark */}
              <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--arizona-copper)] to-[var(--arizona-terracotta)] glow-copper">
                <TrendingUp className="w-6 h-6 text-white" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full pulse-live border-2 border-background" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gradient-copper">
                  Don Kahl's Trading
                </h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  <span>Market Analysis Dashboard</span>
                  <span className="text-border">•</span>
                  <span className="text-green-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    Live
                  </span>
                </div>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <Zap className="w-3 h-3 text-[var(--arizona-copper)]" />
                <span>Updated {new Date().toLocaleTimeString()}</span>
              </div>
              <ExportMenu data={data} config={config} />
              <Button
                onClick={handleShare}
                disabled={isSharing || !data}
                size="sm"
                variant="outline"
                className="border-border/50 hover:border-[var(--arizona-copper)] hover:text-[var(--arizona-copper)] transition-colors"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto p-6 space-y-6">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error || !data ? (
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error?.message || "Failed to load data"}</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Summary Tiles */}
            {data.data && Object.keys(data.data).length > 0 && (
              <SummaryTiles data={data.data} lookback={config.lookback} />
            )}

            {/* Main Heatmap Card */}
            <Card className="card-premium border-border/50 overflow-hidden">
              <CardHeader className="pb-0 border-b border-border/30">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-semibold flex items-center gap-2">
                      <span className="text-gradient-turquoise">Heatmap Analysis</span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Tracking {config.lookback}-day rolling extremes with {config.basis} basis
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-b border-border/30">
                  <EnhancedControls
                    config={config}
                    onConfigChange={setConfig}
                    onRefresh={() => mutate()}
                    lastUpdated={lastUpdated}
                    disabled={isLoading}
                  />
                </div>

                {data.dates && data.data && (
                  <div className="p-4">
                    <EnhancedHeatmapTable
                      dates={data.dates}
                      data={data.data}
                      rawBars={data.rawBars}
                      lookback={config.lookback}
                      metric={config.metric}
                      sortBy={config.sortBy}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Footer Attribution */}
            <div className="text-center py-4 text-sm text-muted-foreground">
              <p>Don Kahl's Trading • Arizona Edition 🌵</p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
