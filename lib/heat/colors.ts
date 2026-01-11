// =============================================================================
// Tucson Trader - Unified Heatmap Color System
// =============================================================================

export type HeatMetric = 'daysSinceHigh' | 'pctFromHigh' | 'daysSinceLow' | 'pctFromLow'

export interface HeatStyleInput {
  metric: HeatMetric
  value: number
  lookback: number
}

export interface HeatStyle {
  /** Background color (CSS value) */
  bg: string
  /** Foreground/text color (CSS value) */
  fg: string
  /** Intensity 0-1 (useful for sorting/filtering) */
  intensity: number
}

// -----------------------------------------------------------------------------
// Color Palette Constants
// -----------------------------------------------------------------------------

// Near highs = green/teal (bullish signal)
const HIGH_COLORS = {
  hot: { bg: 'oklch(0.55 0.15 160)', fg: '#ffffff' },      // Bright teal - at/near high
  warm: { bg: 'oklch(0.45 0.12 165)', fg: '#ffffff' },     // Teal
  cool: { bg: 'oklch(0.35 0.08 170)', fg: '#e0e0e0' },     // Muted teal
  cold: { bg: 'oklch(0.25 0.04 170)', fg: '#a0a0a0' },     // Very muted
  none: { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// Near lows = red/rose (bearish signal / buy opportunity)
const LOW_COLORS = {
  hot: { bg: 'oklch(0.50 0.18 25)', fg: '#ffffff' },       // Bright rose - at/near low
  warm: { bg: 'oklch(0.42 0.14 25)', fg: '#ffffff' },      // Rose
  cool: { bg: 'oklch(0.34 0.10 25)', fg: '#e0e0e0' },      // Muted rose
  cold: { bg: 'oklch(0.26 0.06 25)', fg: '#a0a0a0' },      // Very muted
  none: { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Get heatmap styling for a given metric value.
 *
 * Semantics:
 * - daysSinceHigh: 0 days = hot (green), more days = cold
 * - pctFromHigh: 0% = hot (green), higher % = cold
 * - daysSinceLow: 0 days = hot (red), more days = cold
 * - pctFromLow: 0% = hot (red), higher % = cold
 */
export function getHeatStyle({ metric, value, lookback }: HeatStyleInput): HeatStyle {
  const isHighMetric = metric.includes('High')
  const isPctMetric = metric.includes('pct')

  // Calculate intensity (1 = hot/near extreme, 0 = cold/far from extreme)
  let intensity: number

  if (isPctMetric) {
    // Percentage metrics: 0% = intensity 1, 10%+ = intensity 0
    intensity = Math.max(0, 1 - value / 10)
  } else {
    // Days metrics: 0 days = intensity 1, lookback days = intensity 0
    intensity = Math.max(0, 1 - value / lookback)
  }

  // Select color palette based on metric type
  const palette = isHighMetric ? HIGH_COLORS : LOW_COLORS

  // Map intensity to color tier
  let tier: keyof typeof HIGH_COLORS
  if (intensity >= 0.9) {
    tier = 'hot'
  } else if (intensity >= 0.6) {
    tier = 'warm'
  } else if (intensity >= 0.3) {
    tier = 'cool'
  } else if (intensity > 0.05) {
    tier = 'cold'
  } else {
    tier = 'none'
  }

  const color = palette[tier]

  return {
    bg: color.bg,
    fg: color.fg,
    intensity,
  }
}

// -----------------------------------------------------------------------------
// CSS Class Helper (for Tailwind-based usage)
// -----------------------------------------------------------------------------

/**
 * Get Tailwind classes for heatmap styling.
 * Returns background and text classes.
 */
export function getHeatClasses({ metric, value, lookback }: HeatStyleInput): string {
  const isHighMetric = metric.includes('High')
  const isPctMetric = metric.includes('pct')

  let intensity: number
  if (isPctMetric) {
    intensity = Math.max(0, 1 - value / 10)
  } else {
    intensity = Math.max(0, 1 - value / lookback)
  }

  if (isHighMetric) {
    // Green/teal palette for high metrics
    if (intensity >= 0.9) return 'bg-teal-600 text-white font-semibold'
    if (intensity >= 0.6) return 'bg-teal-700/80 text-teal-100 font-medium'
    if (intensity >= 0.3) return 'bg-teal-800/50 text-teal-200/90'
    if (intensity > 0.05) return 'bg-teal-900/30 text-teal-300/70'
    return 'text-muted-foreground/60'
  } else {
    // Red/rose palette for low metrics
    if (intensity >= 0.9) return 'bg-rose-600 text-white font-semibold'
    if (intensity >= 0.6) return 'bg-rose-700/80 text-rose-100 font-medium'
    if (intensity >= 0.3) return 'bg-rose-800/50 text-rose-200/90'
    if (intensity > 0.05) return 'bg-rose-900/30 text-rose-300/70'
    return 'text-muted-foreground/60'
  }
}

// -----------------------------------------------------------------------------
// Legend Data
// -----------------------------------------------------------------------------

export interface LegendItem {
  label: string
  bg: string
  fg: string
}

/**
 * Get legend items for a given metric type.
 */
export function getHeatLegend(metricType: 'high' | 'low'): LegendItem[] {
  if (metricType === 'high') {
    return [
      { label: 'At High', bg: HIGH_COLORS.hot.bg, fg: HIGH_COLORS.hot.fg },
      { label: '1-5 days', bg: HIGH_COLORS.warm.bg, fg: HIGH_COLORS.warm.fg },
      { label: '6-15 days', bg: HIGH_COLORS.cool.bg, fg: HIGH_COLORS.cool.fg },
      { label: '>15 days', bg: HIGH_COLORS.cold.bg, fg: HIGH_COLORS.cold.fg },
    ]
  } else {
    return [
      { label: 'At Low', bg: LOW_COLORS.hot.bg, fg: LOW_COLORS.hot.fg },
      { label: '1-5 days', bg: LOW_COLORS.warm.bg, fg: LOW_COLORS.warm.fg },
      { label: '6-15 days', bg: LOW_COLORS.cool.bg, fg: LOW_COLORS.cool.fg },
      { label: '>15 days', bg: LOW_COLORS.cold.bg, fg: LOW_COLORS.cold.fg },
    ]
  }
}
