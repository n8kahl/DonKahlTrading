'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CircleMinus, History, LayoutGrid, Sheet, Sparkles } from 'lucide-react'
import type { STModelResult, STSignalPoint } from '@/lib/st-model'
import { cn } from '@/lib/utils'
import { STModelTable } from '@/components/st-model-table'

type ViewMode = 'today' | 'history' | 'spreadsheet'

type ActiveSignal = {
  name: 'Std' | 'Alt' | 'Bull'
  value: 'B' | 'EB'
}

function formatPercent(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

function activeSignals(point?: STSignalPoint): ActiveSignal[] {
  if (!point) return []
  const signals: ActiveSignal[] = []
  if (point.std) signals.push({ name: 'Std', value: point.std })
  if (point.alt) signals.push({ name: 'Alt', value: point.alt })
  if (point.bull) signals.push({ name: 'Bull', value: point.bull })
  return signals
}

function signalPill(signal: ActiveSignal, key?: string) {
  const extreme = signal.value === 'EB'
  return (
    <span
      key={key ?? signal.name}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        extreme
          ? 'bg-emerald-600 text-white'
          : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
      )}
    >
      {signal.name} {signal.value}
    </span>
  )
}

function regimePill(label: string, value: string) {
  const positive = value === 'Bull' || value === 'PY_Thrust'
  const negative = value === 'Bear' || value === 'PY_Danger'
  const unavailable = value === 'Unavailable' || value === '—'
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'shrink-0 text-xs font-medium',
          positive && 'text-emerald-600 dark:text-emerald-400',
          negative && 'text-red-600 dark:text-red-400',
          unavailable && 'text-muted-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium tabular-nums">{value}</div>
    </div>
  )
}

function SymbolCard({ symbol, point, lastSignal }: { symbol: string; point?: STSignalPoint; lastSignal?: STSignalPoint }) {
  const signals = activeSignals(point)
  const lastSignals = activeSignals(lastSignal)
  const hasPoint = Boolean(point)
  const hasSignal = signals.length > 0
  const status = !hasPoint ? 'Data unavailable' : hasSignal ? 'Signal active' : 'No signal today'

  return (
    <article
      className={cn(
        'min-w-0 rounded-lg border bg-card p-4',
        hasSignal ? 'border-emerald-500/50' : !hasPoint ? 'border-amber-500/40' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">{symbol}</h3>
          <div
            className={cn(
              'mt-1 text-sm font-medium',
              hasSignal && 'text-emerald-600 dark:text-emerald-400',
              !hasPoint && 'text-amber-600 dark:text-amber-400',
              hasPoint && !hasSignal && 'text-muted-foreground'
            )}
          >
            {status}
          </div>
        </div>
        {hasSignal ? (
          <Sparkles className="h-5 w-5 shrink-0 text-emerald-500" />
        ) : !hasPoint ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        ) : (
          <CircleMinus className="h-5 w-5 shrink-0 text-muted-foreground/60" />
        )}
      </div>

      <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
        {!hasPoint ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">No model-date bar for this symbol.</span>
        ) : signals.length ? (
          signals.map((signal) => signalPill(signal))
        ) : (
          <span className="text-xs text-muted-foreground">Std — · Alt — · Bull —</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
        <Metric label="RSI" value={point?.rsi == null ? '—' : point.rsi.toFixed(1)} />
        <Metric label="11d fall" value={formatPercent(point?.pctFall ?? null)} />
        <Metric label="11d rise" value={formatPercent(point?.pctRise ?? null)} />
      </div>

      <div className="mt-4 rounded-md bg-muted/30 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Last signal</div>
        {lastSignal && lastSignals.length ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium tabular-nums">{lastSignal.date}</span>
            {lastSignals.map((signal) => signalPill(signal, `${lastSignal.date}-${signal.name}`))}
          </div>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">No signal in loaded history</div>
        )}
      </div>

      <details className="group mt-3 border-t border-border/60 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
          Inputs & context
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {regimePill('SMA', point?.regimes.sma ?? '—')}
          {regimePill('NH/NL', point?.regimes.nhnl ?? '—')}
          {regimePill('DBE', point?.regimes.dbe ?? '—')}
          {regimePill('PY', point?.pyImpact || 'Neutral')}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Days from high: <span className="font-medium text-foreground">{point?.daysFromHigh ?? '—'}</span></div>
          <div>QQQ 63d high: <span className="font-medium text-foreground">{point?.qqqDaysSince63dHigh ?? '—'}</span></div>
        </div>
      </details>
    </article>
  )
}

function HistoryView({ model }: { model: STModelResult }) {
  const signals = useMemo(
    () => model.rows.filter((row) => activeSignals(row).length > 0).sort((a, b) => b.date.localeCompare(a.date)),
    [model.rows]
  )

  if (!signals.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No Std, Alt, or Bull signals occurred in the loaded history.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {signals.map((row) => (
        <div key={`${row.date}-${row.symbol}`} className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[110px_80px_1fr_auto] sm:items-center">
          <div className="text-xs font-medium tabular-nums">{row.date}</div>
          <div className="text-sm font-semibold">{row.symbol}</div>
          <div className="flex flex-wrap gap-1.5">{activeSignals(row).map((signal) => signalPill(signal, `${row.date}-${row.symbol}-${signal.name}`))}</div>
          <div className="grid grid-cols-3 gap-3 text-right sm:flex sm:gap-4">
            <Metric label="RSI" value={row.rsi == null ? '—' : row.rsi.toFixed(1)} />
            <Metric label="Fall" value={formatPercent(row.pctFall)} />
            <Metric label="Rise" value={formatPercent(row.pctRise)} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function STModelDashboard({ model, marketStatus }: { model: STModelResult; marketStatus?: string }) {
  const [view, setView] = useState<ViewMode>('today')
  const today = model.dates[0]
  const todayPoints = model.symbols.map((symbol) => model.byDate[today]?.[symbol]).filter((point): point is STSignalPoint => Boolean(point))
  const activeToday = todayPoints.filter((point) => activeSignals(point).length > 0)
  const representative = todayPoints[0]
  const coreLive = model.health.staleSymbols.length === 0
  const bullLayerAvailable = Boolean(
    representative
    && representative.regimes.nhnl !== 'Unavailable'
    && representative.regimes.dbe !== 'Unavailable'
    && representative.regimes.sma !== 'Unavailable'
  )

  const lastSignalBySymbol = useMemo(() => {
    const result: Record<string, STSignalPoint | undefined> = {}
    for (const symbol of model.symbols) {
      result[symbol] = model.rows
        .filter((row) => row.symbol === symbol && activeSignals(row).length > 0)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
    }
    return result
  }, [model.rows, model.symbols])

  const views: Array<{ id: ViewMode; label: string; icon: typeof LayoutGrid }> = [
    { id: 'today', label: 'Today', icon: LayoutGrid },
    { id: 'history', label: 'Signal history', icon: History },
    { id: 'spreadsheet', label: 'Spreadsheet view', icon: Sheet },
  ]

  return (
    <div className="min-w-0 space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Core signals</div>
          <div className="mt-1 flex items-center gap-2 text-base font-semibold">
            {coreLive ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
            {coreLive ? 'Live' : 'Needs attention'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Price data through {model.health.priceDataThrough || '—'}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Active today</div>
          <div className="mt-1 text-base font-semibold">{activeToday.length} of {model.symbols.length} symbols</div>
          <div className="mt-1 text-xs text-muted-foreground">Blank workbook cells are shown here as “No signal.”</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Bull layer</div>
          <div className={cn('mt-1 text-base font-semibold', bullLayerAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
            {bullLayerAvailable ? 'Available' : 'Limited'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Legacy confirmation is never approximated.</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Market</div>
          <div className="mt-1 text-base font-semibold capitalize">{marketStatus || 'Unknown'}</div>
          <div className="mt-1 text-xs text-muted-foreground">Model date {today || '—'}</div>
        </div>
      </section>

      {!bullLayerAvailable && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Core ST signals are live; full Bull confirmation is limited</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Std and Alt continue to run normally. Bull remains off whenever an exact legacy regime input is unavailable.
              </p>
              <details className="group mt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  Data health details
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {model.health.unavailableSources.length > 0 && <div>Unavailable sources: {model.health.unavailableSources.join(', ')}</div>}
                  <div>Nasdaq breadth: {model.health.breadthMode === 'unavailable' ? 'Unavailable / warming' : model.health.breadthMode}</div>
                  {model.health.notes.map((note) => <div key={note}>{note}</div>)}
                </div>
              </details>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Market regime</h2>
            <p className="text-xs text-muted-foreground">Context used by the workbook’s Bull layer.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {regimePill('SMA', representative?.regimes.sma ?? '—')}
          {regimePill('Nasdaq NH/NL', representative?.regimes.nhnl ?? '—')}
          {regimePill('DBE', representative?.regimes.dbe ?? '—')}
          {regimePill('Presidential cycle', representative?.pyImpact || 'Neutral')}
        </div>
      </section>

      <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-muted/20 p-1" role="tablist" aria-label="ST Model views">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors',
              view === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {view === 'today' && (
        <section aria-label="Today by symbol">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Today by symbol</h2>
            <p className="text-xs text-muted-foreground">A blank Excel cell means no signal—not missing data.</p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {model.symbols.map((symbol) => (
              <SymbolCard
                key={symbol}
                symbol={symbol}
                point={model.byDate[today]?.[symbol]}
                lastSignal={lastSignalBySymbol[symbol]}
              />
            ))}
          </div>
        </section>
      )}

      {view === 'history' && (
        <section aria-label="Signal history">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Signal history</h2>
            <p className="text-xs text-muted-foreground">Only dates where Std, Alt, or Bull actually fired.</p>
          </div>
          <HistoryView model={model} />
        </section>
      )}

      {view === 'spreadsheet' && (
        <section className="min-w-0" aria-label="Spreadsheet view">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Spreadsheet view</h2>
            <p className="text-xs text-muted-foreground">Reference view for comparing Tucson Trader with Don’s Excel workbook.</p>
          </div>
          <div className="min-w-0 max-w-full">
            <STModelTable model={model} />
          </div>
        </section>
      )}
    </div>
  )
}
