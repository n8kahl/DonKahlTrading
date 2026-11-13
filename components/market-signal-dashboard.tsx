'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { MarketSignalIndexConfig, MarketSignalIndexPoint, MarketSignalResult, MarketSignalRow } from '@/lib/market-signal'
import { cn } from '@/lib/utils'
import { MarketSignalTable, SIGNAL_CLASS, formatClose, formatRoc, rocClass } from '@/components/market-signal-table'

const RECENT_ROWS = 60

type RowRange = 'recent' | 'all'

function signalReason(row: MarketSignalRow, model: MarketSignalResult): string {
  const { config, indexes } = model
  const points = indexes.map((index) => row.indexes[index.key])
  const troughs = points.filter((point) => point?.trough).length
  const positives = points.filter((point) => (point?.positiveMoves10d ?? 0) >= 1).length
  const depth = `${Math.round(config.troughDepth * 100)}%`
  const threshold = `+${(config.moveThreshold * 100).toFixed(1)}%`
  const total = indexes.length
  if (row.signal === 'WARNING') {
    return `${troughs} of ${total} indexes closed ${depth} or more below their highest close since ${config.peakStartDate}.`
  }
  if (row.signal === 'RECOVERY') {
    return `${positives} of ${total} indexes have at least one ${threshold} day in the last ${config.windowTradingDays} trading days.`
  }
  return `${troughs} of ${total} indexes are in a ${depth} trough and ${positives} of ${total} have a ${threshold} day in the last ${config.windowTradingDays} trading days; neither rule reaches ${config.signalQuorum}.`
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 inline-block truncate text-sm font-medium tabular-nums', className && 'rounded px-1', className)}>{value}</div>
    </div>
  )
}

function IndexCard({ index, point, model }: { index: MarketSignalIndexConfig; point: MarketSignalIndexPoint | null; model: MarketSignalResult }) {
  const { config } = model
  return (
    <article className={cn('min-w-0 rounded-lg border bg-card p-4', point ? 'border-border' : 'border-amber-500/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">{index.label}</h3>
          <div className="text-xs text-muted-foreground">{index.name}</div>
        </div>
        {point?.trough && (
          <span className="shrink-0 rounded bg-[#15803D] px-2 py-0.5 text-xs font-bold text-white">TROUGH</span>
        )}
      </div>
      {point ? (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 sm:grid-cols-3">
          <Metric label="Close" value={formatClose(point.close)} />
          <Metric label="ROC" value={formatRoc(point.roc) || '—'} className={rocClass(point.roc, config.moveThreshold)} />
          <Metric label="Days since high" value={String(point.daysSinceHigh)} />
          <Metric label={`${config.windowTradingDays}d +${(config.moveThreshold * 100).toFixed(1)}% days`} value={point.positiveMoves10d == null ? '—' : String(point.positiveMoves10d)} />
          <Metric label={`${config.windowTradingDays}d moves ≥ ${(config.moveThreshold * 100).toFixed(1)}%`} value={point.bigMoves10d == null ? '—' : String(point.bigMoves10d)} />
        </div>
      ) : (
        <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">No close for this date.</div>
      )}
    </article>
  )
}

export function MarketSignalDashboard({ model, partialDailyBarPolicy }: { model: MarketSignalResult; partialDailyBarPolicy?: string }) {
  const [range, setRange] = useState<RowRange>('recent')
  const { config, indexes, latest, health } = model

  // One extra leading row lets the first displayed row compare against the previous trading day.
  const showAll = range === 'all' || model.rows.length <= RECENT_ROWS
  const rowsForTable = useMemo(
    () => (showAll ? model.rows : model.rows.slice(-(RECENT_ROWS + 1))),
    [model.rows, showAll]
  )

  const threshold = `${(config.moveThreshold * 100).toFixed(1)}%`
  const depth = `${Math.round(config.troughDepth * 100)}%`

  return (
    <div className="space-y-4">
      {health.status !== 'current' && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4" aria-label="Data health">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0 space-y-1 text-xs">
              <div className="text-sm font-semibold">{health.status === 'stale' ? 'Index data is out of step' : 'Index data is incomplete'}</div>
              {health.notes.map((note) => <div key={note}>{note}</div>)}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-4" aria-label="Latest signal">
        {latest ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span data-testid="latest-signal" className={cn('inline-flex w-fit shrink-0 items-center rounded-md px-4 py-2 text-lg tracking-wide', SIGNAL_CLASS[latest.signal!])}>
              {latest.signal}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Signal for <span className="tabular-nums">{latest.date}</span></h2>
              <p className="text-xs text-muted-foreground">{signalReason(latest, model)}</p>
              {partialDailyBarPolicy === 'current session excluded' && (
                <p className="mt-1 text-xs text-muted-foreground">The market is open; today is added after the close.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No signal yet: all three indexes need a daily change for the same date.</div>
        )}
      </section>

      <section aria-label="Indexes">
        <div className="grid min-w-0 gap-3 md:grid-cols-3">
          {indexes.map((index) => (
            <IndexCard key={index.key} index={index} point={latest?.indexes[index.key] ?? null} model={model} />
          ))}
        </div>
      </section>

      <section aria-label="Market Signal table" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Daily table</h2>
            <p className="text-xs text-muted-foreground">Newest first. Market holidays have no row.</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-muted/20 p-1" role="tablist" aria-label="Rows shown">
            {([
              ['recent', `Last ${RECENT_ROWS} days`],
              ['all', `All since ${config.peakStartDate}`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={range === id}
                onClick={() => setRange(id)}
                className={cn(
                  'inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  range === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <MarketSignalTable rows={rowsForTable} indexes={indexes} config={config} hasLeadingContextRow={!showAll} />
      </section>

      <section className="rounded-lg border border-border bg-card p-4 text-xs" aria-label="Rules">
        <h2 className="text-sm font-semibold">How the signal is worked out</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li><span className="font-medium text-foreground">ROC</span> is the close divided by the last available close, minus 1. Moves of {threshold} or more are filled green (up) or red (down).</li>
          <li><span className="font-medium text-foreground">WARNING</span> when at least {config.signalQuorum} of {indexes.length} indexes close {depth} or more below their highest close since {config.peakStartDate}.</li>
          <li><span className="font-medium text-foreground">RECOVERY</span> otherwise, when at least {config.signalQuorum} of {indexes.length} have one or more +{threshold} days in the last {config.windowTradingDays} trading days.</li>
          <li><span className="font-medium text-foreground">WATCH</span> otherwise.</li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          These rules are an adaptation of a forum author&apos;s table, not a verified reproduction of it. Signals are descriptive, not buy or sell advice.
        </p>
      </section>
    </div>
  )
}
