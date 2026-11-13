'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, FileSpreadsheet, ImagePlus, Loader2, ShieldCheck, Upload, Wrench, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CheckupResults } from '@/components/checkup-results'
import { RepairProgress, RepairResults } from '@/components/checkup-repair'
import { cn } from '@/lib/utils'
import {
  MAX_COMPLAINT_CHARS,
  MAX_REFERENCE_CHARS,
  MAX_SCREENSHOT_BYTES,
  MAX_UPLOAD_BYTES,
  SCREENSHOT_TYPES,
} from '@/lib/checkup/limits'
import type { RepairResult, RepairStatus } from '@/lib/checkup/repair/job'
import type { CheckupResult } from '@/lib/checkup/types'

const POLL_MS = 5000
const FIELD =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50'

type Phase =
  | { name: 'form' }
  | { name: 'starting' }
  | { name: 'working'; jobId: string; fileName: string | null; stage: string; progress: string[]; steps: number; elapsedSeconds: number }
  | { name: 'fixed'; jobId: string; result: RepairResult }
  | { name: 'report'; result: CheckupResult }

function jobInUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('job')
  } catch {
    return null
  }
}

function setJobInUrl(jobId: string | null) {
  try {
    const url = new URL(window.location.href)
    if (jobId) url.searchParams.set('job', jobId)
    else url.searchParams.delete('job')
    window.history.replaceState(null, '', url)
  } catch {
    // The address bar is a convenience for coming back to a running check-up; ignore if unavailable.
  }
}

export default function CheckupPage() {
  const [phase, setPhase] = useState<Phase>({ name: 'form' })
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [complaint, setComplaint] = useState('')
  const [context, setContext] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shotRef = useRef<HTMLInputElement>(null)

  const busy = phase.name === 'starting'
  const workingJob = phase.name === 'working' ? phase.jobId : null

  // Come back to a check-up that is already running (the page was closed or reloaded).
  useEffect(() => {
    const jobId = jobInUrl()
    if (jobId) {
      setPhase({ name: 'working', jobId, fileName: null, stage: 'Picking up where it left off.', progress: [], steps: 0, elapsedSeconds: 0 })
    }
  }, [])

  // Follow the repair until it finishes.
  useEffect(() => {
    if (!workingJob) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        const response = await fetch(`/api/checkup/${workingJob}`, { cache: 'no-store' })
        const status = (await response.json().catch(() => null)) as RepairStatus | null
        if (stopped) return
        if (!status || typeof status.state !== 'string') {
          // Not an answer about the job (for example "too many requests"): ask again shortly.
          timer = setTimeout(poll, POLL_MS * 2)
          return
        }
        if (status.state === 'done') {
          setPhase({ name: 'fixed', jobId: workingJob, result: status.result })
          window.scrollTo({ top: 0 })
          return
        }
        if (status.state === 'failed') {
          setJobInUrl(null)
          setError(status.reason)
          setPhase({ name: 'form' })
          return
        }
        setPhase((current) =>
          current.name === 'working' && current.jobId === workingJob
            ? {
                ...current,
                stage: status.stage,
                // Keep the longest list seen, so a brief hiccup does not blank the screen.
                progress: status.progress.length >= current.progress.length ? status.progress : current.progress,
                steps: Math.max(status.steps, current.steps),
                elapsedSeconds: Math.max(status.elapsedSeconds, current.elapsedSeconds),
              }
            : current
        )
      } catch {
        // A dropped connection is not a failed repair; try again shortly.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS)
    }
    void poll()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [workingJob])

  const chooseFile = (candidate: File | null | undefined) => {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.xlsx')) {
      setError('Please choose an Excel workbook saved as .xlsx.')
      return
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setError('That file is larger than 10 MB, which is the most the check-up can take.')
      return
    }
    setError(null)
    setFile(candidate)
  }

  const addScreenshot = (candidate: File | null | undefined) => {
    if (!candidate) return
    if (!SCREENSHOT_TYPES.includes(candidate.type)) {
      setError('The screenshot needs to be a picture (PNG or JPEG).')
      return
    }
    if (candidate.size > MAX_SCREENSHOT_BYTES) {
      setError('That screenshot is larger than 3 MB. Try a smaller picture.')
      return
    }
    setError(null)
    setScreenshot(candidate)
  }

  const start = useCallback(async () => {
    if (!file) {
      setError('Choose your workbook first.')
      return
    }
    if (context.length > MAX_REFERENCE_CHARS) {
      setError('The pasted text is very long. Paste just the part that explains the rules and try again.')
      return
    }
    setError(null)
    setPhase({ name: 'starting' })
    try {
      const body = new FormData()
      body.append('file', file)
      if (complaint.trim()) body.append('complaint', complaint.trim())
      if (context.trim()) body.append('context', context.trim())
      if (screenshot) body.append('screenshot', screenshot)
      const response = await fetch('/api/checkup', { method: 'POST', body })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) {
        setError(data?.error ?? 'The check-up could not be run. Please try again in a moment.')
        setPhase({ name: 'form' })
        return
      }
      if (data.mode === 'repair') {
        setJobInUrl(data.jobId)
        setPhase({
          name: 'working',
          jobId: data.jobId,
          fileName: data.fileName ?? file.name,
          stage: 'Opening your workbook and looking it over.',
          progress: [],
          steps: 0,
          elapsedSeconds: 0,
        })
      } else {
        setPhase({ name: 'report', result: data.result as CheckupResult })
      }
      window.scrollTo({ top: 0 })
    } catch {
      setError('The check-up could not be reached. Check your connection and try again.')
      setPhase({ name: 'form' })
    }
  }, [file, complaint, context, screenshot])

  const reset = () => {
    setJobInUrl(null)
    setError(null)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
    setPhase({ name: 'form' })
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    if (event.dataTransfer.files.length > 1) {
      setError('Please drop one file at a time.')
      return
    }
    chooseFile(event.dataTransfer.files[0])
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2 sm:px-4">
          <Link
            href="/"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
            aria-label="Back to Tucson Trader"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Spreadsheet check-up</h1>
            <p className="truncate text-sm text-muted-foreground">Find what is wrong with a workbook, fix it, and explain it in plain words</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
        {error && (
          <Alert variant="destructive" data-testid="checkup-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>That did not work</AlertTitle>
            <AlertDescription className="text-base">{error}</AlertDescription>
          </Alert>
        )}

        {phase.name === 'working' && (
          <>
            <RepairProgress
              fileName={phase.fileName}
              stage={phase.stage}
              progress={phase.progress}
              steps={phase.steps}
              elapsedSeconds={phase.elapsedSeconds}
            />
            <div className="text-center">
              <Button variant="ghost" className="text-base text-muted-foreground" onClick={reset}>
                Check a different file instead
              </Button>
            </div>
          </>
        )}

        {phase.name === 'fixed' && <RepairResults jobId={phase.jobId} result={phase.result} onReset={reset} />}

        {phase.name === 'report' && <CheckupResults result={phase.result} onReset={reset} />}

        {(phase.name === 'form' || phase.name === 'starting') && (
          <>
            {/* 1. The workbook */}
            <h2 className="px-1 text-lg font-semibold">1. Your workbook</h2>
            <div
              role="button"
              tabIndex={busy ? -1 : 0}
              aria-disabled={busy}
              aria-label="Choose an Excel workbook to check"
              data-testid="checkup-dropzone"
              onClick={() => !busy && inputRef.current?.click()}
              onKeyDown={(e) => {
                if (!busy && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  inputRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (!busy) setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                dragging ? 'border-primary bg-primary/5' : file ? 'border-emerald-600/60 bg-card' : 'border-border bg-card hover:border-primary/60',
                busy && 'cursor-default opacity-70'
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <FileSpreadsheet className="h-7 w-7 text-emerald-700 dark:text-emerald-400" aria-hidden />
              </span>
              {file ? (
                <div>
                  <p className="break-all text-xl font-semibold" data-testid="checkup-chosen">
                    {file.name}
                  </p>
                  <p className="text-base text-muted-foreground">Click to choose a different file</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xl font-semibold">Drop your Excel workbook here</p>
                    <p className="text-base text-muted-foreground">or click to choose it · one .xlsx file, up to 10 MB</p>
                  </div>
                  <Button type="button" variant="outline" tabIndex={-1} className="pointer-events-none h-11 px-6 text-base">
                    <Upload className="h-4 w-4" aria-hidden />
                    Choose a file
                  </Button>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
            </div>

            {/* 2. What seems wrong */}
            <section className="rounded-lg border bg-card p-4 sm:p-5">
              <label htmlFor="checkup-complaint" className="text-lg font-semibold">
                2. What seems wrong? <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <p className="mt-1 text-base text-muted-foreground">
                In your own words. For example: “The NDX numbers look wrong” or “The signal has not changed in weeks”. Leave it
                blank if you are not sure.
              </p>
              <input
                id="checkup-complaint"
                type="text"
                value={complaint}
                maxLength={MAX_COMPLAINT_CHARS}
                onChange={(e) => setComplaint(e.target.value)}
                disabled={busy}
                placeholder="Some of the formulas are not working"
                data-testid="checkup-complaint"
                className={cn(FIELD, 'mt-3 h-11')}
              />
            </section>

            {/* 3. Background */}
            <section className="rounded-lg border bg-card p-4 sm:p-5" aria-labelledby="checkup-context-title">
              <h2 id="checkup-context-title" className="text-lg font-semibold">
                3. Anything from Forever Grateful? <span className="font-normal text-muted-foreground">(optional)</span>
              </h2>
              <p className="mt-1 text-base text-muted-foreground">
                If this workbook follows rules from an email or post, paste the text here or add a screenshot of the table. It
                is used to judge what the spreadsheet is supposed to do. Skip this if you do not have it.
              </p>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                onPaste={(e) => {
                  // A picture pasted from the clipboard becomes the screenshot.
                  const item = Array.from(e.clipboardData.items).find((i) => i.kind === 'file' && i.type.startsWith('image/'))
                  if (item) {
                    e.preventDefault()
                    addScreenshot(item.getAsFile())
                  }
                }}
                disabled={busy}
                rows={3}
                placeholder="Paste the email or post here"
                aria-label="Text from the email or post"
                data-testid="checkup-context"
                className={cn(FIELD, 'mt-3')}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {screenshot ? (
                  <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/40 py-1 pl-3 pr-1 text-base">
                    <span className="truncate">Screenshot added: {screenshot.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshot(null)
                        if (shotRef.current) shotRef.current.value = ''
                      }}
                      disabled={busy}
                      aria-label="Remove the screenshot"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <Button type="button" variant="outline" className="h-10 text-base" disabled={busy} onClick={() => shotRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" aria-hidden />
                    Add a screenshot
                  </Button>
                )}
                <input
                  ref={shotRef}
                  type="file"
                  accept={SCREENSHOT_TYPES.join(',')}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  data-testid="checkup-screenshot"
                  onChange={(e) => addScreenshot(e.target.files?.[0])}
                />
              </div>
            </section>

            {/* Go */}
            <Button
              type="button"
              className="h-14 w-full text-lg"
              disabled={busy || !file}
              onClick={() => void start()}
              data-testid="checkup-start"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Wrench className="h-5 w-5" aria-hidden />}
              {busy ? 'Sending your workbook…' : 'Check and fix my spreadsheet'}
            </Button>

            <p className="flex items-start gap-2 text-base text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
              <span>
                Your original file is never changed; you get a separate fixed copy to download. To do the work, your whole
                workbook and anything you add above are sent to Claude, an AI service run by Anthropic, and removed from
                there after about a week.
              </span>
            </p>
          </>
        )}
      </main>
    </div>
  )
}
