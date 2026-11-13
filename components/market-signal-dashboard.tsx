'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { MarketSignalIndexConfig, MarketSignalIndexPoint, MarketSignalResult, MarketSignalRow } from '@/lib/market-signal'
import { cn } from '@/lib/utils'
import {
  BELOW_HIGH_CLASS,
  MarketSignalTable,
  SIGNAL_CLASS,
  TROUGH_DATE_CLASS,
  formatClose,
  formatNet,
  formatRoc,
  netClass,
  rocClass,
} from '@/components/market-signal-table'

const RECENT_ROWS = 60

type RowRange = 'recent' | 'all'

function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`
}

function signalReason(row: MarketSignalRow, model: MarketSignalResult): string {
  const { config, indexes } = model
  const points = indexes.map((index) => row.indexes[index.key])
  const netPositive = points.filter((point) => (point?.netMoves10d ?? 0) >= 1).length
  const below = points.filter((point) => point?.belowHigh).length
  const depth = percent(config.belowHighDepth)
  const total = indexes.length
  const window = `${config.windowTradingDays}-day net`
  if (row.signal === 'RECOVERY') {
    return `${netPositive} of ${total} indexes have a ${window} count of +1 or more.`
  }
  if (row.signal === 'WARNING') {
    return `${below} of ${total} indexes closed ${depth} or more below their highest close since ${config.peakStartDate}, and only ${netPositive} of ${total} have a ${window} count of +1 or more.`
  }
  return `${netPositive} of ${total} indexes have a ${window} count of +1 or more and ${below} of ${total} are ${depth} or more below their high; neither rule reaches ${config.signalQuorum}.`
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
  const threshold = percent(config.moveThreshold, 1)
  return (
    <article className={cn('min-w-0 rounded-lg border bg-card p-4', point ? 'border-border' : 'border-amber-500/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">{index.label}</h3>
          <div className="text-xs text-muted-foreground">{index.name}</div>
        </div>
        {point?.belowHigh && (
          <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs', BELOW_HIGH_CLASS)}>{percent(config.belowHighDepth)} below high</span>
        )}
      </div>
      {point ? (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 sm:grid-cols-3">
          <Metric label="Close" value={formatClose(point.close)} />
          <Metric label="ROC" value={formatRoc(point.roc) || '—'} className={rocClass(point.roc, config.moveThreshold)} />
          <Metric label={`${config.windowTradingDays}d net`} value={formatNet(point.netMoves10d) || '—'} className={netClass(point.netMoves10d)} />
          <Metric label="Days since high" value={String(point.daysSinceHigh)} />
          <Metric label={`${config.windowTradingDays}d +${threshold} days`} value={point.upDays10d == null ? '—' : String(point.upDays10d)} />
        </div>
      ) : (
        <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">No close for this date.</div>
      )}
    </article>
  )
}

export function MarketSignalDashboard({ model, partialDailyBarPolicy }: { model: MarketSignalResult; partialDailyBarPolicy?: string }) {
  const [range, setRange] = useState<RowRange>('recent')
  const { config, indexes, latest, health, troughs } = model

  // One extra leading row lets the first displayed row compare against the previous trading day.
  const showAll = range === 'all' || model.rows.length <= RECENT_ROWS
  const rowsForTable = useMemo(
    () => (showAll ? model.rows : model.rows.slice(-(RECENT_ROWS + 1))),
    [model.rows, showAll]
  )

  const threshold = percent(config.moveThreshold, 1)
  const depth = percent(config.belowHighDepth)
  const swing = percent(config.troughSwing)
  const labelOf = (key: string) => indexes.find((index) => index.key === key)?.label ?? key
  const troughIndexLabels = config.troughIndexes.map(labelOf).join(', ')

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
            <p className="text-xs text-muted-foreground">
              Newest first. Market holidays have no row. <span className={cn('rounded px-1', TROUGH_DATE_CLASS)}>Highlighted dates</span> are {troughIndexLabels} troughs.
            </p>
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

      <section className="rounded-lg border border-border bg-card p-4 text-xs" aria-label="Trough dates">
        <h2 className="text-sm font-semibold">{troughIndexLabels} trough dates</h2>
        <p className="mt-1 text-muted-foreground">
          A trough is the lowest close after a fall of {swing} or more from a peak. It is only known in hindsight, once the close has rebounded {swing} or more from that low, so the newest low does not appear here until it is confirmed. For the live state, use the “{depth} below high” columns.
        </p>
        {troughs.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-xs tabular-nums" data-testid="trough-list">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">Trough date</th>
                  <th className="py-1 pr-4 font-medium">Index</th>
                  <th className="py-1 pr-4 text-right font-medium">Close</th>
                  <th className="py-1 pr-4 text-right font-medium">From peak</th>
                  <th className="py-1 pr-4 font-medium">Peak date</th>
                  <th className="py-1 font-medium">Confirmed on</th>
                </tr>
              </thead>
              <tbody>
                {[...troughs].reverse().map((trough) => (
                  <tr key={`${trough.index}-${trough.date}`} className="border-b border-border/50">
                    <td className="py-1 pr-4"><span className={cn('rounded px-1 font-medium', TROUGH_DATE_CLASS)}>{trough.date}</span></td>
                    <td className="py-1 pr-4">{labelOf(trough.index)}</td>
                    <td className="py-1 pr-4 text-right">{formatClose(trough.close)}</td>
                    <td className="py-1 pr-4 text-right">{percent(trough.decline, 1)}</td>
                    <td className="py-1 pr-4">{trough.peakDate}</td>
                    <td className="py-1">{trough.confirmedDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground">No confirmed trough since {config.peakStartDate}.</p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 text-xs" aria-label="Rules">
        <h2 className="text-sm font-semibold">How the signal is worked out</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li><span className="font-medium text-foreground">ROC</span> is the close divided by the previous trading day&apos;s close, minus 1. Moves of {threshold} or more are filled green (up) or red (down).</li>
          <li><span className="font-medium text-foreground">{config.windowTradingDays}d net</span> is the number of days up {threshold} or more minus the number of days down {threshold} or more, over the last {config.windowTradingDays} trading days including today.</li>
          <li><span className="font-medium text-foreground">Days since high</span> counts trading days since the highest close since {config.peakStartDate}.</li>
          <li><span className="font-medium text-foreground">RECOVERY</span> when at least {config.signalQuorum} of {indexes.length} net counts are +1 or more.</li>
          <li><span className="font-medium text-foreground">WARNING</span> otherwise, when at least {config.signalQuorum} of {indexes.length} indexes close {depth} or more below their highest close since {config.peakStartDate}.</li>
          <li><span className="font-medium text-foreground">WATCH</span> otherwise.</li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          The signal column is a rules-based reading of a forum author&apos;s table, not his own call. For example, he called his April 2025 “all go” on 2025-04-23, when the SOX net count alone turned +1, two days before this 2-of-3 rule shows RECOVERY. Signals are descriptive, not buy or sell advice.
        </p>
      </section>
    </div>
  )
}
