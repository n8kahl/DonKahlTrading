// =============================================================================
// Bulk Daily Bars Fetcher with Concurrency Control
// =============================================================================

import { fetchDailyBars, type DailyBar } from '@/lib/massive-api'

// =============================================================================
// Types
// =============================================================================

export interface BulkFetchResult {
  barsBySymbol: Record<string, DailyBar[]>
  succeeded: string[]
  failed: string[]
  rateLimited: boolean
  fetchTimeMs: number
}

export interface FetchProgress {
  total: number
  completed: number
  failed: number
  currentBatch: number
  totalBatches: number
  message: string
}

export type ProgressCallback = (progress: FetchProgress) => void

// =============================================================================
// Configuration
// =============================================================================

const CONCURRENCY_LIMIT = 5 // Max concurrent requests to Polygon
const RETRY_ATTEMPTS = 2
const RETRY_DELAY_MS = 500
const BATCH_DELAY_MS = 100 // Delay between batches to avoid rate limits

// =============================================================================
// Core Fetcher
// =============================================================================

async function fetchWithRetry(
  symbol: string,
  days: number,
  attempts: number = RETRY_ATTEMPTS
): Promise<{ symbol: string; bars: DailyBar[]; error?: string }> {
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      const bars = await fetchDailyBars(symbol, days)
      return { symbol, bars }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      // Check for rate limiting
      if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        // Wait longer on rate limit
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempt))
        continue
      }

      // Last attempt - return error
      if (attempt === attempts) {
        return { symbol, bars: [], error: message }
      }

      // Wait before retry
      await sleep(RETRY_DELAY_MS * (attempt + 1))
    }
  }

  return { symbol, bars: [], error: 'Max retries exceeded' }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// =============================================================================
// Batch Processing with Concurrency Limit
// =============================================================================

async function processBatch(
  symbols: string[],
  days: number
): Promise<{ symbol: string; bars: DailyBar[]; error?: string }[]> {
  return Promise.all(
    symbols.map(symbol => fetchWithRetry(symbol, days))
  )
}

// =============================================================================
// Main Bulk Fetch Function
// =============================================================================

export async function fetchBulkDailyBars(
  symbols: string[],
  days: number,
  onProgress?: ProgressCallback
): Promise<BulkFetchResult> {
  const startTime = Date.now()

  const barsBySymbol: Record<string, DailyBar[]> = {}
  const succeeded: string[] = []
  const failed: string[] = []
  let rateLimited = false

  // Split symbols into batches
  const batches: string[][] = []
  for (let i = 0; i < symbols.length; i += CONCURRENCY_LIMIT) {
    batches.push(symbols.slice(i, i + CONCURRENCY_LIMIT))
  }

  // Process batches sequentially (each batch has concurrent requests)
  let completed = 0

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]

    // Report progress
    if (onProgress) {
      onProgress({
        total: symbols.length,
        completed,
        failed: failed.length,
        currentBatch: batchIndex + 1,
        totalBatches: batches.length,
        message: `Fetching batch ${batchIndex + 1}/${batches.length} (${batch.join(', ')})...`,
      })
    }

    // Process batch concurrently
    const results = await processBatch(batch, days)

    // Collect results
    for (const result of results) {
      if (result.bars.length > 0) {
        barsBySymbol[result.symbol] = result.bars
        succeeded.push(result.symbol)
      } else {
        failed.push(result.symbol)
        if (result.error?.includes('429')) {
          rateLimited = true
        }
      }
      completed++
    }

    // Small delay between batches to avoid overwhelming the API
    if (batchIndex < batches.length - 1) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  // Final progress update
  if (onProgress) {
    onProgress({
      total: symbols.length,
      completed: symbols.length,
      failed: failed.length,
      currentBatch: batches.length,
      totalBatches: batches.length,
      message: `Completed: ${succeeded.length} succeeded, ${failed.length} failed`,
    })
  }

  return {
    barsBySymbol,
    succeeded,
    failed,
    rateLimited,
    fetchTimeMs: Date.now() - startTime,
  }
}

// =============================================================================
// Utility: Align Bars by Date
// =============================================================================

export function alignBarsByDate(
  barsBySymbol: Record<string, DailyBar[]>
): {
  dates: string[]
  alignedBars: Record<string, (DailyBar | null)[]>
  validSymbols: string[]
} {
  // Find all unique dates and sort them
  const allDates = new Set<string>()
  for (const bars of Object.values(barsBySymbol)) {
    for (const bar of bars) {
      allDates.add(bar.date)
    }
  }

  const dates = Array.from(allDates).sort()
  const dateIndex = new Map(dates.map((d, i) => [d, i]))

  // Align bars by date
  const alignedBars: Record<string, (DailyBar | null)[]> = {}
  const validSymbols: string[] = []

  for (const [symbol, bars] of Object.entries(barsBySymbol)) {
    if (bars.length === 0) continue

    const aligned: (DailyBar | null)[] = new Array(dates.length).fill(null)

    for (const bar of bars) {
      const idx = dateIndex.get(bar.date)
      if (idx !== undefined) {
        aligned[idx] = bar
      }
    }

    // Only include symbols with sufficient data coverage (>50% of dates)
    const validCount = aligned.filter(b => b !== null).length
    if (validCount > dates.length * 0.5) {
      alignedBars[symbol] = aligned
      validSymbols.push(symbol)
    }
  }

  return { dates, alignedBars, validSymbols }
}
