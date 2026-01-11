"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import Image from "next/image"
import { AlertCircle, Share2, Activity, Loader2 } from "lucide-react"
import { ExportMenu } from "@/components/export-menu"
import { DashboardControls, type DashboardConfig } from "@/components/dashboard-controls"
import { StatsBar } from "@/components/stats-bar"
import { MarketExtremesPanel } from "@/components/market-extremes-panel"
import { EnhancedHeatmapTable } from "@/components/enhanced-heatmap-table"
import { AICompanion } from "@/components/ai-companion"
import { ThemeToggle } from "@/components/theme-toggle"
// Trader Layer components
import { TraderSummaryBar } from "@/components/trader-summary-bar"
import { RejectionDetector } from "@/components/rejection-detector"
import { DivergenceSpotlight } from "@/components/divergence-spotlight"
import { SymbolDrillSheet } from "@/components/symbol-drill-sheet"
import type { HeatmapMetrics, DailyBar } from "@/lib/massive-api"

// Animation variants for smooth transitions
const fadeSlide = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function DashboardPage() {
  const [config, setConfig] = useState<DashboardConfig>({
    universe: "core",
    symbols: "DJI,SPX,IXIC,NDX,RUT,SOX",
    lookback: 63,
    metric: "daysSinceHigh",
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
  const [mounted, setMounted] = useState(false)

  // Drill sheet state
  const [drillSymbol, setDrillSymbol] = useState<string | null>(null)
  const [drillSheetOpen, setDrillSheetOpen] = useState(false)

  // Avoid hydration mismatch for timestamps
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleShare = async () => {
    if (!data) return

    setIsSharing(true)
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, results: data }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create share link")
      }

      const shareUrl = `${window.location.origin}/d/${result.id}`

      await navigator.clipboard.writeText(shareUrl)
      alert(`Share link copied to clipboard:\n${shareUrl}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create share link"
      alert(message)
    } finally {
      setIsSharing(false)
    }
  }

  // Drill-down handlers
  const handleViewChart = useCallback((symbol: string) => {
    setDrillSymbol(symbol)
    setDrillSheetOpen(true)
  }, [])

  const handlePin = useCallback(async (symbol: string) => {
    try {
      const response = await fetch('/api/pinned-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'symbol_watch',
          title: `Watch: ${symbol}`,
          config: { symbol, lookback: config.lookback, basis: config.basis },
        }),
      })

      if (response.ok) {
        // Success feedback could be shown via a toast
        console.log(`Pinned ${symbol} to dashboard`)
      } else {
        console.error('Failed to pin symbol')
      }
    } catch (err) {
      console.error('Error pinning symbol:', err)
    }
  }, [config.lookback, config.basis])

  // Compute date range from data
  const dataDateRange = data?.dates?.length
    ? { from: data.dates[0], to: data.dates[data.dates.length - 1] }
    : undefined

  // Get drill sheet data
  const drillSheetData = drillSymbol && data ? {
    bars: data.rawBars?.[drillSymbol] || [],
    metricsHigh: data.basisHigh?.[drillSymbol]?.[data.dates.length - 1],
    metricsClose: data.basisClose?.[drillSymbol]?.[data.dates.length - 1],
  } : null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Compact Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="max-w-[1800px] mx-auto px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Image
                src="/tucson-trader-logo-small.png"
                alt="Tucson Trader"
                width={48}
                height={48}
                className="rounded-lg"
                priority
              />
              <div>
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  Tucson Trader
                </h1>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  <span className="text-green-600 dark:text-green-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    Live
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <ExportMenu data={data} config={config} />
              <Button
                onClick={handleShare}
                disabled={isSharing || !data}
                size="sm"
                variant="outline"
                className="h-10 sm:h-8 px-3"
              >
                <Share2 className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline text-xs">Share</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Controls - Always visible at top */}
      <DashboardControls
        config={config}
        onConfigChange={setConfig}
        onRefresh={() => mutate()}
        disabled={isValidating}
        dataDateRange={dataDateRange}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto">
        {isLoading && !data ? (
          <div className="p-4">
            <LoadingSkeleton />
          </div>
        ) : error && !data ? (
          <div className="p-4">
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error?.message || "Failed to load data"}</AlertDescription>
            </Alert>
          </div>
        ) : data ? (
          <div className="relative">
            {/* Loading overlay - non-blocking */}
            <AnimatePresence>
              {isValidating && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-4 right-4 z-20"
                >
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Updating...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Trader Summary Bar - Always visible above heatmaps */}
            {data.basisHigh && data.basisClose && data.dates && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="px-4 pt-4"
              >
                <TraderSummaryBar
                  basisHigh={data.basisHigh}
                  basisClose={data.basisClose}
                  dates={data.dates}
                  lookback={config.lookback}
                  marketOpen={data.meta?.marketStatus === 'open'}
                  lastUpdated={data.meta?.lastUpdated}
                />
              </motion.div>
            )}

            {/* Rejection Detector + Divergence Spotlight Grid */}
            {data.basisHigh && data.basisClose && data.dates && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="px-4 pt-4"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <RejectionDetector
                    basisHigh={data.basisHigh}
                    basisClose={data.basisClose}
                    dates={data.dates}
                    rawBars={data.rawBars}
                    onViewChart={handleViewChart}
                    onPin={handlePin}
                  />
                  <DivergenceSpotlight
                    basisClose={data.basisClose}
                    dates={data.dates}
                    onViewChart={handleViewChart}
                    onPin={handlePin}
                  />
                </div>
              </motion.div>
            )}

            {/* Stats Bar */}
            {data.data && Object.keys(data.data).length > 0 && (
              <div className="mt-4 border-y border-border bg-muted/30">
                <StatsBar data={data.data} lookback={config.lookback} />
              </div>
            )}

            {/* Market Extremes Panel - Shows High vs Close basis comparison */}
            <div className="p-4 pb-0">
              <MarketExtremesPanel
                symbols={config.symbols}
                lookback={config.lookback}
                days={20}
              />
            </div>

            {/* Heatmap Table */}
            {data.dates && data.data && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${config.metric}-${config.basis}`}
                  variants={fadeSlide}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="p-4"
                >
                  <div className="border border-border rounded-md overflow-hidden">
                    <EnhancedHeatmapTable
                      dates={data.dates}
                      data={data.data}
                      basisHigh={data.basisHigh}
                      basisClose={data.basisClose}
                      rawBars={data.rawBars}
                      lookback={config.lookback}
                      metric={config.metric}
                      sortBy={config.sortBy}
                      currentBasis={config.basis}
                      sanity={data.sanity}
                    />
                  </div>

                  {/* Hint */}
                  <div className="mt-2 text-center">
                    <span className="text-xs text-muted-foreground">
                      Click any cell for detailed breakdown
                    </span>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        ) : null}
      </main>

      {/* AI Companion */}
      <AICompanion />

      {/* Symbol Drill Sheet */}
      {drillSymbol && drillSheetData && (
        <SymbolDrillSheet
          open={drillSheetOpen}
          onOpenChange={setDrillSheetOpen}
          symbol={drillSymbol}
          bars={drillSheetData.bars}
          metricsHigh={drillSheetData.metricsHigh}
          metricsClose={drillSheetData.metricsClose}
          lookback={config.lookback}
          onPin={handlePin}
        />
      )}
    </div>
  )
}
