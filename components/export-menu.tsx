"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Download, FileJson, FileSpreadsheet } from "lucide-react"
import type { DashboardConfig } from "@/components/dashboard-controls"

interface ExportMenuProps {
  data: {
    dates: string[]
    data: Record<string, number[]>
  } | null
  config: DashboardConfig
}

export function ExportMenu({ data, config }: ExportMenuProps) {
  const exportToCSV = () => {
    if (!data) return

    const symbols = Object.keys(data.data)
    const headers = ["Date", ...symbols]
    const rows = data.dates.map((date, index) => {
      return [date, ...symbols.map((symbol) => data.data[symbol]?.[index] ?? "")]
    })

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `heatmap-${new Date().toISOString().split("T")[0]}.csv`
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
    a.download = `heatmap-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={!data}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportToCSV}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToJSON}>
          <FileJson className="h-4 w-4 mr-2" />
          Export JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
