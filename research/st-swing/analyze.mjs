#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY
const BASE_URL = process.env.POLYGON_BASE_URL || 'https://api.polygon.io'
const AS_OF = process.env.ST_SWING_AS_OF || '2026-09-15'
const FROM = process.env.ST_SWING_FROM || '2000-01-01'
const OUT_DIR = path.dirname(fileURLToPath(import.meta.url))

const ALL_SYMBOLS = ['SOXL', 'TQQQ', 'FNGG', 'TECL', 'TNA', 'MSTR', 'YINN', 'TAN']
const PRIMARY_SYMBOLS = ALL_SYMBOLS.filter((symbol) => symbol !== 'YINN')
const EB_SYMBOLS = new Set(['SOXL', 'TQQQ', 'FNGG'])
const ENTRY_TYPES = ['A_next_open', 'B_next_close', 'C_first_close3']
const HOLD_DAYS = [3, 5, 7, 10]
const STOP_TYPES = ['none', 'fixed5', 'fixed8', 'fixed10', 'atr1.5', 'atr2.0']

if (!API_KEY) throw new Error('Set MASSIVE_API_KEY (or POLYGON_API_KEY) before running this research script.')

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN }
function median(values) {
  if (!values.length) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
function percentile(values, p) {
  if (!values.length) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[idx]
}
function csvEscape(value) {
  if (value == null || Number.isNaN(value)) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
function toCsv(rows, columns) { return [columns.join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))].join('\n') + '\n' }
function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10) }
function dateYear(date) { return Number(date.slice(0, 4)) }
function dateMonth(date) { return Number(date.slice(5, 7)) }
function pyState(date) {
  const year = dateYear(date); const month = dateMonth(date); const cycle = year % 4
  if ((cycle === 2 && month >= 10) || (cycle === 3 && month <= 7)) return 'PY_Thrust'
  if (cycle === 2 && month <= 9) return 'PY_Danger'
  return 'PY_Blank'
}
function periodBucket(date) {
  if (date < '2010-01-01') return 'pre2010'
  if (date < '2015-01-01') return '2010_2014'
  if (date < '2020-01-01') return '2015_2019'
  if (date < '2023-01-01') return '2020_2022'
  return '2023_2026'
}
function eraBucket(date) { if (date < '2020-01-01') return 'pre2020'; if (date < '2023-01-01') return '2020_2022'; return '2023_2026' }
function foldBucket(date) {
  if (date >= '2014-01-01' && date <= '2016-12-31') return 'WF1_2014_2016'
  if (date >= '2017-01-01' && date <= '2019-12-31') return 'WF2_2017_2019'
  if (date >= '2020-01-01' && date <= '2022-12-31') return 'WF3_2020_2022'
  if (date >= '2023-01-01') return 'WF4_2023_2026_pseudo'
  return null
}

async function fetchBars(symbol) {
  const url = new URL(`${BASE_URL}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${FROM}/${AS_OF}`)
  url.searchParams.set('adjusted', 'true'); url.searchParams.set('sort', 'asc'); url.searchParams.set('limit', '50000'); url.searchParams.set('apiKey', API_KEY)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`)
  const json = await response.json()
  const bars = (json.results || []).map((row) => ({ ticker: symbol, date: isoDate(row.t), open: row.o, high: row.h, low: row.l, close: row.c, volume: row.v }))
  validateBars(symbol, bars)
  return bars
}
function validateBars(symbol, bars) {
  if (!bars.length) throw new Error(`${symbol}: no bars returned`)
  const seen = new Set(); let prior = ''
  for (const bar of bars) {
    if (seen.has(bar.date)) throw new Error(`${symbol}: duplicate bar ${bar.date}`)
    if (prior && bar.date <= prior) throw new Error(`${symbol}: bars not ascending at ${bar.date}`)
    if (![bar.open, bar.high, bar.low, bar.close].every((v) => Number.isFinite(v) && v > 0)) throw new Error(`${symbol}: invalid OHLC on ${bar.date}`)
    if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.high < bar.low) throw new Error(`${symbol}: inconsistent OHLC on ${bar.date}`)
    seen.add(bar.date); prior = bar.date
  }
}

function buildFeatures(symbol, bars) {
  const tr = bars.map((bar, i) => i === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)))
  return bars.map((bar, i) => {
    let rsi = null
    if (i >= 5) {
      let gain = 0; let loss = 0
      for (let k = 0; k < 5; k += 1) { const change = bars[i - k].close - bars[i - k - 1].close; if (change > 0) gain += change; if (change < 0) loss += -change }
      rsi = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
    }
    let pctFall = null; let pctRise = null
    if (i >= 10) {
      const window = bars.slice(i - 10, i + 1); const maxHigh = Math.max(...window.map((item) => item.high)); const minLow = Math.min(...window.map((item) => item.low))
      pctFall = bar.low / maxHigh - 1; pctRise = bar.low / minLow - 1
    }
    const atr14 = i >= 13 ? mean(tr.slice(i - 13, i + 1)) : null
    const presidentialImpact = pyState(bar.date)
    let stdType = ''
    if (pctFall != null && rsi != null && pctFall < -0.2 && rsi < 5) stdType = EB_SYMBOLS.has(symbol) && rsi === 0 && presidentialImpact === 'PY_Thrust' ? 'EB' : 'B'
    return { symbol, index: i, date: bar.date, bar, rsi, pctFall, pctRise, atr14, presidentialImpact, stdType }
  })
}
function newEpisodes(features) { return features.filter((feature, i) => feature.stdType && (i === 0 || !features[i - 1].stdType)) }
function entryForEpisode(episode, features, entryType) {
  const i = episode.index
  if (entryType === 'A_next_open') { const f = features[i + 1]; return f ? { entryIndex: i + 1, entryPrice: f.bar.open, entryDate: f.date, enteredAtClose: false } : null }
  if (entryType === 'B_next_close') { const f = features[i + 1]; if (!f || f.bar.close <= episode.bar.close) return null; return { entryIndex: i + 1, entryPrice: f.bar.close, entryDate: f.date, enteredAtClose: true } }
  for (let j = i + 1; j <= i + 3; j += 1) { const f = features[j]; if (f && f.bar.close > episode.bar.close) return { entryIndex: j, entryPrice: f.bar.close, entryDate: f.date, enteredAtClose: true } }
  return null
}
function stopPrice(stopType, entryPrice, atr14) {
  if (stopType === 'none') return null
  if (stopType === 'fixed5') return entryPrice * 0.95
  if (stopType === 'fixed8') return entryPrice * 0.92
  if (stopType === 'fixed10') return entryPrice * 0.9
  if (atr14 == null) return null
  if (stopType === 'atr1.5') return entryPrice - 1.5 * atr14
  if (stopType === 'atr2.0') return entryPrice - 2 * atr14
  throw new Error(`Unknown stop type ${stopType}`)
}
function simulateTrade(episode, features, entryType, holdDays, stopType) {
  const entry = entryForEpisode(episode, features, entryType)
  if (!entry || (stopType.startsWith('atr') && episode.atr14 == null)) return null
  const scheduledExitIndex = entry.entryIndex + holdDays - 1
  if (!features[scheduledExitIndex]) return null
  const stop = stopPrice(stopType, entry.entryPrice, episode.atr14); const stopStart = entry.enteredAtClose ? entry.entryIndex + 1 : entry.entryIndex
  let actualExitIndex = scheduledExitIndex; let exitPrice = features[scheduledExitIndex].bar.close; let stopOutcome = 'HELD'
  if (stop != null) for (let j = stopStart; j <= scheduledExitIndex; j += 1) {
    const bar = features[j].bar
    if (bar.open <= stop) { actualExitIndex = j; exitPrice = bar.open; stopOutcome = bar.open < stop ? 'GAP' : 'STOP'; break }
    if (bar.low <= stop) { actualExitIndex = j; exitPrice = stop; stopOutcome = 'STOP'; break }
  }
  const intendedPath = features.slice(entry.entryIndex, scheduledExitIndex + 1)
  const mfe = Math.max(...intendedPath.map((feature) => feature.bar.high)) / entry.entryPrice - 1; const mae = Math.min(...intendedPath.map((feature) => feature.bar.low)) / entry.entryPrice - 1
  return { symbol: episode.symbol, signalDate: episode.date, signalIndex: episode.index, stdType: episode.stdType, rsi: episode.rsi, pctFall: episode.pctFall, pctRise: episode.pctRise, presidentialImpact: episode.presidentialImpact, signalClose: episode.bar.close, atr14: episode.atr14, entryType, holdDays, stopType, entryIndex: entry.entryIndex, entryDate: entry.entryDate, entryPrice: entry.entryPrice, scheduledExitIndex, scheduledExitDate: features[scheduledExitIndex].date, scheduledExitClose: features[scheduledExitIndex].bar.close, actualExitIndex, actualExitDate: features[actualExitIndex].date, exitPrice, stopPrice: stop, stopOutcome, ret: exitPrice / entry.entryPrice - 1, noStopRet: features[scheduledExitIndex].bar.close / entry.entryPrice - 1, mfe, mae, riskFrac: stopType === 'atr2.0' ? (2 * episode.atr14) / entry.entryPrice : null }
}
function enforceNoOverlap(trades) {
  const grouped = new Map(); for (const trade of trades) { if (!grouped.has(trade.symbol)) grouped.set(trade.symbol, []); grouped.get(trade.symbol).push(trade) }
  const accepted = []; const suppressed = []
  for (const symbolTrades of grouped.values()) {
    symbolTrades.sort((a, b) => a.entryIndex - b.entryIndex || a.signalIndex - b.signalIndex); let activeExitIndex = -1
    for (const trade of symbolTrades) { if (trade.entryIndex <= activeExitIndex) { suppressed.push(trade); continue } accepted.push(trade); activeExitIndex = trade.actualExitIndex }
  }
  accepted.sort((a, b) => a.signalDate.localeCompare(b.signalDate) || a.symbol.localeCompare(b.symbol)); return { accepted, suppressed }
}
function summarizeReturns(trades) {
  const returns = trades.map((trade) => trade.ret); const wins = returns.filter((v) => v > 0); const losses = returns.filter((v) => v < 0)
  const grossWin = wins.reduce((s, v) => s + v, 0); const grossLoss = Math.abs(losses.reduce((s, v) => s + v, 0))
  return { n: returns.length, mean: mean(returns), median: median(returns), winRate: returns.length ? wins.length / returns.length : NaN, avgWin: mean(wins), avgLoss: mean(losses), payoffRatio: losses.length ? mean(wins) / Math.abs(mean(losses)) : NaN, profitFactor: grossLoss ? grossWin / grossLoss : NaN, p5: percentile(returns, 0.05), worst: returns.length ? Math.min(...returns) : NaN, cvar5: mean([...returns].sort((a, b) => a - b).slice(0, Math.ceil(returns.length * 0.05))) }
}
function basketRows(trades) {
  const groups = new Map(); for (const trade of trades) { if (!groups.has(trade.signalDate)) groups.set(trade.signalDate, []); groups.get(trade.signalDate).push(trade) }
  return [...groups.entries()].map(([signalDate, values]) => ({ signalDate, names: values.length, ret: mean(values.map((trade) => trade.ret)) })).sort((a, b) => a.signalDate.localeCompare(b.signalDate))
}
function xorshift(seed) { let state = seed >>> 0; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 } }
function bootstrap(values, reps = 20000, blockSize = 1, seed = 0x5a17) {
  const random = xorshift(seed); const means = []
  for (let rep = 0; rep < reps; rep += 1) { const sample = []; while (sample.length < values.length) { const start = Math.floor(random() * values.length); for (let k = 0; k < blockSize && sample.length < values.length; k += 1) sample.push(values[(start + k) % values.length]) } means.push(mean(sample)) }
  return { reps, blockSize, mean: mean(means), low95: percentile(means, 0.025), high95: percentile(means, 0.975), pctLeZero: means.filter((v) => v <= 0).length / means.length }
}
function groupStats(trades, keyFn) {
  const groups = new Map(); for (const trade of trades) { const key = keyFn(trade); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(trade) }
  return [...groups.entries()].map(([key, values]) => ({ key, ...summarizeReturns(values) }))
}
function randomBaseline(signalTrades, featureMap, matchPeriod, reps = 10000, seed = 0x7219) {
  const pools = new Map()
  for (const [symbol, features] of featureMap.entries()) for (let i = 0; i + 5 < features.length; i += 1) { const key = matchPeriod ? `${symbol}|${periodBucket(features[i].date)}` : symbol; if (!pools.has(key)) pools.set(key, []); pools.get(key).push(features[i + 5].bar.close / features[i + 1].bar.open - 1) }
  const random = xorshift(seed); const means = []; const observed = mean(signalTrades.map((trade) => trade.noStopRet))
  for (let rep = 0; rep < reps; rep += 1) { const values = signalTrades.map((trade) => { const key = matchPeriod ? `${trade.symbol}|${periodBucket(trade.signalDate)}` : trade.symbol; const pool = pools.get(key); return pool[Math.floor(random() * pool.length)] }); means.push(mean(values)) }
  return { reps, observedSignalNoStop: observed, avgRandom: mean(means), p95Random: percentile(means, 0.95), pctAtOrAboveSignal: means.filter((v) => v >= observed).length / reps }
}
function smaRegimeByDate(vooBars) {
  const byDate = new Map(); const sma = vooBars.map((bar, i) => i >= 179 ? mean(vooBars.slice(i - 179, i + 1).map((x) => x.close)) : null)
  for (let i = 0; i < vooBars.length; i += 1) byDate.set(vooBars[i].date, sma[i] == null || i < 6 || sma[i - 6] == null ? 'SMA_Unavailable' : sma[i] > sma[i - 6] ? 'SMA_Bull' : 'SMA_Bear')
  return byDate
}
function realizedExitDrawdown(weightedTrades, weightKey) {
  const pnlByExit = new Map(); for (const trade of weightedTrades) pnlByExit.set(trade.actualExitDate, (pnlByExit.get(trade.actualExitDate) || 0) + trade[weightKey] * trade.ret)
  let cum = 0; let peak = 0; let maxDrawdown = 0
  for (const [, pnl] of [...pnlByExit.entries()].sort(([a], [b]) => a.localeCompare(b))) { cum += pnl; peak = Math.max(peak, cum); maxDrawdown = Math.min(maxDrawdown, cum - peak) }
  return { cumulativePnl: cum, realizedExitDrawdown: maxDrawdown }
}
function portfolioSimulation(candidateTrades, spyBars) {
  const namesByDate = new Map(); for (const trade of candidateTrades) namesByDate.set(trade.signalDate, (namesByDate.get(trade.signalDate) || 0) + 1)
  const base = candidateTrades.map((trade) => ({ ...trade, eqWeight: 0.2 / namesByDate.get(trade.signalDate), rawRiskNotional: (0.2 / namesByDate.get(trade.signalDate)) / trade.riskFrac }))
  const dates = spyBars.map((bar) => bar.date).filter((date) => date >= base[0].entryDate && date <= base.at(-1).actualExitDate)
  const grossAt = (date, key) => base.filter((trade) => date >= trade.entryDate && date <= trade.actualExitDate).reduce((sum, trade) => sum + trade[key], 0)
  const rawRiskPeak = Math.max(...dates.map((date) => grossAt(date, 'rawRiskNotional'))); const riskScale = 1 / rawRiskPeak
  for (const trade of base) { trade.riskWeight = trade.rawRiskNotional * riskScale; trade.effectiveRiskBudget = (0.2 / namesByDate.get(trade.signalDate)) * riskScale }
  const eq = realizedExitDrawdown(base, 'eqWeight'); const risk = realizedExitDrawdown(base, 'riskWeight')
  const eqGross = dates.map((date) => grossAt(date, 'eqWeight')); const riskGross = dates.map((date) => base.filter((trade) => date >= trade.entryDate && date <= trade.actualExitDate).reduce((sum, trade) => sum + trade.riskWeight, 0)); const maxPositions = Math.max(...dates.map((date) => base.filter((trade) => date >= trade.entryDate && date <= trade.actualExitDate).length))
  return [
    { model: 'equal_notional_20pct_per_signal_date', cumulative_pnl_pct: eq.cumulativePnl * 100, realized_exit_drawdown_pct: eq.realizedExitDrawdown * 100, avg_gross_exposure_pct: mean(eqGross) * 100, max_gross_exposure_pct: Math.max(...eqGross) * 100, max_simultaneous_positions: maxPositions, one_way_turnover_x: base.reduce((s, t) => s + t.eqWeight, 0), roundtrip_turnover_x: 2 * base.reduce((s, t) => s + t.eqWeight, 0), risk_scale: '', pnl_per_risk_unit: '' },
    { model: 'fixed_risk_scaled_to_100pct_peak_gross', cumulative_pnl_pct: risk.cumulativePnl * 100, realized_exit_drawdown_pct: risk.realizedExitDrawdown * 100, avg_gross_exposure_pct: mean(riskGross) * 100, max_gross_exposure_pct: Math.max(...riskGross) * 100, max_simultaneous_positions: maxPositions, one_way_turnover_x: base.reduce((s, t) => s + t.riskWeight, 0), roundtrip_turnover_x: 2 * base.reduce((s, t) => s + t.riskWeight, 0), risk_scale: riskScale, pnl_per_risk_unit: risk.cumulativePnl / base.reduce((s, t) => s + t.effectiveRiskBudget, 0) },
  ]
}

async function main() {
  const symbols = [...ALL_SYMBOLS, 'SPY', 'VOO']
  const barsMap = new Map(await Promise.all(symbols.map(async (symbol) => [symbol, await fetchBars(symbol)])))
  const featureMap = new Map(ALL_SYMBOLS.map((symbol) => [symbol, buildFeatures(symbol, barsMap.get(symbol))]))
  const episodes = new Map(ALL_SYMBOLS.map((symbol) => [symbol, newEpisodes(featureMap.get(symbol))]))
  const dataAudit = ALL_SYMBOLS.map((symbol) => { const bars = barsMap.get(symbol); return { symbol, rows: bars.length, first_date: bars[0].date, last_date: bars.at(-1).date } })

  const ledgerRows = []
  for (const symbol of ALL_SYMBOLS) {
    const features = featureMap.get(symbol)
    for (const episode of episodes.get(symbol)) {
      const noStop = simulateTrade(episode, features, 'A_next_open', 5, 'none'); if (!noStop) continue
      const stop15 = simulateTrade(episode, features, 'A_next_open', 5, 'atr1.5'); const stop20 = simulateTrade(episode, features, 'A_next_open', 5, 'atr2.0')
      ledgerRows.push({ signal_date: episode.date, ticker: symbol, std_type: episode.stdType, rsi: episode.rsi, pct_fall: episode.pctFall, pct_rise: episode.pctRise, py_state: episode.presidentialImpact, signal_close: episode.bar.close, next_open: noStop.entryPrice, atr14_signal: episode.atr14 ?? '', exit_date: noStop.scheduledExitDate, exit_close: noStop.scheduledExitClose, mfe: noStop.mfe, mae: noStop.mae, ret5_no_stop: noStop.ret, stop_1_5_status: stop15?.stopOutcome || 'ATR_UNAVAILABLE', stop_1_5_return: stop15?.ret ?? '', stop_2_status: stop20?.stopOutcome || 'ATR_UNAVAILABLE', stop_2_return: stop20?.ret ?? '', full_atr14: episode.atr14 != null, primary_universe: PRIMARY_SYMBOLS.includes(symbol) })
    }
  }
  ledgerRows.sort((a, b) => a.signal_date.localeCompare(b.signal_date) || a.ticker.localeCompare(b.ticker))

  const sensitivityRows = []
  for (const entryType of ENTRY_TYPES) for (const holdDays of HOLD_DAYS) for (const stopType of STOP_TYPES) {
    const rawTrades = []
    for (const symbol of PRIMARY_SYMBOLS) { const features = featureMap.get(symbol); for (const episode of episodes.get(symbol)) { const trade = simulateTrade(episode, features, entryType, holdDays, stopType); if (trade) rawTrades.push(trade) } }
    const { accepted, suppressed } = enforceNoOverlap(rawTrades); const stats = summarizeReturns(accepted)
    sensitivityRows.push({ entry_type: entryType, hold_days: holdDays, stop_type: stopType, events: stats.n, overlap_suppressed: suppressed.length, mean_return_pct: stats.mean * 100, median_return_pct: stats.median * 100, win_rate_pct: stats.winRate * 100, worst_pct: stats.worst * 100, profit_factor: stats.profitFactor })
  }

  const primaryRaw = []
  for (const symbol of PRIMARY_SYMBOLS) { const features = featureMap.get(symbol); for (const episode of episodes.get(symbol)) { const trade = simulateTrade(episode, features, 'A_next_open', 5, 'atr2.0'); if (trade) primaryRaw.push(trade) } }
  const { accepted: candidate, suppressed: candidateSuppressed } = enforceNoOverlap(primaryRaw)
  const acceptedIds = new Set(candidate.map((trade) => `${trade.symbol}|${trade.signalDate}`)); for (const row of ledgerRows) row.primary_overlap_suppressed = row.primary_universe && row.full_atr14 && !acceptedIds.has(`${row.ticker}|${row.signal_date}`)

  const candidateStats = summarizeReturns(candidate); const baskets = basketRows(candidate); const basketStats = summarizeReturns(baskets.map((row) => ({ ret: row.ret })))
  const iidBootstrap = bootstrap(baskets.map((row) => row.ret), 20000, 1, 0x5517); const block5Bootstrap = bootstrap(baskets.map((row) => row.ret), 20000, 5, 0x5518)
  const tickerRows = groupStats(candidate, (trade) => trade.symbol).map(({ key, ...stats }) => ({ ticker: key, ...stats })); const eraRows = groupStats(candidate, (trade) => eraBucket(trade.signalDate)).map(({ key, ...stats }) => ({ era: key, ...stats }))
  const foldGroups = new Map(); for (const row of baskets) { const fold = foldBucket(row.signalDate); if (!fold) continue; if (!foldGroups.has(fold)) foldGroups.set(fold, []); foldGroups.get(fold).push(row) }
  const walkRows = [...foldGroups.entries()].map(([fold, rows]) => { const stats = summarizeReturns(rows.map((row) => ({ ret: row.ret }))); return { fold, train_through: fold === 'WF1_2014_2016' ? '2013-12-31' : fold === 'WF2_2017_2019' ? '2016-12-31' : fold === 'WF3_2020_2022' ? '2019-12-31' : '2022-12-31', validation_window: fold.replace('WF1_', '').replace('WF2_', '').replace('WF3_', '').replace('WF4_', ''), signal_dates: rows.length, events: rows.reduce((sum, row) => sum + row.names, 0), mean_basket_pct: stats.mean * 100, win_rate_pct: stats.winRate * 100, worst_basket_pct: stats.worst * 100, pristine_holdout: false } })
  const tickerMatched = randomBaseline(candidate, featureMap, false, 10000, 0x6111); const periodMatched = randomBaseline(candidate, featureMap, true, 10000, 0x6112)
  const vooRegime = smaRegimeByDate(barsMap.get('VOO')); const regimeRows = []
  for (const [dimension, keyFn] of [['signal_type', (trade) => trade.stdType], ['presidential', (trade) => trade.presidentialImpact], ['sma', (trade) => vooRegime.get(trade.signalDate) || 'SMA_Unavailable']]) for (const { key, ...stats } of groupStats(candidate, keyFn)) regimeRows.push({ dimension, bucket: key, n: stats.n, mean_pct: stats.mean * 100, win_rate_pct: stats.winRate * 100 })
  const costRows = [5, 10, 20].map((bpsSide) => { const f = bpsSide / 10000; const net = candidate.map((trade) => ({ ...trade, ret: (trade.exitPrice * (1 - f)) / (trade.entryPrice * (1 + f)) - 1 })); return { bps_side: bpsSide, event_mean_pct: mean(net.map((trade) => trade.ret)) * 100, basket_mean_pct: mean(basketRows(net).map((row) => row.ret)) * 100 } })
  const portfolioRows = portfolioSimulation(candidate, barsMap.get('SPY'))
  const yinnNoStop = episodes.get('YINN').map((episode) => simulateTrade(episode, featureMap.get('YINN'), 'A_next_open', 5, 'none')).filter(Boolean); const yinnPre = yinnNoStop.filter((trade) => trade.signalDate <= '2022-12-31'); const yinnLater = yinnNoStop.filter((trade) => trade.signalDate >= '2023-01-01')

  await fs.writeFile(path.join(OUT_DIR, 'event_ledger.csv'), toCsv(ledgerRows, ['signal_date','ticker','std_type','rsi','pct_fall','pct_rise','py_state','signal_close','next_open','atr14_signal','exit_date','exit_close','mfe','mae','ret5_no_stop','stop_1_5_status','stop_1_5_return','stop_2_status','stop_2_return','full_atr14','primary_universe','primary_overlap_suppressed']))
  await fs.writeFile(path.join(OUT_DIR, 'parameter_sensitivity.csv'), toCsv(sensitivityRows, ['entry_type','hold_days','stop_type','events','overlap_suppressed','mean_return_pct','median_return_pct','win_rate_pct','worst_pct','profit_factor']))
  await fs.writeFile(path.join(OUT_DIR, 'walk_forward.csv'), toCsv(walkRows, ['fold','train_through','validation_window','signal_dates','events','mean_basket_pct','win_rate_pct','worst_basket_pct','pristine_holdout']))
  await fs.writeFile(path.join(OUT_DIR, 'ticker_breakdown.csv'), toCsv(tickerRows, ['ticker','n','mean','median','winRate','avgWin','avgLoss','payoffRatio','profitFactor','p5','worst','cvar5']))
  await fs.writeFile(path.join(OUT_DIR, 'era_breakdown.csv'), toCsv(eraRows, ['era','n','mean','median','winRate','avgWin','avgLoss','payoffRatio','profitFactor','p5','worst','cvar5']))
  await fs.writeFile(path.join(OUT_DIR, 'portfolio_results.csv'), toCsv(portfolioRows, ['model','cumulative_pnl_pct','realized_exit_drawdown_pct','avg_gross_exposure_pct','max_gross_exposure_pct','max_simultaneous_positions','one_way_turnover_x','roundtrip_turnover_x','risk_scale','pnl_per_risk_unit']))
  await fs.writeFile(path.join(OUT_DIR, 'regime_breakdown.csv'), toCsv(regimeRows, ['dimension','bucket','n','mean_pct','win_rate_pct']))
  await fs.writeFile(path.join(OUT_DIR, 'cost_sensitivity.csv'), toCsv(costRows, ['bps_side','event_mean_pct','basket_mean_pct']))

  const output = { generated_at: new Date().toISOString(), as_of: AS_OF, source: { provider: 'Massive/Polygon daily aggregates', adjusted: true, from: FROM, endpoint: '/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}' }, data_audit: dataAudit, full_event_ledger_rows: ledgerRows.length, primary_candidate: { universe: PRIMARY_SYMBOLS, trigger: 'first day of a new Std B/EB episode', entry: 'next regular-session open', atr14: 'simple mean of 14 completed daily True Range observations known at signal close; full 14-session warm-up required', stop: 'entry - 2.0 * ATR14', exit: 'close of session 5 counting entry session as day 1 unless stopped earlier', overlap_policy: 'same-symbol entry suppressed while an earlier accepted position remains active; same-day exit/entry treated as overlap', raw_trades_before_overlap: primaryRaw.length, overlap_suppressed: candidateSuppressed.map((trade) => `${trade.signalDate}:${trade.symbol}`), executable_trades: candidate.length, trade_stats: candidateStats, signal_date_baskets: { n: baskets.length, stats: basketStats }, iid_signal_date_bootstrap: iidBootstrap, block5_signal_date_bootstrap: block5Bootstrap }, baselines: { ticker_matched_random: tickerMatched, ticker_and_period_matched_random: periodMatched }, yinn: { through_2022: summarizeReturns(yinnPre), from_2023: summarizeReturns(yinnLater) }, warning: 'Historical research only. 2023-2026 was previously viewed and is a pseudo-holdout, not a pristine holdout.' }
  await fs.writeFile(path.join(OUT_DIR, 'research_output.json'), JSON.stringify(output, null, 2) + '\n'); console.log(JSON.stringify(output, null, 2))
}
await main()
