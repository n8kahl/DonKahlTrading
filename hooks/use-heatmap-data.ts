"use client"

import { useState, useEffect, useCallback } from "react"
import type { DashboardConfig } from "@/components/dashboard-controls"

interface HeatmapData {
  dates: string[]
  data: Record<string, number[]>
  warnings?: {
    failedSymbols?: string[]
  }
}

export function useHeatmapData(config: DashboardConfig) {
  const [data, setData] = useState<HeatmapData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setWarning(null)

    try {
      const params = new URLSearchParams({
        symbols: config.symbols,
        lookback: config.lookback.toString(),
        basis: config.basis,
        days: config.days.toString(),
      })

      const response = await fetch(`/api/heatmap?${params}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch market data")
      }

      setData(result)
      setLastUpdated(new Date())

      // Handle partial failures (some symbols failed)
      if (result.warnings?.failedSymbols?.length > 0) {
        setWarning(`Data unavailable for: ${result.warnings.failedSymbols.join(', ')}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch market data")
    } finally {
      setIsLoading(false)
    }
  }, [config])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, isLoading, error, warning, lastUpdated, refetch: fetchData }
}
