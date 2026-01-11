"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { RefreshCw, Info, Settings2 } from "lucide-react"

export interface EnhancedDashboardConfig {
  universe: "core" | "custom"
  symbols: string
  lookback: number
  metric: "pctFromHigh" | "daysSinceHigh" | "pctFromLow" | "daysSinceLow"
  basis: "close" | "intraday"
  days: number
  sortBy: string
}

interface EnhancedControlsProps {
  config: EnhancedDashboardConfig
  onConfigChange: (config: EnhancedDashboardConfig) => void
  onRefresh: () => void
  lastUpdated?: Date
  disabled?: boolean
}

const CORE_INDICES = "DJI,SPX,IXIC,NDX,RUT,SOX"
const DEBOUNCE_MS = 800

export function EnhancedControls({ config, onConfigChange, onRefresh, lastUpdated, disabled }: EnhancedControlsProps) {
  // Local state for symbols input with debouncing
  const [localSymbols, setLocalSymbols] = useState(config.symbols)

  // Sync local state when config.symbols changes externally (e.g., switching to core)
  useEffect(() => {
    setLocalSymbols(config.symbols)
  }, [config.symbols])

  // Debounced update to parent
  useEffect(() => {
    // Don't debounce if we're in core mode or if symbols match
    if (config.universe === "core" || localSymbols === config.symbols) {
      return
    }

    const timer = setTimeout(() => {
      onConfigChange({ ...config, symbols: localSymbols })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [localSymbols, config, onConfigChange])

  // Handle Enter key to apply immediately
  const handleSymbolsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onConfigChange({ ...config, symbols: localSymbols })
    }
  }

  const metricLabels = {
    pctFromHigh: "% From High",
    daysSinceHigh: "Days Since High",
    pctFromLow: "% From Low",
    daysSinceLow: "Days Since Low",
  }

  return (
    <div className="space-y-3 p-3 bg-muted">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Settings2 className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 className="text-sm font-semibold truncate">Analysis Controls</h3>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden md:block">
              Last refresh: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
              >
                <Info className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Understanding Market Extremes</DialogTitle>
                <DialogDescription className="space-y-3 pt-3">
                  <p className="text-foreground/80">
                    This dashboard tracks how far market indices are from their rolling highs and lows,
                    helping identify potential opportunities and market conditions.
                  </p>
                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">Metrics:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><span className="text-primary">Days Since High/Low:</span> Trading days since the rolling extreme</li>
                      <li><span className="text-primary">% From High/Low:</span> Percentage distance from the rolling extreme</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">Basis:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><span className="text-primary">Confirmed:</span> Uses closing prices</li>
                      <li><span className="text-primary">Intraday:</span> Uses high/low prices within the day</li>
                    </ul>
                  </div>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
          <Button
            onClick={onRefresh}
            size="sm"
            disabled={disabled}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${disabled ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 sm:gap-3">
        {/* Universe Selection */}
        <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground font-medium">Universe</Label>
          <Tabs
            value={config.universe}
            onValueChange={(value) =>
              onConfigChange({
                ...config,
                universe: value as "core" | "custom",
                symbols: value === "core" ? CORE_INDICES : config.symbols,
              })
            }
          >
            <TabsList className="h-8 w-full sm:w-auto">
              <TabsTrigger value="core" className="text-xs flex-1 sm:flex-none px-3">
                Core Indices
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-xs flex-1 sm:flex-none px-3">
                Custom
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Custom Symbols Input */}
        {config.universe === "custom" && (
          <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1 sm:min-w-[200px]">
            <Label htmlFor="symbols" className="text-xs text-muted-foreground font-medium">
              Symbols
            </Label>
            <Input
              id="symbols"
              value={localSymbols}
              onChange={(e) => setLocalSymbols(e.target.value.toUpperCase())}
              onKeyDown={handleSymbolsKeyDown}
              placeholder="AAPL,MSFT,GOOGL"
              disabled={disabled}
              className="h-8 text-sm font-mono"
            />
          </div>
        )}

        {/* Metric Selection */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground font-medium">Metric</Label>
          <Select
            value={config.metric}
            onValueChange={(value: any) => onConfigChange({ ...config, metric: value })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-full sm:min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(metricLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lookback Period */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground font-medium">Lookback</Label>
          <Select
            value={config.lookback.toString()}
            onValueChange={(value) => onConfigChange({ ...config, lookback: Number.parseInt(value) })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-full sm:min-w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="21">21 days</SelectItem>
              <SelectItem value="63">63 days</SelectItem>
              <SelectItem value="126">126 days</SelectItem>
              <SelectItem value="252">252 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Basis Selection */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground font-medium">Basis</Label>
          <Select
            value={config.basis}
            onValueChange={(value: any) => onConfigChange({ ...config, basis: value })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-full sm:min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="close">Confirmed (Close)</SelectItem>
              <SelectItem value="intraday">Intraday (H/L)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground font-medium">Date Range</Label>
          <Select
            value={config.days.toString()}
            onValueChange={(value) => onConfigChange({ ...config, days: Number.parseInt(value) })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-full sm:min-w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="63">63 days</SelectItem>
              <SelectItem value="126">126 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground font-medium">Sort By</Label>
          <Select
            value={config.sortBy}
            onValueChange={(value) => onConfigChange({ ...config, sortBy: value })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-full sm:min-w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Default Order</SelectItem>
              <SelectItem value="closestToExtreme">Closest to Extreme</SelectItem>
              <SelectItem value="mostDays">Most Days Away</SelectItem>
              <SelectItem value="freshBreakouts">Fresh Breakouts</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
