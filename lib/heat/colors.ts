// =============================================================================
// Tucson Trader - Unified Heatmap Color System
// =============================================================================
// Days-first "primitive" style: DAYS are primary, % is secondary.
// Banded color scale optimized for daysSinceHigh/Low.
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
  /** Band name for debugging */
  band: 'hottest' | 'hot' | 'warm' | 'cool' | 'cold' | 'none'
}

// -----------------------------------------------------------------------------
// Standard Intuitive Color Palette
// -----------------------------------------------------------------------------
// GREEN = Good/Bullish, RED = Bad/Bearish (standard financial convention)
//
// For HIGH metrics (days since high):
//   0 days = GREEN (at new highs = strong/bullish)
//   More days = fades toward RED (far from highs = weak)
//
// For LOW metrics (days since low):
//   0 days = RED (at new lows = weak/bearish)
//   More days = fades toward GREEN (far from lows = strong)

// HIGH colors - Green to Red (0 = green/good, high = red/bad)
const HIGH_BANDS = {
  hottest: { bg: '#22c55e', fg: '#ffffff' },  // Green-500 - 0 days (at highs = bullish)
  hot:     { bg: '#4ade80', fg: '#000000' },  // Green-400 - 1-3 days
  warm:    { bg: '#fbbf24', fg: '#000000' },  // Amber-400 - 4-10 days (cooling)
  cool:    { bg: '#f97316', fg: '#ffffff' },  // Orange-500 - 11-21 days (warning)
  cold:    { bg: '#ef4444', fg: '#ffffff' },  // Red-500 - >21 days (far from highs)
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// LOW colors - Red to Green (0 = red/bad, high = green/good)
const LOW_BANDS = {
  hottest: { bg: '#ef4444', fg: '#ffffff' },  // Red-500 - 0 days (at lows = bearish)
  hot:     { bg: '#f97316', fg: '#ffffff' },  // Orange-500 - 1-3 days
  warm:    { bg: '#fbbf24', fg: '#000000' },  // Amber-400 - 4-10 days
  cool:    { bg: '#4ade80', fg: '#000000' },  // Green-400 - 11-21 days (recovering)
  cold:    { bg: '#22c55e', fg: '#ffffff' },  // Green-500 - >21 days (far from lows = strong)
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// Percentage colors follow same logic
const PCT_HIGH_COLORS = {
  hottest: { bg: '#22c55e', fg: '#ffffff' },  // 0% from high = green
  hot:     { bg: '#4ade80', fg: '#000000' },
  warm:    { bg: '#fbbf24', fg: '#000000' },
  cool:    { bg: '#f97316', fg: '#ffffff' },
  cold:    { bg: '#ef4444', fg: '#ffffff' },  // Far from high = red
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

const PCT_LOW_COLORS = {
  hottest: { bg: '#ef4444', fg: '#ffffff' },  // 0% from low = red (at lows)
  hot:     { bg: '#f97316', fg: '#ffffff' },
  warm:    { bg: '#fbbf24', fg: '#000000' },
  cool:    { bg: '#4ade80', fg: '#000000' },
  cold:    { bg: '#22c55e', fg: '#ffffff' },  // Far from low = green
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// -----------------------------------------------------------------------------
// Days-First Band Classification
// -----------------------------------------------------------------------------

type BandName = 'hottest' | 'hot' | 'warm' | 'cool' | 'cold' | 'none'

/**
 * Get the band for a days-since value.
 * Uses fixed bands regardless of lookback (primitive style).
 */
function getDaysBand(days: number): BandName {
  if (days === 0) return 'hottest'
  if (days <= 3) return 'hot'
  if (days <= 10) return 'warm'
  if (days <= 21) return 'cool'
  if (days <= 62) return 'cold'  // Within lookback
  return 'none'
}

/**
 * Get the band for a percentage value.
 */
function getPctBand(pct: number): BandName {
  if (pct <= 0.5) return 'hottest'
  if (pct <= 2) return 'hot'
  if (pct <= 5) return 'warm'
  if (pct <= 10) return 'cool'
  if (pct <= 20) return 'cold'
  return 'none'
}

// -----------------------------------------------------------------------------
// Main Function
// -----------------------------------------------------------------------------

/**
 * Get heatmap styling for a given metric value.
 * Days-first approach: DAYS metrics use banded colors, % metrics use gradient.
 */
export function getHeatStyle({ metric, value, lookback }: HeatStyleInput): HeatStyle {
  const isHighMetric = metric.includes('High')
  const isDaysMetric = metric.includes('days')

  let band: BandName
  let intensity: number

  if (isDaysMetric) {
    // Days-first banded approach
    band = getDaysBand(value)
    // Intensity: 1 at 0 days, 0 at lookback
    intensity = Math.max(0, 1 - value / lookback)
  } else {
    // Percentage gradient approach
    band = getPctBand(value)
    // Intensity: 1 at 0%, 0 at 20%+
    intensity = Math.max(0, 1 - value / 20)
  }

  // Select palette
  let palette: typeof HIGH_BANDS
  if (isDaysMetric) {
    palette = isHighMetric ? HIGH_BANDS : LOW_BANDS
  } else {
    palette = isHighMetric ? PCT_HIGH_COLORS : PCT_LOW_COLORS
  }

  const color = palette[band]

  return {
    bg: color.bg,
    fg: color.fg,
    intensity,
    band,
  }
}

// -----------------------------------------------------------------------------
// Signal Detection (for borders)
// -----------------------------------------------------------------------------

export interface SignalInfo {
  type: 'confirmed' | 'rejected' | 'divergence' | null
  description: string
}

/**
 * Detect breakout signals by comparing HIGH and CLOSE basis.
 */
export function detectSignal(
  highDays: number,
  closeDays: number,
  _otherSymbolsDays?: number[]
): SignalInfo {
  // Confirmed breakout: both at 0
  if (highDays === 0 && closeDays === 0) {
    return { type: 'confirmed', description: 'Confirmed breakout: New high on both intraday and close' }
  }

  // Rejected breakout: touched high but closed lower
  if (highDays === 0 && closeDays > 0) {
    return { type: 'rejected', description: `Rejected breakout: Touched new high but closed ${closeDays} days from high` }
  }

  // Could add divergence detection here if otherSymbolsDays provided
  // (one symbol far while others near)

  return { type: null, description: '' }
}

// -----------------------------------------------------------------------------
// CSS Class Helper (for Tailwind-based usage)
// -----------------------------------------------------------------------------

/**
 * Get Tailwind classes for heatmap styling.
 * Uses standard Green=Good, Red=Bad financial convention.
 */
export function getHeatClasses({ metric, value, lookback }: HeatStyleInput): string {
  const style = getHeatStyle({ metric, value, lookback })
  const isHighMetric = metric.includes('High')

  // For HIGH metrics: Green (at highs) -> Red (far from highs)
  // For LOW metrics: Red (at lows) -> Green (far from lows)
  if (isHighMetric) {
    switch (style.band) {
      case 'hottest': return 'bg-green-500 text-white font-bold'      // At highs = green
      case 'hot': return 'bg-green-400 text-black font-semibold'
      case 'warm': return 'bg-amber-400 text-black font-medium'       // Cooling = amber
      case 'cool': return 'bg-orange-500 text-white'                  // Warning = orange
      case 'cold': return 'bg-red-500 text-white'                     // Far from highs = red
      default: return 'text-muted-foreground/50'
    }
  } else {
    switch (style.band) {
      case 'hottest': return 'bg-red-500 text-white font-bold'        // At lows = red
      case 'hot': return 'bg-orange-500 text-white font-semibold'
      case 'warm': return 'bg-amber-400 text-black font-medium'
      case 'cool': return 'bg-green-400 text-black'                   // Recovering = green
      case 'cold': return 'bg-green-500 text-white'                   // Far from lows = green
      default: return 'text-muted-foreground/50'
    }
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
export function getHeatLegend(metricType: 'high' | 'low', isDays = true): LegendItem[] {
  if (isDays) {
    const palette = metricType === 'high' ? HIGH_BANDS : LOW_BANDS
    return [
      { label: '0 days', bg: palette.hottest.bg, fg: palette.hottest.fg },
      { label: '1-3 days', bg: palette.hot.bg, fg: palette.hot.fg },
      { label: '4-10 days', bg: palette.warm.bg, fg: palette.warm.fg },
      { label: '11-21 days', bg: palette.cool.bg, fg: palette.cool.fg },
      { label: '>21 days', bg: palette.cold.bg, fg: palette.cold.fg },
    ]
  } else {
    const palette = metricType === 'high' ? PCT_HIGH_COLORS : PCT_LOW_COLORS
    return [
      { label: '0-0.5%', bg: palette.hottest.bg, fg: palette.hottest.fg },
      { label: '0.5-2%', bg: palette.hot.bg, fg: palette.hot.fg },
      { label: '2-5%', bg: palette.warm.bg, fg: palette.warm.fg },
      { label: '5-10%', bg: palette.cool.bg, fg: palette.cool.fg },
      { label: '>10%', bg: palette.cold.bg, fg: palette.cold.fg },
    ]
  }
}

// -----------------------------------------------------------------------------
// Border Style for Signals
// -----------------------------------------------------------------------------

export interface SignalBorderStyle {
  borderColor: string
  borderWidth: string
  borderStyle: string
  cornerDot?: boolean
}

export function getSignalBorderStyle(signal: SignalInfo['type']): SignalBorderStyle | null {
  switch (signal) {
    case 'confirmed':
      return {
        borderColor: 'oklch(0.65 0.20 145)', // Bright green
        borderWidth: '2px',
        borderStyle: 'solid',
        cornerDot: true,
      }
    case 'rejected':
      return {
        borderColor: 'oklch(0.70 0.18 65)', // Amber/orange
        borderWidth: '2px',
        borderStyle: 'solid',
      }
    case 'divergence':
      return {
        borderColor: 'oklch(0.60 0.15 280)', // Purple
        borderWidth: '2px',
        borderStyle: 'dashed',
      }
    default:
      return null
  }
}
