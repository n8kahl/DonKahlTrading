"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RefreshCw } from "lucide-react"

export interface DashboardConfig {
  symbols: string
  lookback: number
  basis: "high" | "close"
  days: number
}

interface DashboardControlsProps {
  config: DashboardConfig
  onConfigChange: (config: DashboardConfig) => void
  onRefresh: () => void
  lastUpdated?: Date
  disabled?: boolean
}

export function DashboardControls({
  config,
  onConfigChange,
  onRefresh,
  lastUpdated,
  disabled,
}: DashboardControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 p-4 border-b border-border">
      <div className="flex flex-col gap-2 min-w-[200px]">
        <Label htmlFor="symbols" className="text-xs text-muted-foreground">
          Universe
        </Label>
        <Input
          id="symbols"
          value={config.symbols}
          onChange={(e) => onConfigChange({ ...config, symbols: e.target.value })}
          placeholder="DJI,SPX,IXIC,NDX,RUT,SOX"
          disabled={disabled}
          className="h-9 text-sm font-mono"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lookback" className="text-xs text-muted-foreground">
          Lookback
        </Label>
        <Select
          value={config.lookback.toString()}
          onValueChange={(value) => onConfigChange({ ...config, lookback: Number.parseInt(value) })}
          disabled={disabled}
        >
          <SelectTrigger id="lookback" className="h-9 w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="21">21</SelectItem>
            <SelectItem value="63">63</SelectItem>
            <SelectItem value="126">126</SelectItem>
            <SelectItem value="252">252</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="basis" className="text-xs text-muted-foreground">
          Basis
        </Label>
        <Select
          value={config.basis}
          onValueChange={(value: "high" | "close") => onConfigChange({ ...config, basis: value })}
          disabled={disabled}
        >
          <SelectTrigger id="basis" className="h-9 w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="close">Close</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="days" className="text-xs text-muted-foreground">
          Date Range
        </Label>
        <Select
          value={config.days.toString()}
          onValueChange={(value) => onConfigChange({ ...config, days: Number.parseInt(value) })}
          disabled={disabled}
        >
          <SelectTrigger id="days" className="h-9 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="63">Last 63 days</SelectItem>
            <SelectItem value="126">Last 126 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={onRefresh} size="sm" variant="outline" disabled={disabled} className="h-9 bg-transparent">
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>

      {lastUpdated && (
        <div className="ml-auto text-xs text-muted-foreground">Last updated: {lastUpdated.toLocaleTimeString()}</div>
      )}
    </div>
  )
}
