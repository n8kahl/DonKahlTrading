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
// Days-First Banded Color Palette (Primitive Style)
// -----------------------------------------------------------------------------
// For HIGH metrics: Red/Orange for "at high" (event), fading to neutral
// For LOW metrics: Purple/Rose for "at low" (event), fading to neutral

// HIGH colors - Red/Orange style (like the primitive screenshot)
const HIGH_BANDS = {
  hottest: { bg: 'oklch(0.58 0.20 25)', fg: '#ffffff' },   // Bright red - 0 days
  hot:     { bg: 'oklch(0.52 0.16 30)', fg: '#ffffff' },   // Red-orange - 1-3 days
  warm:    { bg: 'oklch(0.45 0.12 35)', fg: '#ffffff' },   // Orange - 4-10 days
  cool:    { bg: 'oklch(0.38 0.07 40)', fg: '#e0e0e0' },   // Muted orange - 11-21 days
  cold:    { bg: 'oklch(0.28 0.03 45)', fg: '#a0a0a0' },   // Near neutral - >21 days
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// LOW colors - Purple/Rose style
const LOW_BANDS = {
  hottest: { bg: 'oklch(0.52 0.20 320)', fg: '#ffffff' },  // Bright purple - 0 days
  hot:     { bg: 'oklch(0.46 0.16 315)', fg: '#ffffff' },  // Purple - 1-3 days
  warm:    { bg: 'oklch(0.40 0.12 310)', fg: '#ffffff' },  // Rose-purple - 4-10 days
  cool:    { bg: 'oklch(0.34 0.07 305)', fg: '#e0e0e0' },  // Muted purple - 11-21 days
  cold:    { bg: 'oklch(0.26 0.03 300)', fg: '#a0a0a0' },  // Near neutral - >21 days
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

// Legacy teal/rose colors for percentage view
const PCT_HIGH_COLORS = {
  hottest: { bg: 'oklch(0.55 0.15 160)', fg: '#ffffff' },  // Bright teal
  hot:     { bg: 'oklch(0.48 0.12 165)', fg: '#ffffff' },
  warm:    { bg: 'oklch(0.40 0.09 170)', fg: '#ffffff' },
  cool:    { bg: 'oklch(0.32 0.06 170)', fg: '#e0e0e0' },
  cold:    { bg: 'oklch(0.24 0.03 170)', fg: '#a0a0a0' },
  none:    { bg: 'transparent', fg: 'var(--muted-foreground)' },
}

const PCT_LOW_COLORS = {
  hottest: { bg: 'oklch(0.50 0.18 25)', fg: '#ffffff' },
  hot:     { bg: 'oklch(0.44 0.14 25)', fg: '#ffffff' },
  warm:    { bg: 'oklch(0.38 0.10 25)', fg: '#ffffff' },
  cool:    { bg: 'oklch(0.32 0.06 25)', fg: '#e0e0e0' },
  cold:    { bg: 'oklch(0.26 0.03 25)', fg: '#a0a0a0' },
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
 */
export function getHeatClasses({ metric, value, lookback }: HeatStyleInput): string {
  const style = getHeatStyle({ metric, value, lookback })
  const isHighMetric = metric.includes('High')

  // Map bands to Tailwind classes
  if (metric.includes('days')) {
    // Days metrics - use red/orange for HIGH, purple for LOW
    if (isHighMetric) {
      switch (style.band) {
        case 'hottest': return 'bg-red-500 text-white font-bold'
        case 'hot': return 'bg-orange-500 text-white font-semibold'
        case 'warm': return 'bg-orange-600/70 text-white font-medium'
        case 'cool': return 'bg-orange-800/40 text-orange-200/90'
        case 'cold': return 'bg-orange-900/20 text-orange-300/60'
        default: return 'text-muted-foreground/50'
      }
    } else {
      switch (style.band) {
        case 'hottest': return 'bg-purple-500 text-white font-bold'
        case 'hot': return 'bg-purple-600 text-white font-semibold'
        case 'warm': return 'bg-purple-700/70 text-white font-medium'
        case 'cool': return 'bg-purple-800/40 text-purple-200/90'
        case 'cold': return 'bg-purple-900/20 text-purple-300/60'
        default: return 'text-muted-foreground/50'
      }
    }
  } else {
    // Percentage metrics - use teal for HIGH, rose for LOW
    if (isHighMetric) {
      switch (style.band) {
        case 'hottest': return 'bg-teal-500 text-white font-bold'
        case 'hot': return 'bg-teal-600 text-white font-semibold'
        case 'warm': return 'bg-teal-700/70 text-white font-medium'
        case 'cool': return 'bg-teal-800/40 text-teal-200/90'
        case 'cold': return 'bg-teal-900/20 text-teal-300/60'
        default: return 'text-muted-foreground/50'
      }
    } else {
      switch (style.band) {
        case 'hottest': return 'bg-rose-500 text-white font-bold'
        case 'hot': return 'bg-rose-600 text-white font-semibold'
        case 'warm': return 'bg-rose-700/70 text-white font-medium'
        case 'cool': return 'bg-rose-800/40 text-rose-200/90'
        case 'cold': return 'bg-rose-900/20 text-rose-300/60'
        default: return 'text-muted-foreground/50'
      }
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
