"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { AlertCircle, Share2, TrendingUp, Activity, Zap, Loader2 } from "lucide-react"
import { ExportMenu } from "@/components/export-menu"
import { EnhancedControls, type EnhancedDashboardConfig } from "@/components/enhanced-controls"
import { SummaryTiles } from "@/components/summary-tiles"
import { EnhancedHeatmapTable } from "@/components/enhanced-heatmap-table"
import { MarketExtremesTable } from "@/components/market-extremes-table"
import { AICompanion } from "@/components/ai-companion"

// Animation variants for smooth filter transitions
const fadeSlide = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

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

  const { data, error, isLoading, isValidating, mutate } = useSWR(`/api/extremes?${params}`, fetcher, {
    refreshInterval: 300000, // 5 minutes
    keepPreviousData: true, // Keep showing old data while fetching new
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
                  <span className="hidden xs:inline">Market Analysis</span>
                  <span className="text-green-600 dark:text-green-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    Live
                  </span>
                </div>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-sm bg-muted text-xs text-muted-foreground">
                <Zap className="w-3 h-3 text-primary" />
                <span>Updated {new Date().toLocaleTimeString()}</span>
              </div>
              <ExportMenu data={data} config={config} />
              <Button
                onClick={handleShare}
                disabled={isSharing || !data}
                size="sm"
                variant="outline"
              >
                <Share2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 py-4 space-y-4">
        {/* Initial loading - only show skeleton on first load */}
        {isLoading && !data ? (
          <LoadingSkeleton />
        ) : error && !data ? (
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error?.message || "Failed to load data"}</AlertDescription>
          </Alert>
        ) : data ? (
          <div className="relative">
            {/* Overlay spinner for subsequent fetches */}
            <AnimatePresence>
              {isValidating && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-20 flex items-start justify-center pt-20 bg-background/60 backdrop-blur-[1px]"
                >
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Updating...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Summary Tiles */}
            {data.data && Object.keys(data.data).length > 0 && (
              <motion.div
                layout
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <SummaryTiles data={data.data} lookback={config.lookback} />
              </motion.div>
            )}

            {/* Market Extremes Table - Trading Desk View */}
            {data.rawBars && Object.keys(data.rawBars).length > 0 && (
              <motion.div
                layout
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mt-4"
              >
                <Card className="border-border overflow-hidden">
                  <CardHeader className="py-3 px-4 border-b border-border">
                    <CardTitle className="text-base font-semibold">
                      Market Extremes
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Days since {config.lookback}-day rolling high by price basis
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <MarketExtremesTable
                      rawBars={data.rawBars}
                      lookback={config.lookback}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Main Heatmap Card */}
            <motion.div
              layout
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mt-4"
            >
              <Card className="border-border overflow-hidden">
                <CardHeader className="pb-0 border-b border-border px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg sm:text-xl font-semibold">
                        Heatmap Analysis
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs sm:text-sm">
                        Tracking {config.lookback}-day rolling extremes with {config.basis} basis
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="border-b border-border">
                    <EnhancedControls
                      config={config}
                      onConfigChange={setConfig}
                      onRefresh={() => mutate()}
                      lastUpdated={lastUpdated}
                      disabled={isValidating}
                    />
                  </div>

                  {data.dates && data.data && (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${config.metric}-${config.basis}`}
                        variants={fadeSlide}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="p-3 overflow-x-auto"
                      >
                        <EnhancedHeatmapTable
                          dates={data.dates}
                          data={data.data}
                          rawBars={data.rawBars}
                          lookback={config.lookback}
                          metric={config.metric}
                          sortBy={config.sortBy}
                        />
                      </motion.div>
                    </AnimatePresence>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Footer Attribution */}
            <div className="text-center py-3 text-xs text-muted-foreground">
              <p>Tucson Trader</p>
            </div>
          </div>
        ) : null}
      </main>

      {/* AI Companion Chat Widget */}
      <AICompanion />
    </div>
  )
}
