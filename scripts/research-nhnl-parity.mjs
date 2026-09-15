#!/usr/bin/env node

/**
 * Research-only NH/NL reconstruction runner.
 *
 * Purpose:
 * - reconstruct Nasdaq 52-week new-high/new-low counts from Massive data;
 * - compare candidate methodologies against fixtures/nhnl-workbook-samples.json;
 * - never feed production ST Model signals directly.
 *
 * Usage:
 *   MASSIVE_API_KEY=... node scripts/research-nhnl-parity.mjs
 *
 * The script intentionally favors auditability over speed. It downloads the
 * historical XNAS common-stock universe and daily grouped bars, caches them
 * locally, sweeps a small methodology matrix, and prints exact-match results.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY
const BASE_URL = process.env.POLYGON_BASE_URL || 'https://api.polygon.io'
const ROOT = process.cwd()
const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'nhnl-workbook-samples.json')
const CACHE_DIR = path.join(ROOT, '.cache', 'st-model-nhnl')

if (!API_KEY) {
  console.error('MASSIVE_API_KEY (or POLYGON_API_KEY) is required')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function ensureCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.mkdir(path.join(CACHE_DIR, 'grouped'), { recursive: true })
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function cachedJson(file, load) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    const value = await load()
    await fs.writeFile(file, JSON.stringify(value), 'utf8')
    return value
  }
}

function withKey(url) {
  const out = new URL(url)
  out.searchParams.set('apiKey', API_KEY)
  return out.toString()
}

async function getJson(url, attempts = 4) {
  let last
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(withKey(url), { headers: { accept: 'application/json' } })
      if (response.status === 429 && attempt < attempts) {
        await sleep(attempt * 1000)
        continue
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)
      return await response.json()
    } catch (error) {
      last = error
      if (attempt < attempts) await sleep(attempt * 750)
    }
  }
  throw last
}

function dateAdd(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

async function fetchUniverse(asOf) {
  const cache = path.join(CACHE_DIR, `xnas-cs-${asOf}.json`)
  return cachedJson(cache, async () => {
    const tickers = []
    let url = new URL('/v3/reference/tickers', BASE_URL)
    url.searchParams.set('market', 'stocks')
    url.searchParams.set('type', 'CS')
    url.searchParams.set('exchange', 'XNAS')
    url.searchParams.set('date', asOf)
    url.searchParams.set('active', 'true')
    url.searchParams.set('limit', '1000')
    url.searchParams.set('sort', 'ticker')
    url.searchParams.set('order', 'asc')

    while (url) {
      const body = await getJson(url.toString())
      for (const row of body.results || []) tickers.push(row.ticker)
      url = body.next_url ? new URL(body.next_url) : null
    }

    return [...new Set(tickers)].sort()
  })
}

async function fetchTradingDates(from, to) {
  const url = new URL(`/v2/aggs/ticker/SPY/range/1/day/${from}/${to}`, BASE_URL)
  url.searchParams.set('adjusted', 'true')
  url.searchParams.set('sort', 'asc')
  url.searchParams.set('limit', '50000')
  const body = await getJson(url.toString())
  return (body.results || []).map((bar) => new Date(bar.t).toISOString().slice(0, 10))
}

async function fetchGrouped(date) {
  const cache = path.join(CACHE_DIR, 'grouped', `${date}.json`)
  return cachedJson(cache, async () => {
    const url = new URL(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, BASE_URL)
    url.searchParams.set('adjusted', 'true')
    return getJson(url.toString())
  })
}

async function buildHistories(universe, dates) {
  const allowed = new Set(universe)
  const histories = new Map()

  let done = 0
  for (const date of dates) {
    const grouped = await fetchGrouped(date)
    for (const row of grouped.results || []) {
      if (!allowed.has(row.T)) continue
      const history = histories.get(row.T) || []
      history.push({ date, high: row.h, low: row.l, close: row.c })
      histories.set(row.T, history)
    }
    done++
    if (done % 25 === 0 || done === dates.length) {
      console.error(`grouped bars: ${done}/${dates.length}`)
    }
  }
  return histories
}

function reconstruct(histories, targetDates, { lookback, basis, minObservations }) {
  const targets = new Set(targetDates)
  const counts = new Map(targetDates.map((date) => [date, { date, newHighs: 0, newLows: 0 }]))

  for (const bars of histories.values()) {
    for (let i = 0; i < bars.length; i++) {
      const current = bars[i]
      if (!targets.has(current.date)) continue
      const start = Math.max(0, i - lookback + 1)
      const window = bars.slice(start, i + 1)
      if (window.length < minObservations) continue

      const count = counts.get(current.date)
      if (basis === 'intraday') {
        const rollingHigh = Math.max(...window.map((bar) => bar.high))
        const rollingLow = Math.min(...window.map((bar) => bar.low))
        if (current.high >= rollingHigh) count.newHighs++
        if (current.low <= rollingLow) count.newLows++
      } else {
        const rollingHigh = Math.max(...window.map((bar) => bar.close))
        const rollingLow = Math.min(...window.map((bar) => bar.close))
        if (current.close >= rollingHigh) count.newHighs++
        if (current.close <= rollingLow) count.newLows++
      }
    }
  }

  return targetDates.map((date) => counts.get(date))
}

function compare(expected, actual) {
  const actualByDate = new Map(actual.map((row) => [row.date, row]))
  const rows = expected.map((row) => {
    const got = actualByDate.get(row.date)
    const highDelta = got.newHighs - row.newHighs
    const lowDelta = got.newLows - row.newLows
    return { ...row, actualNewHighs: got.newHighs, actualNewLows: got.newLows, highDelta, lowDelta, exact: highDelta === 0 && lowDelta === 0 }
  })
  const exactMatches = rows.filter((row) => row.exact).length
  const totalAbsDelta = rows.reduce((sum, row) => sum + Math.abs(row.highDelta) + Math.abs(row.lowDelta), 0)
  return { exactMatches, total: rows.length, totalAbsDelta, rows }
}

await ensureCache()
const fixture = await readJson(FIXTURE_PATH)
const expected = fixture.rows
const targetDates = expected.map((row) => row.date)
const lastTarget = targetDates.at(-1)

// 430 calendar days is enough to contain >252 US trading sessions plus margin.
const firstHistoryDate = dateAdd(targetDates[0], -430)
const universe = await fetchUniverse(lastTarget)
console.error(`XNAS common-stock universe @ ${lastTarget}: ${universe.length}`)

const tradingDates = await fetchTradingDates(firstHistoryDate, lastTarget)
console.error(`trading dates: ${tradingDates.length} (${tradingDates[0]}..${tradingDates.at(-1)})`)
const histories = await buildHistories(universe, tradingDates)
console.error(`ticker histories with grouped data: ${histories.size}`)

const candidates = [
  { lookback: 252, basis: 'intraday', minObservations: 1 },
  { lookback: 252, basis: 'intraday', minObservations: 252 },
  { lookback: 252, basis: 'close', minObservations: 1 },
  { lookback: 252, basis: 'close', minObservations: 252 },
]

const results = candidates.map((candidate) => {
  const actual = reconstruct(histories, targetDates, candidate)
  return { candidate, ...compare(expected, actual) }
}).sort((a, b) => b.exactMatches - a.exactMatches || a.totalAbsDelta - b.totalAbsDelta)

console.log(JSON.stringify({
  workbookSha256: fixture.sourceWorkbookSha256,
  universe: { exchange: 'XNAS', type: 'CS', asOf: lastTarget, count: universe.length },
  historyRange: { from: tradingDates[0], to: tradingDates.at(-1), sessions: tradingDates.length },
  promotionRule: 'Research only. Do not wire to live NH/NL unless the accepted candidate passes the agreed workbook parity gate.',
  results,
}, null, 2))

if (!results.some((result) => result.exactMatches === result.total)) {
  process.exitCode = 3
}
