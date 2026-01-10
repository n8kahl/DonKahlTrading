"use client"

import { useEffect, useState, use } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { HeatmapTable } from "@/components/heatmap-table"
import { DashboardControls, type DashboardConfig } from "@/components/dashboard-controls"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { AlertCircle, Copy } from "lucide-react"
import { ExportMenu } from "@/components/export-menu"

interface SharedDashboard {
  id: string
  createdAt: string
  config: DashboardConfig
  results: {
    dates: string[]
    data: Record<string, number[]>
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
      <div className="min-h-screen bg-background p-4 md:p-8 dark">
        <div className="max-w-[1600px] mx-auto">
          <LoadingSkeleton />
        </div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 dark">
        <div className="max-w-[1600px] mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || "Dashboard not found"}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tucson Trader - Shared Dashboard</h1>
          <p className="text-sm text-muted-foreground">Created on {new Date(dashboard.createdAt).toLocaleDateString()}</p>
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-0 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg sm:text-xl">Heatmap Analysis (Read-only)</CardTitle>
                <CardDescription className="text-sm">
                  Shows days since {dashboard.config.lookback}-trading-day {dashboard.config.basis} for each index
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <ExportMenu data={dashboard.results} config={dashboard.config} />
                <Button onClick={copyLink} size="sm" variant="outline">
                  <Copy className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Copy Link</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DashboardControls config={dashboard.config} onConfigChange={() => {}} onRefresh={() => {}} disabled />

            <div className="p-3 sm:p-4 overflow-x-auto">
              <HeatmapTable
                dates={dashboard.results.dates}
                data={dashboard.results.data}
                lookback={dashboard.config.lookback}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
