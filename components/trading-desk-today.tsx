'use client'

import Link from 'next/link'
import Image from 'next/image'
import useSWR from 'swr'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleMinus,
  Clock3,
  Gauge,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'
import type { HeatmapMetrics } from '@/lib/massive-api'
import type { STModelResult, STSignalPoint } from '@/lib/st-model'
import {
  computeBreadth,
  computeRegime,
  computeSignalSummary,
  detectDivergences,
  extractLatestRow,
} from '@/lib/trader-signals'

type MarketResponse = {
  dates: string[]
  symbols: string[]
  basisHigh: Record<string, HeatmapMetrics[]>
  basisClose: Record<string, HeatmapMetrics[]>
  sanity?: { staleSymbols?: string[]; constantDays?: string[] }
  meta?: { marketStatus?: string; lastUpdated?: string; lastFetchedAt?: string; isDelayed?: boolean }
}

type STResponse = STModelResult & {
  meta?: { marketStatus?: string; lastUpdated?: string; lastFetchedAt?: string; isDelayed?: boolean }
}

type DeskChange = {
  key: string
  title: string
  detail: string
  tone: 'signal' | 'market' | 'warning' | 'quiet'
}

const MARKET_URL = '/api/extremes?symbols=DJI,SPX,IXIC,NDX,RUT,SOX&lookback=63&basis=close&days=30'
const ST_URL = '/api/st-model?days=90'

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

function signals(point?: STSignalPoint): string[] {
  if (!point) return []
  const out: string[] = []
  if (point.std) out.push(`Std ${point.std}`)
  if (point.alt) out.push(`Alt ${point.alt}`)
  if (point.bull) out.push(`Bull ${point.bull}`)
  return out
}

function rowAt(data: Record<string, HeatmapMetrics[]>, index: number): Record<string, number> {
  const row: Record<string, number> = {}
  if (index < 0) return row
  for (const [symbol, metrics] of Object.entries(data)) {
    if (metrics[index]) row[symbol] = metrics[index].daysSinceHigh
  }
  return row
}

function formatPct(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

function latestSignal(model: STModelResult, symbol: string): STSignalPoint | undefined {
  return model.rows
    .filter((row) => row.symbol === symbol && signals(row).length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
}

function signalChanged(today?: STSignalPoint, yesterday?: STSignalPoint): boolean {
  return signals(today).join('|') !== signals(yesterday).join('|')
}

function statusTone(status?: string) {
  if (status === 'open') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'closed') return 'text-muted-foreground'
  return 'text-amber-600 dark:text-amber-400'
}

function ChangeIcon({ tone }: { tone: DeskChange['tone'] }) {
  if (tone === 'signal') return <Sparkles className="h-4 w-4 text-emerald-500" />
  if (tone === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500" />
  if (tone === 'market') return <TrendingUp className="h-4 w-4 text-primary" />
  return <CircleMinus className="h-4 w-4 text-muted-foreground" />
}

function SignalPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
      {children}
    </span>
  )
}

export function TradingDeskToday() {
  const reduceMotion = useReducedMotion()
  const market = useSWR<MarketResponse>(MARKET_URL, fetcher, { refreshInterval: 300_000, keepPreviousData: true })
  const st = useSWR<STResponse>(ST_URL, fetcher, { refreshInterval: 300_000, keepPreviousData: true })

  const marketData = market.data
  const model = st.data
  const isLoading = (!marketData && market.isLoading) || (!model && st.isLoading)
  const isRefreshing = market.isValidating || st.isValidating

  const marketSummary = marketData
    ? computeSignalSummary(marketData.basisHigh, marketData.basisClose, marketData.dates)
    : null
  const latestMarketRow = marketData ? extractLatestRow(marketData.basisClose, marketData.dates) : {}
  const divergences = marketData ? detectDivergences(latestMarketRow, 2) : []
  const previousMarketRow = marketData ? rowAt(marketData.basisClose, marketData.dates.length - 2) : {}
  const previousMarketRegime = Object.keys(previousMarketRow).length
    ? computeRegime(computeBreadth(previousMarketRow))
    : null

  const modelDate = model?.dates[0]
  const priorModelDate = model?.dates[1]
  const representative = modelDate && model ? model.byDate[modelDate]?.[model.symbols[0]] : undefined
  const bullLayerAvailable = Boolean(
    representative
    && representative.regimes.sma !== 'Unavailable'
    && representative.regimes.nhnl !== 'Unavailable'
    && representative.regimes.dbe !== 'Unavailable'
  )
  const coreModelLive = Boolean(model && model.health.staleSymbols.length === 0)

  const activeModelPoints = model && modelDate
    ? model.symbols
        .map((symbol) => model.byDate[modelDate]?.[symbol])
        .filter((point): point is STSignalPoint => Boolean(point) && signals(point).length > 0)
    : []

  const changes: DeskChange[] = []
  if (model && modelDate && priorModelDate) {
    for (const symbol of model.symbols) {
      const today = model.byDate[modelDate]?.[symbol]
      const yesterday = model.byDate[priorModelDate]?.[symbol]
      if (!signalChanged(today, yesterday)) continue
      const now = signals(today)
      const before = signals(yesterday)
      if (now.length) {
        changes.push({
          key: `st-${symbol}-${modelDate}`,
          title: `${symbol}: ${now.join(' · ')}`,
          detail: before.length ? `Changed from ${before.join(' · ')} on ${priorModelDate}` : `New model signal on ${modelDate}`,
          tone: 'signal',
        })
      } else if (before.length) {
        changes.push({
          key: `st-clear-${symbol}-${modelDate}`,
          title: `${symbol}: prior signal cleared`,
          detail: `${before.join(' · ')} was active on ${priorModelDate}`,
          tone: 'quiet',
        })
      }
    }
  }

  if (marketSummary && previousMarketRegime && marketSummary.regime.label !== previousMarketRegime.label) {
    changes.push({
      key: 'market-regime',
      title: `Market regime: ${marketSummary.regime.label}`,
      detail: `Changed from ${previousMarketRegime.label} on the prior session`,
      tone: 'market',
    })
  }
  marketSummary?.rejections.slice(0, 2).forEach((item) => {
    changes.push({
      key: `reject-${item.symbol}`,
      title: `${item.symbol}: breakout rejection`,
      detail: `Touched a new intraday high but closed ${item.closeDays} day${item.closeDays === 1 ? '' : 's'} from its high`,
      tone: 'warning',
    })
  })
  marketSummary?.confirmations.slice(0, 2).forEach((item) => {
    changes.push({
      key: `confirm-${item.symbol}`,
      title: `${item.symbol}: new high confirmed`,
      detail: 'Intraday and closing-basis highs both reset to zero days',
      tone: 'market',
    })
  })
  if (!changes.length && model && marketData) {
    changes.push({
      key: 'quiet-session',
      title: 'No major state change detected',
      detail: 'No new ST signal change or market-regime shift in the latest completed sessions.',
      tone: 'quiet',
    })
  }

  const visibleChanges = changes.slice(0, 5)
  const marketStatus = marketData?.meta?.marketStatus || st.data?.meta?.marketStatus || 'unknown'
  const dataAttention = Boolean(
    market.error
    || st.error
    || model?.health.staleSymbols.length
    || model?.health.unavailableSources.length
    || marketData?.sanity?.staleSymbols?.length
  )

  const container = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: reduceMotion ? 0 : 0.055 } },
  }
  const item = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 10 },
    visible: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.28, ease: 'easeOut' as const } },
  }

  const refresh = () => {
    market.mutate()
    st.mutate()
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/tucson-trader-logo-small.png" alt="Tucson Trader" width={42} height={42} className="rounded-lg" priority />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold sm:text-base">Tucson Trader</h1>
                <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline">TODAY</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">Dad&apos;s trading desk</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/market"><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Market</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/st-model"><Activity className="mr-1.5 h-3.5 w-3.5" />Dad&apos;s Model</Link>
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={refresh} disabled={isRefreshing} aria-label="Refresh trading desk">
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] space-y-5 px-3 py-4 sm:px-5 sm:py-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[55vh] items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Building today&apos;s desk…</div>
            </motion.div>
          ) : (
            <motion.div key="desk" variants={container} initial="hidden" animate="visible" className="space-y-5">
              <motion.section variants={item} className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
                <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 left-1/4 h-44 w-44 rounded-full bg-emerald-500/8 blur-3xl" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn('inline-flex items-center gap-1.5 font-medium capitalize', statusTone(marketStatus))}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', marketStatus === 'open' ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/60')} />
                        Market {marketStatus}
                      </span>
                      {modelDate && <><span>•</span><span>Model date {modelDate}</span></>}
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Trading Desk</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                      One factual view of what the market is doing and what Don&apos;s model is saying. No combined score, no invented trade recommendation.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button asChild className="group">
                      <Link href="/st-model">Dad&apos;s Model <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link>
                    </Button>
                    <Button asChild variant="outline" className="group">
                      <Link href="/market">Market <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link>
                    </Button>
                  </div>
                </div>
              </motion.section>

              <motion.section variants={container} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <motion.div variants={item} whileHover={reduceMotion ? undefined : { y: -2 }} className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Market regime</span><Gauge className="h-4 w-4 text-primary" /></div>
                  <div className="mt-2 text-lg font-semibold">{marketSummary?.regime.label || 'Unavailable'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {marketSummary ? `${marketSummary.regime.breadth.hotCount}/${marketSummary.regime.breadth.total} indices near highs` : 'Waiting for market context'}
                  </div>
                </motion.div>
                <motion.div variants={item} whileHover={reduceMotion ? undefined : { y: -2 }} className={cn('rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md', activeModelPoints.length ? 'border-emerald-500/35' : 'border-border')}>
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Dad&apos;s model</span><Sparkles className={cn('h-4 w-4', activeModelPoints.length ? 'text-emerald-500' : 'text-muted-foreground')} /></div>
                  <div className="mt-2 text-lg font-semibold">{activeModelPoints.length} active {activeModelPoints.length === 1 ? 'symbol' : 'symbols'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Std / Alt signals from latest completed model session</div>
                </motion.div>
                <motion.div variants={item} whileHover={reduceMotion ? undefined : { y: -2 }} className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Bull confirmation</span>{bullLayerAvailable ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}</div>
                  <div className={cn('mt-2 text-lg font-semibold', bullLayerAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{bullLayerAvailable ? 'Available' : 'Limited'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Legacy confirmation is never approximated</div>
                </motion.div>
                <motion.div variants={item} whileHover={reduceMotion ? undefined : { y: -2 }} className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Data health</span>{dataAttention ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}</div>
                  <div className="mt-2 text-lg font-semibold">{dataAttention ? 'Review' : 'Current'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Core model {coreModelLive ? 'current' : 'needs attention'} · market feed {market.error ? 'error' : 'online'}</div>
                </motion.div>
              </motion.section>

              <motion.section variants={item} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">What changed</h3></div>
                    <p className="mt-1 text-xs text-muted-foreground">Changes between the latest completed sessions, plus current market confirmations/rejections.</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">{visibleChanges.length} items</span>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {visibleChanges.map((change, index) => (
                    <motion.div
                      key={change.key}
                      initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduceMotion ? 0 : index * 0.045, duration: 0.22 }}
                      className="flex min-w-0 items-start gap-3 rounded-lg border border-border/70 bg-muted/15 p-3"
                    >
                      <div className="mt-0.5 shrink-0"><ChangeIcon tone={change.tone} /></div>
                      <div className="min-w-0"><div className="text-sm font-medium">{change.title}</div><div className="mt-0.5 text-xs leading-5 text-muted-foreground">{change.detail}</div></div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>

              <motion.section variants={container} className="grid gap-4 lg:grid-cols-2">
                <motion.article variants={item} whileHover={reduceMotion ? undefined : { y: -2 }} className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-primary/8 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h3 className="font-semibold">Market Dashboard</h3></div><p className="mt-1 text-xs text-muted-foreground">What is the market doing?</p></div>
                      <Button asChild variant="ghost" size="sm"><Link href="/market">Open <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3 border-y border-border/60 py-4">
                      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Regime</div><div className="mt-1 text-sm font-semibold">{marketSummary?.regime.label || '—'}</div></div>
                      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Confirmed</div><div className="mt-1 text-sm font-semibold">{marketSummary?.confirmations.length ?? '—'}</div></div>
                      <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Rejected</div><div className="mt-1 text-sm font-semibold">{marketSummary?.rejections.length ?? '—'}</div></div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {divergences.length ? divergences.map((divergence) => (
                        <div key={divergence.type} className="flex items-start justify-between gap-3 text-xs"><span className="font-medium">{divergence.title}</span><span className="shrink-0 text-muted-foreground">{divergence.confidence}</span></div>
                      )) : <div className="text-xs text-muted-foreground">No configured cross-index divergence is active.</div>}
                    </div>
                  </div>
                </motion.article>

                <motion.article variants={item} whileHover={reduceMotion ? undefined : { y: -2 }} className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-emerald-500/8 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" /><h3 className="font-semibold">Dad&apos;s Model</h3></div><p className="mt-1 text-xs text-muted-foreground">What is Don&apos;s system saying?</p></div>
                      <Button asChild variant="ghost" size="sm"><Link href="/st-model">Open <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
                    </div>
                    <div className="mt-5 min-h-[86px] space-y-2 border-y border-border/60 py-4">
                      {activeModelPoints.length ? activeModelPoints.slice(0, 4).map((point) => (
                        <div key={point.symbol} className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{point.symbol}</span><div className="flex flex-wrap justify-end gap-1">{signals(point).map((signal) => <SignalPill key={`${point.symbol}-${signal}`}>{signal}</SignalPill>)}</div></div>
                      )) : <div className="flex h-14 items-center gap-2 text-sm text-muted-foreground"><CircleMinus className="h-4 w-4" />No Std/Alt signal is active on the latest model date.</div>}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs"><span className="text-muted-foreground">Full Bull confirmation</span><span className={cn('font-medium', bullLayerAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{bullLayerAvailable ? 'Available' : 'Limited'}</span></div>
                  </div>
                </motion.article>
              </motion.section>

              {model && modelDate && (
                <motion.section variants={item} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div><h3 className="text-sm font-semibold">Today by symbol</h3><p className="mt-1 text-xs text-muted-foreground">A quick read only. Open Dad&apos;s Model for formulas, context and history.</p></div>
                    <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex"><Link href="/st-model">Full model</Link></Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {model.symbols.map((symbol, index) => {
                      const point = model.byDate[modelDate]?.[symbol]
                      const active = signals(point)
                      const last = latestSignal(model, symbol)
                      return (
                        <motion.div
                          key={symbol}
                          initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: reduceMotion ? 0 : index * 0.035, duration: 0.2 }}
                          whileHover={reduceMotion ? undefined : { y: -2 }}
                          className={cn('min-w-0 rounded-lg border p-3 transition-colors', active.length ? 'border-emerald-500/35 bg-emerald-500/[0.035]' : point ? 'border-border bg-background/30' : 'border-amber-500/30 bg-amber-500/[0.025]')}
                        >
                          <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-semibold">{symbol}</div><div className={cn('mt-0.5 text-[11px]', active.length ? 'text-emerald-600 dark:text-emerald-400' : point ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>{active.length ? 'Signal active' : point ? 'No signal' : 'Data unavailable'}</div></div>{active.length ? <Sparkles className="h-4 w-4 text-emerald-500" /> : <CircleMinus className="h-4 w-4 text-muted-foreground/50" />}</div>
                          <div className="mt-3 flex min-h-5 flex-wrap gap-1">{active.length ? active.map((signal) => <SignalPill key={signal}>{signal}</SignalPill>) : <span className="text-[11px] text-muted-foreground">Std — · Alt —</span>}</div>
                          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-[11px]"><div><span className="text-muted-foreground">RSI</span><div className="font-medium">{point?.rsi == null ? '—' : point.rsi.toFixed(1)}</div></div><div><span className="text-muted-foreground">11d fall</span><div className="font-medium">{formatPct(point?.pctFall ?? null)}</div></div><div><span className="text-muted-foreground">Last</span><div className="truncate font-medium">{last?.date?.slice(5) || '—'}</div></div></div>
                        </motion.div>
                      )
                    })}
                  </div>
                </motion.section>
              )}

              <motion.section variants={item} className="flex flex-col gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2"><LayoutDashboard className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Today summarizes the two systems side by side. It does not combine them into a new trading score or recommendation.</span></div>
                <div className="shrink-0">Market + Dad&apos;s Model remain independently inspectable.</div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-2 backdrop-blur sm:hidden" aria-label="Primary navigation">
        <div className="mx-auto grid max-w-sm grid-cols-3 gap-1">
          <Link href="/" className="flex flex-col items-center gap-1 rounded-md bg-muted px-2 py-1.5 text-[10px] font-medium"><LayoutDashboard className="h-4 w-4" />Today</Link>
          <Link href="/market" className="flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground"><BarChart3 className="h-4 w-4" />Market</Link>
          <Link href="/st-model" className="flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground"><Activity className="h-4 w-4" />Model</Link>
        </div>
      </nav>
      <div className="h-16 sm:hidden" />
    </div>
  )
}
