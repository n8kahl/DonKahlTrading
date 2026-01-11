// =============================================================================
// Tucson Trader - Trader Signal Logic
// =============================================================================
// Core computation for regime detection, breadth, rejections, and divergences.
// Designed for "primitive" trader interpretation: DAYS are primary.
// =============================================================================

import type { HeatmapMetrics } from './massive-api'

// -----------------------------------------------------------------------------
// Configuration Constants (trader-tunable)
// -----------------------------------------------------------------------------

export const TRADER_CONFIG = {
  // Breadth thresholds (in days)
  HOT_THRESHOLD: 3,       // <=3 days = "hot" (near highs)
  COLD_THRESHOLD: 15,     // >=15 days = "cold" (far from highs)

  // Regime rules
  REGIME_MAJORITY: 0.6,   // 60% threshold for regime label

  // Rejection severity (delta = closeDays - highDays)
  REJECTION_MILD: 2,      // delta 1-2
  REJECTION_NOTABLE: 5,   // delta 3-5
  // > 5 = strong rejection

  // Recent history window
  RECENT_ROWS: 10,        // Last N sessions for rejection rate
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type RegimeLabel = 'Risk-On' | 'Narrow / Mixed' | 'Risk-Off'

export interface BreadthStats {
  hotCount: number      // Symbols with days <= HOT_THRESHOLD
  coldCount: number     // Symbols with days >= COLD_THRESHOLD
  neutralCount: number  // Everything else
  total: number
}

export interface RegimeInfo {
  label: RegimeLabel
  breadth: BreadthStats
  confidence: 'high' | 'medium' | 'low'
}

export type RejectionSeverity = 'mild' | 'notable' | 'strong'

export interface RejectionSignal {
  symbol: string
  highDays: number
  closeDays: number
  delta: number
  severity: RejectionSeverity
  date: string
}

export interface ConfirmationSignal {
  symbol: string
  date: string
}

export interface SignalSummary {
  regime: RegimeInfo
  confirmations: ConfirmationSignal[]
  rejections: RejectionSignal[]
  recentRejectionRate: number  // Over last N sessions
  totalRecentSessions: number
}

export type DivergenceType =
  | 'small-caps-lagging'
  | 'semis-leading'
  | 'growth-leading'
  | 'dow-leading'
  | 'vix-elevated'
  | 'breadth-divergence'

export interface DivergenceSignal {
  type: DivergenceType
  title: string
  description: string
  confidence: 'High' | 'Medium' | 'Low'
  symbols: { leader: string; laggard: string }
  leaderDays: number
  laggardDays: number
}

// -----------------------------------------------------------------------------
// Breadth Computation
// -----------------------------------------------------------------------------

export function computeBreadth(
  latestRow: Record<string, number>,
  config = TRADER_CONFIG
): BreadthStats {
  const symbols = Object.keys(latestRow)
  let hotCount = 0
  let coldCount = 0

  for (const symbol of symbols) {
    const days = latestRow[symbol]
    if (days == null) continue

    if (days <= config.HOT_THRESHOLD) {
      hotCount++
    } else if (days >= config.COLD_THRESHOLD) {
      coldCount++
    }
  }

  return {
    hotCount,
    coldCount,
    neutralCount: symbols.length - hotCount - coldCount,
    total: symbols.length,
  }
}

// -----------------------------------------------------------------------------
// Regime Detection
// -----------------------------------------------------------------------------

export function computeRegime(
  breadth: BreadthStats,
  config = TRADER_CONFIG
): RegimeInfo {
  const majorityThreshold = Math.ceil(breadth.total * config.REGIME_MAJORITY)

  let label: RegimeLabel
  let confidence: 'high' | 'medium' | 'low'

  if (breadth.hotCount >= majorityThreshold) {
    label = 'Risk-On'
    confidence = breadth.hotCount >= breadth.total * 0.8 ? 'high' : 'medium'
  } else if (breadth.coldCount >= majorityThreshold) {
    label = 'Risk-Off'
    confidence = breadth.coldCount >= breadth.total * 0.8 ? 'high' : 'medium'
  } else {
    label = 'Narrow / Mixed'
    confidence = 'low'
  }

  return { label, breadth, confidence }
}

// -----------------------------------------------------------------------------
// Rejection Detection
// -----------------------------------------------------------------------------

function getRejectionSeverity(delta: number, config = TRADER_CONFIG): RejectionSeverity {
  if (delta <= config.REJECTION_MILD) return 'mild'
  if (delta <= config.REJECTION_NOTABLE) return 'notable'
  return 'strong'
}

export function detectRejections(
  highRow: Record<string, number>,
  closeRow: Record<string, number>,
  date: string,
  config = TRADER_CONFIG
): RejectionSignal[] {
  const rejections: RejectionSignal[] = []

  for (const symbol of Object.keys(highRow)) {
    const highDays = highRow[symbol]
    const closeDays = closeRow[symbol]

    if (highDays == null || closeDays == null) continue

    // Rejection: touched new high intraday (highDays=0) but didn't confirm EOD (closeDays>0)
    if (highDays === 0 && closeDays > 0) {
      const delta = closeDays - highDays
      rejections.push({
        symbol,
        highDays,
        closeDays,
        delta,
        severity: getRejectionSeverity(delta, config),
        date,
      })
    }
  }

  // Sort by severity (strong first) then by delta (larger first)
  return rejections.sort((a, b) => {
    const severityOrder = { strong: 0, notable: 1, mild: 2 }
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
    if (severityDiff !== 0) return severityDiff
    return b.delta - a.delta
  })
}

export function detectConfirmations(
  highRow: Record<string, number>,
  closeRow: Record<string, number>,
  date: string
): ConfirmationSignal[] {
  const confirmations: ConfirmationSignal[] = []

  for (const symbol of Object.keys(highRow)) {
    const highDays = highRow[symbol]
    const closeDays = closeRow[symbol]

    if (highDays == null || closeDays == null) continue

    // Confirmation: both intraday AND close at new highs
    if (highDays === 0 && closeDays === 0) {
      confirmations.push({ symbol, date })
    }
  }

  return confirmations
}

// -----------------------------------------------------------------------------
// Recent Rejection Rate (last N sessions)
// -----------------------------------------------------------------------------

export function computeRecentRejectionRate(
  basisHigh: Record<string, HeatmapMetrics[]>,
  basisClose: Record<string, HeatmapMetrics[]>,
  dates: string[],
  config = TRADER_CONFIG
): { rate: number; count: number; sessions: number } {
  const recentDays = Math.min(config.RECENT_ROWS, dates.length)
  let rejectionCount = 0

  for (let i = dates.length - recentDays; i < dates.length; i++) {
    const highRow: Record<string, number> = {}
    const closeRow: Record<string, number> = {}

    for (const symbol of Object.keys(basisHigh)) {
      if (basisHigh[symbol][i]) {
        highRow[symbol] = basisHigh[symbol][i].daysSinceHigh
      }
      if (basisClose[symbol][i]) {
        closeRow[symbol] = basisClose[symbol][i].daysSinceHigh
      }
    }

    const rejections = detectRejections(highRow, closeRow, dates[i], config)
    rejectionCount += rejections.length
  }

  return {
    rate: recentDays > 0 ? rejectionCount / recentDays : 0,
    count: rejectionCount,
    sessions: recentDays,
  }
}

// -----------------------------------------------------------------------------
// Full Signal Summary (latest row)
// -----------------------------------------------------------------------------

export function computeSignalSummary(
  basisHigh: Record<string, HeatmapMetrics[]>,
  basisClose: Record<string, HeatmapMetrics[]>,
  dates: string[],
  config = TRADER_CONFIG
): SignalSummary | null {
  if (dates.length === 0) return null

  const latestIndex = dates.length - 1
  const latestDate = dates[latestIndex]

  // Extract latest row values
  const latestHighRow: Record<string, number> = {}
  const latestCloseRow: Record<string, number> = {}

  for (const symbol of Object.keys(basisHigh)) {
    if (basisHigh[symbol][latestIndex]) {
      latestHighRow[symbol] = basisHigh[symbol][latestIndex].daysSinceHigh
    }
    if (basisClose[symbol][latestIndex]) {
      latestCloseRow[symbol] = basisClose[symbol][latestIndex].daysSinceHigh
    }
  }

  // Compute breadth and regime from CLOSE basis (EOD = authoritative)
  const breadth = computeBreadth(latestCloseRow, config)
  const regime = computeRegime(breadth, config)

  // Detect confirmations and rejections
  const confirmations = detectConfirmations(latestHighRow, latestCloseRow, latestDate)
  const rejections = detectRejections(latestHighRow, latestCloseRow, latestDate, config)

  // Compute recent rejection rate
  const { rate, sessions } = computeRecentRejectionRate(basisHigh, basisClose, dates, config)

  return {
    regime,
    confirmations,
    rejections,
    recentRejectionRate: rate,
    totalRecentSessions: sessions,
  }
}

// -----------------------------------------------------------------------------
// Divergence Detection
// -----------------------------------------------------------------------------

interface DivergenceRule {
  type: DivergenceType
  title: string
  descriptionTemplate: string
  leader: string
  laggard: string
  leaderThreshold: number    // Leader must be <= this
  laggardThreshold: number   // Laggard must be >= this
  confidence: 'High' | 'Medium' | 'Low'
}

const DIVERGENCE_RULES: DivergenceRule[] = [
  {
    type: 'small-caps-lagging',
    title: 'Small Caps Lagging',
    descriptionTemplate: 'RUT far from highs while SPX/NDX near highs - risk appetite narrowing',
    leader: 'SPX',
    laggard: 'RUT',
    leaderThreshold: 3,
    laggardThreshold: 15,
    confidence: 'High',
  },
  {
    type: 'semis-leading',
    title: 'Semis Leading',
    descriptionTemplate: 'SOX leading broad market - tech/AI momentum',
    leader: 'SOX',
    laggard: 'SPX',
    leaderThreshold: 3,
    laggardThreshold: 10,
    confidence: 'Medium',
  },
  {
    type: 'growth-leading',
    title: 'Growth Over Value',
    descriptionTemplate: 'NDX leading DJI - growth stocks outperforming',
    leader: 'NDX',
    laggard: 'DJI',
    leaderThreshold: 3,
    laggardThreshold: 10,
    confidence: 'Medium',
  },
  {
    type: 'dow-leading',
    title: 'Blue Chips Leading',
    descriptionTemplate: 'DJI leading NDX - rotation to defensives/value',
    leader: 'DJI',
    laggard: 'NDX',
    leaderThreshold: 3,
    laggardThreshold: 10,
    confidence: 'Medium',
  },
  {
    type: 'breadth-divergence',
    title: 'Breadth Divergence',
    descriptionTemplate: 'RUT lagging while IXIC leads - narrow market leadership',
    leader: 'IXIC',
    laggard: 'RUT',
    leaderThreshold: 5,
    laggardThreshold: 12,
    confidence: 'Low',
  },
]

export function detectDivergences(
  latestCloseRow: Record<string, number>,
  maxResults = 3
): DivergenceSignal[] {
  const divergences: DivergenceSignal[] = []

  for (const rule of DIVERGENCE_RULES) {
    const leaderDays = latestCloseRow[rule.leader]
    const laggardDays = latestCloseRow[rule.laggard]

    // Skip if symbols not present
    if (leaderDays == null || laggardDays == null) continue

    // Check if divergence condition is met
    if (leaderDays <= rule.leaderThreshold && laggardDays >= rule.laggardThreshold) {
      divergences.push({
        type: rule.type,
        title: rule.title,
        description: rule.descriptionTemplate,
        confidence: rule.confidence,
        symbols: { leader: rule.leader, laggard: rule.laggard },
        leaderDays,
        laggardDays,
      })
    }
  }

  // Sort by confidence (High first)
  const confidenceOrder = { High: 0, Medium: 1, Low: 2 }
  divergences.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence])

  return divergences.slice(0, maxResults)
}

// -----------------------------------------------------------------------------
// Extract Latest Row Helper
// -----------------------------------------------------------------------------

export function extractLatestRow(
  data: Record<string, HeatmapMetrics[]>,
  dates: string[]
): Record<string, number> {
  const latestIndex = dates.length - 1
  const row: Record<string, number> = {}

  for (const symbol of Object.keys(data)) {
    if (data[symbol][latestIndex]) {
      row[symbol] = data[symbol][latestIndex].daysSinceHigh
    }
  }

  return row
}

// -----------------------------------------------------------------------------
// Get All Rejections (last N sessions)
// -----------------------------------------------------------------------------

export function getAllRecentRejections(
  basisHigh: Record<string, HeatmapMetrics[]>,
  basisClose: Record<string, HeatmapMetrics[]>,
  dates: string[],
  config = TRADER_CONFIG
): RejectionSignal[] {
  const allRejections: RejectionSignal[] = []
  const recentDays = Math.min(config.RECENT_ROWS, dates.length)

  for (let i = dates.length - recentDays; i < dates.length; i++) {
    const highRow: Record<string, number> = {}
    const closeRow: Record<string, number> = {}

    for (const symbol of Object.keys(basisHigh)) {
      if (basisHigh[symbol][i]) {
        highRow[symbol] = basisHigh[symbol][i].daysSinceHigh
      }
      if (basisClose[symbol][i]) {
        closeRow[symbol] = basisClose[symbol][i].daysSinceHigh
      }
    }

    const rejections = detectRejections(highRow, closeRow, dates[i], config)
    allRejections.push(...rejections)
  }

  // Sort by date (most recent first) then by severity
  return allRejections.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date)
    if (dateCompare !== 0) return dateCompare
    const severityOrder = { strong: 0, notable: 1, mild: 2 }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })
}
