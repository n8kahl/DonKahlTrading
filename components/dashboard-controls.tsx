"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { RefreshCw, Calendar, TrendingUp, TrendingDown, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DashboardConfig {
  universe: "core" | "custom"
  symbols: string
  lookback: number
  metric: "pctFromHigh" | "daysSinceHigh" | "pctFromLow" | "daysSinceLow"
  basis: "close" | "intraday"
  days: number
  sortBy: string
}

interface DashboardControlsProps {
  config: DashboardConfig
  onConfigChange: (config: DashboardConfig) => void
  onRefresh: () => void
  disabled?: boolean
  dataDateRange?: { from: string; to: string }
}

const CORE_INDICES = "DJI,SPX,IXIC,NDX,RUT,SOX"
const DEBOUNCE_MS = 800

const LOOKBACK_PRESETS = [
  { value: 21, label: "21d", fullLabel: "1 Month" },
  { value: 63, label: "63d", fullLabel: "1 Quarter" },
  { value: 126, label: "126d", fullLabel: "6 Months" },
  { value: 252, label: "252d", fullLabel: "1 Year" },
]

export function DashboardControls({
  config,
  onConfigChange,
  onRefresh,
  disabled,
  dataDateRange,
}: DashboardControlsProps) {
  const [localSymbols, setLocalSymbols] = useState(config.symbols)
  const [localLookback, setLocalLookback] = useState(config.lookback.toString())

  // Sync local state when config changes externally
  useEffect(() => {
    setLocalSymbols(config.symbols)
  }, [config.symbols])

  useEffect(() => {
    setLocalLookback(config.lookback.toString())
  }, [config.lookback])

  // Debounced update for symbols
  useEffect(() => {
    if (config.universe === "core" || localSymbols === config.symbols) return
    const timer = setTimeout(() => {
      onConfigChange({ ...config, symbols: localSymbols })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [localSymbols, config, onConfigChange])

  // Debounced update for lookback
  useEffect(() => {
    const numValue = parseInt(localLookback)
    if (isNaN(numValue) || numValue === config.lookback || numValue < 5 || numValue > 504) return
    const timer = setTimeout(() => {
      onConfigChange({ ...config, lookback: numValue })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [localLookback, config, onConfigChange])

  const handleSymbolsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onConfigChange({ ...config, symbols: localSymbols })
    }
  }

  const handleLookbackKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const numValue = parseInt(localLookback)
      if (!isNaN(numValue) && numValue >= 5 && numValue <= 504) {
        onConfigChange({ ...config, lookback: numValue })
      }
    }
  }

  return (
    <div className="border-b border-border bg-muted/50">
      {/* Mobile: Compact single-row with horizontal scroll */}
      <div className="sm:hidden">
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-none">
          {/* Universe Toggle */}
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
            <TabsList className="h-9">
              <TabsTrigger value="core" className="text-xs px-3 h-7">
                Indices
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-xs px-3 h-7">
                Custom
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Lookback */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 px-3 font-mono text-xs shrink-0">
                {config.lookback}d
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {LOOKBACK_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      variant={config.lookback === preset.value ? "default" : "outline"}
                      size="sm"
                      className="h-10 text-xs"
                      onClick={() => onConfigChange({ ...config, lookback: preset.value })}
                    >
                      {preset.fullLabel}
                    </Button>
                  ))}
                </div>
                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground">Custom (5-504 days)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={504}
                    value={localLookback}
                    onChange={(e) => setLocalLookback(e.target.value)}
                    onKeyDown={handleLookbackKeyDown}
                    className="h-9 mt-1 font-mono"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Basis */}
          <Select
            value={config.basis}
            onValueChange={(value: "close" | "intraday") => onConfigChange({ ...config, basis: value })}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-24 text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="close">Close</SelectItem>
              <SelectItem value="intraday">Intraday</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1 min-w-2" />

          {/* Refresh */}
          <Button
            onClick={onRefresh}
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-9 w-9 p-0 shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", disabled && "animate-spin")} />
          </Button>
        </div>

        {/* Mobile: View Controls - Horizontal scroll */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50 bg-background overflow-x-auto scrollbar-none">
          {/* Metric Selection */}
          <div className="inline-flex rounded-lg border border-border overflow-hidden shrink-0">
            <button
              onClick={() => onConfigChange({ ...config, metric: "daysSinceHigh" })}
              className={cn(
                "h-9 px-3 text-xs font-medium transition-colors flex items-center gap-1",
                config.metric === "daysSinceHigh"
                  ? "bg-emerald-600 text-white"
                  : "bg-background active:bg-muted text-muted-foreground"
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Days</span>
            </button>
            <button
              onClick={() => onConfigChange({ ...config, metric: "pctFromHigh" })}
              className={cn(
                "h-9 px-3 text-xs font-medium transition-colors border-l border-border",
                config.metric === "pctFromHigh"
                  ? "bg-emerald-600 text-white"
                  : "bg-background active:bg-muted text-muted-foreground"
              )}
            >
              %
            </button>
            <button
              onClick={() => onConfigChange({ ...config, metric: "daysSinceLow" })}
              className={cn(
                "h-9 px-3 text-xs font-medium transition-colors border-l border-border flex items-center gap-1",
                config.metric === "daysSinceLow"
                  ? "bg-rose-600 text-white"
                  : "bg-background active:bg-muted text-muted-foreground"
              )}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Days</span>
            </button>
            <button
              onClick={() => onConfigChange({ ...config, metric: "pctFromLow" })}
              className={cn(
                "h-9 px-3 text-xs font-medium transition-colors border-l border-border",
                config.metric === "pctFromLow"
                  ? "bg-rose-600 text-white"
                  : "bg-background active:bg-muted text-muted-foreground"
              )}
            >
              %
            </button>
          </div>

          {/* Days Select */}
          <Select
            value={config.days.toString()}
            onValueChange={(value) => onConfigChange({ ...config, days: parseInt(value) })}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-[88px] text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="63">Quarter</SelectItem>
              <SelectItem value="126">6 months</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort Select */}
          <Select
            value={config.sortBy}
            onValueChange={(value) => onConfigChange({ ...config, sortBy: value })}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-[100px] text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Default</SelectItem>
              <SelectItem value="closestToExtreme">Nearest</SelectItem>
              <SelectItem value="mostDays">Furthest</SelectItem>
              <SelectItem value="freshBreakouts">Fresh</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Desktop: Original two-row layout */}
      <div className="hidden sm:block">
        {/* Primary Controls Row */}
        <div className="px-4 py-3 flex flex-wrap items-center gap-3">
          {/* Universe Toggle */}
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
            <TabsList className="h-8">
              <TabsTrigger value="core" className="text-xs px-3">
                Indices
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-xs px-3">
                Custom
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Custom Symbols */}
          {config.universe === "custom" && (
            <Input
              value={localSymbols}
              onChange={(e) => setLocalSymbols(e.target.value.toUpperCase())}
              onKeyDown={handleSymbolsKeyDown}
              placeholder="AAPL,MSFT,GOOGL"
              disabled={disabled}
              className="h-8 w-48 text-xs font-mono"
            />
          )}

          <div className="h-6 w-px bg-border" />

          {/* Lookback with Presets */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Lookback:</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground">
                      <HelpCircle className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium mb-1">Rolling Window</p>
                    <p className="text-xs text-muted-foreground">
                      The period over which highs/lows are computed. 63 days = 1 quarter of trading days.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-20 font-mono text-xs">
                  {config.lookback}d
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    {LOOKBACK_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        variant={config.lookback === preset.value ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onConfigChange({ ...config, lookback: preset.value })}
                      >
                        {preset.fullLabel}
                      </Button>
                    ))}
                  </div>
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-muted-foreground">Custom (5-504 days)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={504}
                      value={localLookback}
                      onChange={(e) => setLocalLookback(e.target.value)}
                      onKeyDown={handleLookbackKeyDown}
                      className="h-8 mt-1 font-mono"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Basis */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">Basis:</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground">
                      <HelpCircle className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium mb-1">Price Basis</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Close:</span> Compare closing prices only (EOD data).
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">Intraday:</span> Include daily highs/lows for more sensitivity to intraday moves.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={config.basis}
              onValueChange={(value: "close" | "intraday") => onConfigChange({ ...config, basis: value })}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="close">Close</SelectItem>
                <SelectItem value="intraday">Intraday</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          {/* Data Freshness */}
          {dataDateRange && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span className="font-mono">{dataDateRange.from} → {dataDateRange.to}</span>
            </div>
          )}

          {/* Refresh */}
          <Button
            onClick={onRefresh}
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-8"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", disabled && "animate-spin")} />
          </Button>
        </div>

        {/* View Controls Row */}
        <div className="px-4 py-2 flex flex-wrap items-center gap-3 border-t border-border/50 bg-background">
          {/* Metric Selection as Segmented Control */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">View:</Label>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => onConfigChange({ ...config, metric: "daysSinceHigh" })}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1",
                  config.metric === "daysSinceHigh"
                    ? "bg-emerald-600 text-white"
                    : "bg-background hover:bg-muted text-muted-foreground"
                )}
              >
                <TrendingUp className="w-3 h-3" />
                Days
              </button>
              <button
                onClick={() => onConfigChange({ ...config, metric: "pctFromHigh" })}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors border-l border-border",
                  config.metric === "pctFromHigh"
                    ? "bg-emerald-600 text-white"
                    : "bg-background hover:bg-muted text-muted-foreground"
                )}
              >
                %
              </button>
              <button
                onClick={() => onConfigChange({ ...config, metric: "daysSinceLow" })}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors border-l border-border flex items-center gap-1",
                  config.metric === "daysSinceLow"
                    ? "bg-rose-600 text-white"
                    : "bg-background hover:bg-muted text-muted-foreground"
                )}
              >
                <TrendingDown className="w-3 h-3" />
                Days
              </button>
              <button
                onClick={() => onConfigChange({ ...config, metric: "pctFromLow" })}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors border-l border-border",
                  config.metric === "pctFromLow"
                    ? "bg-rose-600 text-white"
                    : "bg-background hover:bg-muted text-muted-foreground"
                )}
              >
                %
              </button>
            </div>
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Date Range */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Show:</Label>
            <Select
              value={config.days.toString()}
              onValueChange={(value) => onConfigChange({ ...config, days: parseInt(value) })}
              disabled={disabled}
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="63">Quarter</SelectItem>
                <SelectItem value="126">6 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Sort:</Label>
            <Select
              value={config.sortBy}
              onValueChange={(value) => onConfigChange({ ...config, sortBy: value })}
              disabled={disabled}
            >
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default</SelectItem>
                <SelectItem value="closestToExtreme">Nearest Extreme</SelectItem>
                <SelectItem value="mostDays">Furthest Away</SelectItem>
                <SelectItem value="freshBreakouts">Fresh Breakouts</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
