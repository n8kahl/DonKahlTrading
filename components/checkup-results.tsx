'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileSpreadsheet,
  Info,
  Paintbrush,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { CheckupResult, ExampleCell, Finding, SheetSummary } from '@/lib/checkup/types'
import { rowsText } from '@/lib/checkup/wording'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

function whereText(f: Finding): string {
  const cols = f.columns.map((c) => c.letter)
  const colText = cols.length === 1 ? `column ${cols[0]}` : `columns ${cols.slice(0, -1).join(', ')} and ${cols[cols.length - 1]}`
  return `${f.sheet} · ${colText} · ${rowsText(f.rows)}`
}

function Formula({ label, value, tone }: { label: string; value: string; tone?: 'now' | 'suggested' }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <code
        className={cn(
          'mt-1 block overflow-x-auto whitespace-pre rounded-md border px-3 py-2 font-mono text-xs leading-relaxed',
          tone === 'suggested'
            ? 'border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/30'
            : 'border-border bg-muted/40'
        )}
      >
        {value}
      </code>
    </div>
  )
}

function Examples({ examples }: { examples: ExampleCell[] }) {
  if (examples.length === 0) return null
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Example cells</div>
      <ul className="mt-1 flex flex-wrap gap-2">
        {examples.map((e) => (
          <li key={e.cell} className="rounded-md border border-border bg-muted/30 px-2.5 py-1 text-sm">
            <span className="font-mono font-semibold">{e.cell}</span>{' '}
            <span className="text-muted-foreground">shows</span>{' '}
            <span className="font-mono">{e.value === null ? 'nothing' : e.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Details({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        {open ? 'Hide the details' : 'Show the details'}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

const KIND_LABEL: Record<Finding['kind'], string> = {
  offset: 'Reads the wrong row',
  empty: 'Blank cells',
  error: 'Error showing',
  hardcoded: 'Typed-in value',
  inconsistent: 'Different formula',
  mixed: 'Mixed formulas',
  formatting: 'Colour rule',
  question: 'Question',
}

function ProblemCard({ finding, number }: { finding: Finding; number: number }) {
  const serious = finding.severity === 'high'
  const cosmetic = finding.kind === 'formatting'
  const Icon = cosmetic ? Paintbrush : AlertTriangle
  return (
    <li
      className={cn(
        'rounded-lg border bg-card p-4 sm:p-5',
        serious ? 'border-l-4 border-l-red-500' : cosmetic ? 'border-l-4 border-l-border' : 'border-l-4 border-l-amber-500'
      )}
      data-testid="checkup-problem"
      data-kind={finding.kind}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 h-5 w-5 shrink-0',
            serious ? 'text-red-600 dark:text-red-400' : cosmetic ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-base font-semibold leading-snug">
            <span className="text-muted-foreground">{number}.</span> {finding.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[finding.kind]} · {whereText(finding)} · {plural(finding.cellCount, 'cell', 'cells')}
          </p>
          <p className="text-[15px] leading-relaxed">{finding.explanation}</p>
          {finding.caution && (
            <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <span className="font-semibold">Check before fixing.</span> {finding.caution}
            </p>
          )}
          <Details>
            {finding.formulaBefore && <Formula label="Formula there now" value={finding.formulaBefore} tone="now" />}
            {finding.formulaSuggested && <Formula label="Suggested formula" value={finding.formulaSuggested} tone="suggested" />}
            {finding.kind === 'formatting' && finding.suggestedRange && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                {finding.color && (
                  <span
                    className="inline-block h-4 w-4 rounded-sm border border-border"
                    style={{ backgroundColor: `#${finding.color}` }}
                    aria-hidden
                  />
                )}
                The rule should cover <span className="font-mono font-semibold">{finding.suggestedRange}</span>.
              </p>
            )}
            <Examples examples={finding.examples} />
          </Details>
        </div>
      </div>
    </li>
  )
}

function QuestionCard({ finding }: { finding: Finding }) {
  const [choice, setChoice] = useState<'a' | 'b' | null>(null)
  const options = finding.options ?? []
  return (
    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 sm:p-5" data-testid="checkup-question">
      <div className="flex items-start gap-3">
        <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <h3 className="text-base font-semibold leading-snug">{finding.title}</h3>
          <p className="text-xs text-muted-foreground">{whereText(finding)}</p>
          <p className="text-[15px] leading-relaxed">{finding.explanation}</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={finding.title}>
            {options.map((o) => {
              const picked = choice === o.key
              return (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  onClick={() => setChoice(o.key)}
                  className={cn(
                    'rounded-md border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    picked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/60 hover:bg-accent'
                  )}
                >
                  <span className="block text-[15px] font-semibold leading-snug">{o.label}</span>
                  <span className={cn('mt-1 block text-xs', picked ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    Used now in {rowsText(o.rows)} · {plural(o.count, 'cell', 'cells')}
                  </span>
                </button>
              )
            })}
          </div>
          {choice && (
            <p className="text-sm text-muted-foreground" role="status">
              Noted. Your answer stays on this page for now; it will be used once fixed copies are available.
            </p>
          )}
          <Details>
            {options.map((o, i) => (
              <Formula key={o.key} label={`Choice ${i + 1}, as it would read in ${o.cell}`} value={o.formula} />
            ))}
            <Examples examples={finding.examples} />
          </Details>
        </div>
      </div>
    </div>
  )
}

function ColumnList({ sheets }: { sheets: SheetSummary[] }) {
  const shown = sheets.filter((s) => s.columns.length > 0)
  return (
    <div className="space-y-4">
      {shown.map((s) => (
        <div key={s.name}>
          <div className="text-sm font-semibold">
            {s.name}{' '}
            <span className="font-normal text-muted-foreground">
              · {plural(s.rows, 'row', 'rows')}
              {s.hasFormulas ? '' : s.notes.length > 0 ? ' · notes' : ' · data only'}
            </span>
          </div>
          <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
            {s.columns.map((c) => (
              <li key={c.letter} className="flex gap-3 px-3 py-2 text-sm">
                <span className="w-7 shrink-0 font-mono font-semibold text-muted-foreground">{c.letter}</span>
                <span className="min-w-0">
                  {c.header && <span className="font-medium">{c.header}. </span>}
                  <span className="text-muted-foreground">{c.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function CheckupResults({ result, onReset }: { result: CheckupResult; onReset: () => void }) {
  const [columnsOpen, setColumnsOpen] = useState(false)
  const { problems, questions } = result
  const columnCount = result.structure.sheets.reduce((n, s) => n + s.columns.length, 0)
  const clean = problems.length === 0 && questions.length === 0

  return (
    <div className="space-y-5" data-testid="checkup-results">
      {/* File */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold" title={result.fileName}>
              {result.fileName}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{formatSize(result.fileSize)}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-500" aria-hidden />
                Your original file is never changed
              </span>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={onReset}>
          Check another file
        </Button>
      </section>

      {result.aiNote && (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="checkup-ai-note">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {result.aiNote}
        </p>
      )}

      {/* Summary */}
      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">What this spreadsheet does</h2>
        <p className="mt-2 text-[15px] leading-relaxed" data-testid="checkup-summary">
          {result.summary}
        </p>
        {result.structure.features.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            It also contains {result.structure.features.join(', ')}. The check-up only reads the file, so those are untouched.
          </p>
        )}
        <Collapsible open={columnsOpen} onOpenChange={setColumnsOpen} className="mt-3">
          <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown className={cn('h-4 w-4 transition-transform', columnsOpen && 'rotate-180')} />
            {columnsOpen ? 'Hide the column-by-column list' : `Column by column (${columnCount})`}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <ColumnList sheets={result.structure.sheets} />
          </CollapsibleContent>
        </Collapsible>
      </section>

      {/* Problems */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {clean ? 'Nothing wrong found' : problems.length === 0 ? 'No problems found' : `${plural(problems.length, 'problem', 'problems')} found`}
        </h2>
        {problems.length === 0 ? (
          <p className="flex items-start gap-2 rounded-lg border bg-card p-4 text-[15px]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
            Every column of formulas is consistent from top to bottom, no cells show errors, and the colour rules cover their columns.
          </p>
        ) : (
          <ol className="space-y-3">
            {problems.map((p, i) => (
              <ProblemCard key={p.id} finding={p} number={i + 1} />
            ))}
          </ol>
        )}
      </section>

      {/* Questions */}
      {questions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {questions.length === 1 ? 'One question only you can answer' : `${questions.length} questions only you can answer`}
          </h2>
          {questions.map((q) => (
            <QuestionCard key={q.id} finding={q} />
          ))}
        </section>
      )}

      <p className="pb-6 text-center text-sm text-muted-foreground">Fixed copy coming soon</p>
    </div>
  )
}
