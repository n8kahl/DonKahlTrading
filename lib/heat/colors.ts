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

// HIGH colors - Muted Green to Red (0 = green/good, high = red/bad)
// Using desaturated, professional colors that don't overwhelm
const HIGH_BANDS = {
  hottest: { bg: '#059669', fg: '#ffffff' },  // Emerald-600 muted - 0 days
  hot:     { bg: '#34d399', fg: '#064e3b' },  // Emerald-400 - 1-3 days
  warm:    { bg: '#fcd34d', fg: '#78350f' },  // Amber-300 muted - 4-10 days
  cool:    { bg: '#fb923c', fg: '#7c2d12' },  // Orange-400 - 11-21 days
  cold:    { bg: '#dc2626', fg: '#ffffff' },  // Red-600 - >21 days
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// LOW colors - Muted Red to Green (0 = red/bad, high = green/good)
const LOW_BANDS = {
  hottest: { bg: '#dc2626', fg: '#ffffff' },  // Red-600 - 0 days (at lows)
  hot:     { bg: '#fb923c', fg: '#7c2d12' },  // Orange-400 - 1-3 days
  warm:    { bg: '#fcd34d', fg: '#78350f' },  // Amber-300 - 4-10 days
  cool:    { bg: '#34d399', fg: '#064e3b' },  // Emerald-400 - 11-21 days
  cold:    { bg: '#059669', fg: '#ffffff' },  // Emerald-600 - >21 days
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// Percentage colors follow same logic
const PCT_HIGH_COLORS = {
  hottest: { bg: '#059669', fg: '#ffffff' },
  hot:     { bg: '#34d399', fg: '#064e3b' },
  warm:    { bg: '#fcd34d', fg: '#78350f' },
  cool:    { bg: '#fb923c', fg: '#7c2d12' },
  cold:    { bg: '#dc2626', fg: '#ffffff' },
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

const PCT_LOW_COLORS = {
  hottest: { bg: '#dc2626', fg: '#ffffff' },
  hot:     { bg: '#fb923c', fg: '#7c2d12' },
  warm:    { bg: '#fcd34d', fg: '#78350f' },
  cool:    { bg: '#34d399', fg: '#064e3b' },
  cold:    { bg: '#059669', fg: '#ffffff' },
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
  boxShadow?: string
  cornerDot?: boolean
}

export function getSignalBorderStyle(signal: SignalInfo['type']): SignalBorderStyle | null {
  switch (signal) {
    case 'confirmed':
      return {
        borderColor: '#000000',  // Black border for contrast
        borderWidth: '3px',
        borderStyle: 'solid',
        boxShadow: '0 0 0 2px #10b981, inset 0 0 8px rgba(16, 185, 129, 0.3)',  // Green glow
        cornerDot: true,
      }
    case 'rejected':
      return {
        borderColor: '#000000',  // Black border for contrast
        borderWidth: '3px',
        borderStyle: 'solid',
        boxShadow: '0 0 0 2px #f59e0b, inset 0 0 8px rgba(245, 158, 11, 0.3)',  // Amber glow
      }
    case 'divergence':
      return {
        borderColor: '#8b5cf6',  // Purple
        borderWidth: '2px',
        borderStyle: 'dashed',
        boxShadow: '0 0 0 1px #8b5cf6',
      }
    default:
      return null
  }
}
