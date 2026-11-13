'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { RepairResult } from '@/lib/checkup/repair/job'

const BASIS_LABELS: Record<string, string> = {
  author: 'Following the author’s rules you added',
  notes: 'Following the workbook’s own notes',
  colours: 'Following what the colour rules show was meant',
  majority: 'Matching the rest of the column',
  practice: 'What an experienced trader would do',
  error: 'A plain slip',
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// -----------------------------------------------------------------------------
// While the repair runs
// -----------------------------------------------------------------------------

export function RepairProgress({
  fileName,
  stage,
  progress,
  steps,
  elapsedSeconds,
}: {
  fileName: string | null
  stage: string
  progress: string[]
  steps: number
  elapsedSeconds: number
}) {
  // Everything before the current stage is done; the current stage is the line with the spinner.
  const done = progress.filter((line) => line !== stage)
  return (
    <section className="rounded-lg border bg-card p-5 text-[17px] sm:p-6" data-testid="checkup-progress" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="h-8 w-8 shrink-0 animate-spin text-primary" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Working on your spreadsheet</h2>
          {fileName && <p className="truncate text-base text-muted-foreground">{fileName}</p>}
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {done.map((line, i) => (
          <li key={`${i}-${line}`} className="flex items-start gap-2.5 text-muted-foreground">
            <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
        <li className="flex items-start gap-2.5 font-medium" data-testid="checkup-stage">
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>{stage}</span>
        </li>
      </ul>

      <p className="mt-5 border-t border-border pt-4 text-base text-muted-foreground">
        This takes several minutes, sometimes ten or more. You can leave this page open and come back; your original file is
        not being changed.
        {elapsedSeconds > 0 && (
          <span className="ml-1 tabular-nums">
            Time so far: {clock(elapsedSeconds)}
            {steps > 0 ? `, ${steps} steps taken` : ''}.
          </span>
        )}
      </p>
    </section>
  )
}

// -----------------------------------------------------------------------------
// When it is done
// -----------------------------------------------------------------------------

function Fold({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex min-h-9 items-center gap-1 rounded-sm text-base font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        {open ? `Hide ${label}` : `Show ${label}`}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

export function RepairResults({ jobId, result, onReset }: { jobId: string; result: RepairResult; onReset: () => void }) {
  const { report, check } = result
  const effect = report?.effect
  const hasReading = Boolean(effect && effect.latestBefore && effect.latestAfter)
  const readingChanged = hasReading && effect!.latestBefore !== effect!.latestAfter

  return (
    <div className="space-y-5 text-[17px]" data-testid="checkup-repair-results">
      {/* File */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <FileSpreadsheet className="h-9 w-9 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold" title={result.fileName}>
              {result.fileName}
            </div>
            <div className="inline-flex items-center gap-1 text-base text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-500" aria-hidden />
              Your original file is never changed
            </div>
          </div>
        </div>
        <Button variant="outline" className="h-10 text-base" onClick={onReset}>
          Check another file
        </Button>
      </section>

      {/* Download */}
      {result.downloadable ? (
        <section className="rounded-lg border-2 border-emerald-600/50 bg-emerald-50 p-5 dark:bg-emerald-950/30 sm:p-6" data-testid="checkup-download">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">Your fixed copy is ready</h2>
              {report?.answer && <p className="mt-1 leading-relaxed">{report.answer}</p>}
              <Button asChild className="mt-4 h-12 px-6 text-lg">
                <a href={`/api/checkup/${jobId}/file`} download>
                  <Download className="h-5 w-5" aria-hidden />
                  Download fixed copy
                </a>
              </Button>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                The final test is to open it in Excel. Excel will work everything out again when it opens; then check that
                the latest row reads the way this page says. Keep your original until you are happy.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border-2 border-red-500/60 bg-red-50 p-5 dark:bg-red-950/30 sm:p-6" data-testid="checkup-no-download">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            <div>
              <h2 className="text-xl font-semibold">The fixed copy did not pass our safety check</h2>
              <p className="mt-1 leading-relaxed">
                So it is not being offered for download. Your original file has not been changed. Running the check-up again
                usually sorts this out.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* How the numbers changed */}
      {effect && (effect.cellsChanged > 0 || hasReading || effect.plain) && (
        <section className="rounded-lg border bg-card p-4 sm:p-5" data-testid="checkup-effect">
          <h2 className="text-xl font-semibold">How your numbers changed</h2>
          {hasReading && (
            <div className="mt-3 rounded-md border border-border bg-muted/30 p-4">
              <div className="text-base text-muted-foreground">
                {effect.headline || 'Latest reading'}
                {effect.latestDate ? ` on ${effect.latestDate}` : ''}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold">
                {readingChanged ? (
                  <>
                    <span className="text-muted-foreground line-through decoration-2">{effect.latestBefore}</span>
                    <ArrowRight className="h-6 w-6 text-muted-foreground" aria-hidden />
                    <span>{effect.latestAfter}</span>
                  </>
                ) : (
                  <span>
                    {effect.latestAfter} <span className="text-base font-normal text-muted-foreground">(same as before)</span>
                  </span>
                )}
              </div>
            </div>
          )}
          <ul className="mt-3 space-y-1">
            {effect.cellsChanged > 0 && <li>{plural(effect.cellsChanged, 'cell was', 'cells were')} corrected.</li>}
            {effect.daysChanged !== null && (
              <li>
                {effect.daysChanged === 0
                  ? `${effect.headline || 'The main result'} is the same on every day as before.`
                  : `${effect.headline || 'The main result'} now reads differently on ${plural(effect.daysChanged, 'day', 'days')}.`}
              </li>
            )}
          </ul>
          {effect.plain && <p className="mt-2 leading-relaxed">{effect.plain}</p>}
        </section>
      )}

      {/* What it does */}
      {report?.summary && (
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="text-xl font-semibold">What this spreadsheet does</h2>
          <p className="mt-2 leading-relaxed" data-testid="checkup-summary">
            {report.summary}
          </p>
        </section>
      )}

      {/* What was wrong */}
      {report && report.wrong.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What was wrong</h2>
          <ol className="space-y-3">
            {report.wrong.map((w, i) => (
              <li key={i} className="rounded-lg border border-l-4 border-l-red-500 bg-card p-4 sm:p-5" data-testid="checkup-wrong">
                <h3 className="text-lg font-semibold leading-snug">
                  <span className="text-muted-foreground">{i + 1}.</span> {w.title}
                </h3>
                <p className="mt-1.5 leading-relaxed">{w.explanation}</p>
                {w.where && <p className="mt-1.5 text-sm text-muted-foreground">{w.where}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* What was changed */}
      {report && report.changes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What was changed, and why</h2>
          <ol className="space-y-3">
            {report.changes.map((c, i) => (
              <li key={i} className="rounded-lg border border-l-4 border-l-emerald-600 bg-card p-4 sm:p-5" data-testid="checkup-change">
                <div className="flex items-start gap-3">
                  <Wrench className="mt-1 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold leading-snug">{c.title}</h3>
                    <p className="mt-1.5 leading-relaxed">{c.what}</p>
                    <p className="mt-1.5 leading-relaxed">
                      <span className="font-semibold">Why: </span>
                      {c.why}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {BASIS_LABELS[c.basis] ?? BASIS_LABELS.error}
                      {c.where ? ` · ${c.where}` : ''}
                      {c.cells > 0 ? ` · ${plural(c.cells, 'cell', 'cells')}` : ''}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!report && result.downloadable && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-base text-muted-foreground">
          The written explanation of the changes could not be read this time. The fixed copy itself passed the double-check
          below.
        </p>
      )}

      {/* Our own check */}
      <section className="rounded-lg border bg-card p-4 sm:p-5" data-testid="checkup-aftercheck">
        <h2 className="text-xl font-semibold">Our own double-check of the fixed copy</h2>
        <p className="mt-1 text-base text-muted-foreground">
          A separate, plain set of checks was run on the fixed copy afterwards, without taking the repair’s word for it.
        </p>
        <ul className="mt-3 space-y-2">
          {check.lines.map((line, i) => (
            <li key={i} className="flex items-start gap-2.5 leading-relaxed">
              {check.verdict === 'fail' ? (
                <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
              ) : (
                <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
              )}
              <span>{line}</span>
            </li>
          ))}
        </ul>
        {(check.remaining.length > 0 || check.fresh.length > 0) && (
          <div className="mt-3">
            <Fold label="what is still flagged">
              <ul className="space-y-1.5 text-base">
                {check.remaining.map((s) => (
                  <li key={`r-${s.key}`}>
                    <span className="font-medium">Still flagged:</span> {s.title} <span className="text-muted-foreground">({s.where})</span>
                  </li>
                ))}
                {check.fresh.map((s) => (
                  <li key={`f-${s.key}`}>
                    <span className="font-medium">New:</span> {s.title} <span className="text-muted-foreground">({s.where})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-base text-muted-foreground">
                These are often rows that are meant to be different, such as a first row with no day before it. Read the
                “left alone” list below for the reasons.
              </p>
            </Fold>
          </div>
        )}
        {report?.verification.plain && <p className="mt-3 leading-relaxed">{report.verification.plain}</p>}
      </section>

      {/* Left alone */}
      {report && report.notChanged.length > 0 && (
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="text-xl font-semibold">Noticed and left alone</h2>
          <ul className="mt-2 space-y-2">
            {report.notChanged.map((n, i) => (
              <li key={i} className="leading-relaxed">
                <span className="font-semibold">{n.title}.</span> {n.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.seconds !== null && (
        <p className="pb-6 text-center text-sm text-muted-foreground">
          This check-up took {clock(result.seconds)}.
        </p>
      )}
    </div>
  )
}
