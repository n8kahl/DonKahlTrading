"use client"

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

export function EnhancedControls({ config, onConfigChange, onRefresh, lastUpdated, disabled }: EnhancedControlsProps) {
  const metricLabels = {
    pctFromHigh: "% From High",
    daysSinceHigh: "Days Since High",
    pctFromLow: "% From Low",
    daysSinceLow: "Days Since Low",
  }

  return (
    <div className="space-y-4 p-5 bg-muted/30">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-[var(--arizona-copper)]" />
          <h3 className="text-sm font-semibold">Analysis Controls</h3>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Last refresh: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-[var(--arizona-turquoise)]/10 hover:text-[var(--arizona-turquoise)]"
              >
                <Info className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-border/50">
              <DialogHeader>
                <DialogTitle className="text-gradient-copper">Understanding Market Extremes</DialogTitle>
                <DialogDescription className="space-y-3 pt-3">
                  <p className="text-foreground/80">
                    This dashboard tracks how far market indices are from their rolling highs and lows,
                    helping identify potential opportunities and market conditions.
                  </p>
                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">Metrics:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><span className="text-[var(--arizona-turquoise)]">Days Since High/Low:</span> Trading days since the rolling extreme</li>
                      <li><span className="text-[var(--arizona-turquoise)]">% From High/Low:</span> Percentage distance from the rolling extreme</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">Basis:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><span className="text-[var(--arizona-copper)]">Confirmed:</span> Uses closing prices</li>
                      <li><span className="text-[var(--arizona-copper)]">Intraday:</span> Uses high/low prices within the day</li>
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
            className="bg-[var(--arizona-copper)] hover:bg-[var(--arizona-terracotta)] text-white shadow-lg shadow-[var(--arizona-copper)]/20"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${disabled ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Universe Selection */}
        <div className="flex flex-col gap-1.5">
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
            <TabsList className="h-9 bg-muted/50">
              <TabsTrigger
                value="core"
                className="text-xs data-[state=active]:bg-[var(--arizona-copper)] data-[state=active]:text-white"
              >
                Core Indices
              </TabsTrigger>
              <TabsTrigger
                value="custom"
                className="text-xs data-[state=active]:bg-[var(--arizona-copper)] data-[state=active]:text-white"
              >
                Custom
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Custom Symbols Input */}
        {config.universe === "custom" && (
          <div className="flex flex-col gap-1.5 min-w-[200px]">
            <Label htmlFor="symbols" className="text-xs text-muted-foreground font-medium">
              Symbols
            </Label>
            <Input
              id="symbols"
              value={config.symbols}
              onChange={(e) => onConfigChange({ ...config, symbols: e.target.value })}
              placeholder="DJI,SPX,IXIC"
              disabled={disabled}
              className="h-9 text-sm font-mono bg-background/50 border-border/50 focus:border-[var(--arizona-copper)] focus:ring-[var(--arizona-copper)]/20"
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
            <SelectTrigger className="h-9 w-[160px] bg-background/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass border-border/50">
              {Object.entries(metricLabels).map(([value, label]) => (
                <SelectItem key={value} value={value} className="focus:bg-[var(--arizona-copper)]/20">
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
            <SelectTrigger className="h-9 w-[100px] bg-background/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass border-border/50">
              <SelectItem value="21" className="focus:bg-[var(--arizona-copper)]/20">21 days</SelectItem>
              <SelectItem value="63" className="focus:bg-[var(--arizona-copper)]/20">63 days</SelectItem>
              <SelectItem value="126" className="focus:bg-[var(--arizona-copper)]/20">126 days</SelectItem>
              <SelectItem value="252" className="focus:bg-[var(--arizona-copper)]/20">252 days</SelectItem>
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
            <SelectTrigger className="h-9 w-[150px] bg-background/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass border-border/50">
              <SelectItem value="close" className="focus:bg-[var(--arizona-copper)]/20">Confirmed (Close)</SelectItem>
              <SelectItem value="intraday" className="focus:bg-[var(--arizona-copper)]/20">Intraday (H/L)</SelectItem>
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
            <SelectTrigger className="h-9 w-[120px] bg-background/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass border-border/50">
              <SelectItem value="10" className="focus:bg-[var(--arizona-copper)]/20">10 days</SelectItem>
              <SelectItem value="30" className="focus:bg-[var(--arizona-copper)]/20">30 days</SelectItem>
              <SelectItem value="63" className="focus:bg-[var(--arizona-copper)]/20">63 days</SelectItem>
              <SelectItem value="126" className="focus:bg-[var(--arizona-copper)]/20">126 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground font-medium">Sort By</Label>
          <Select
            value={config.sortBy}
            onValueChange={(value) => onConfigChange({ ...config, sortBy: value })}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-[170px] bg-background/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass border-border/50">
              <SelectItem value="none" className="focus:bg-[var(--arizona-copper)]/20">Default Order</SelectItem>
              <SelectItem value="closestToHigh" className="focus:bg-[var(--arizona-copper)]/20">Closest to High</SelectItem>
              <SelectItem value="mostDays" className="focus:bg-[var(--arizona-copper)]/20">Most Days Since High</SelectItem>
              <SelectItem value="freshBreakouts" className="focus:bg-[var(--arizona-copper)]/20">Fresh Breakouts (0d)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
