"use client"

import { useState, useEffect, useCallback } from "react"
import type { DashboardConfig } from "@/components/dashboard-controls"

interface HeatmapData {
  dates: string[]
  data: Record<string, number[]>
  isMock?: boolean
  error?: string
}

export function useHeatmapData(config: DashboardConfig) {
  const [data, setData] = useState<HeatmapData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        symbols: config.symbols,
        lookback: config.lookback.toString(),
        basis: config.basis,
        days: config.days.toString(),
      })

      const response = await fetch(`/api/heatmap?${params}`)

      if (!response.ok) {
        throw new Error("Failed to fetch heatmap data")
      }

      const result = await response.json()
      setData(result)
      setLastUpdated(new Date())

      if (result.isMock) {
        setError(result.error || "Using mock data")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [config])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, isLoading, error, lastUpdated, refetch: fetchData }
}
