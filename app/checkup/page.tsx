'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, FileSpreadsheet, ImagePlus, Loader2, ShieldCheck, Upload, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CheckupResults } from '@/components/checkup-results'
import { cn } from '@/lib/utils'
import { MAX_REFERENCE_CHARS, MAX_SCREENSHOT_BYTES, MAX_UPLOAD_BYTES, SCREENSHOT_TYPES } from '@/lib/checkup/limits'
import type { CheckupResult } from '@/lib/checkup/types'

const STAGES = [
  'Opening the workbook…',
  'Checking every formula, row by row…',
  'Writing it up in plain words. This usually takes about a minute…',
]

export default function CheckupPage() {
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckupResult | null>(null)
  const [context, setContext] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shotRef = useRef<HTMLInputElement>(null)

  const addScreenshot = (file: File | null | undefined) => {
    if (!file) return
    if (!SCREENSHOT_TYPES.includes(file.type)) {
      setError('The screenshot needs to be a picture (PNG or JPEG).')
      return
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError('That screenshot is larger than 3 MB. Try a smaller picture.')
      return
    }
    setError(null)
    setScreenshot(file)
  }

  // Move the progress line along while the request is out.
  useEffect(() => {
    if (!busy) return
    setStage(0)
    const t1 = setTimeout(() => setStage(1), 1200)
    const t2 = setTimeout(() => setStage(2), 3500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [busy])

  const check = useCallback(async (file: File) => {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Please choose an Excel workbook saved as .xlsx.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That file is larger than 10 MB, which is the most the check-up can take.')
      return
    }
    if (context.length > MAX_REFERENCE_CHARS) {
      setError('The pasted text is very long. Paste just the part that explains the rules and try again.')
      return
    }
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      if (context.trim()) body.append('context', context.trim())
      if (screenshot) body.append('screenshot', screenshot)
      const response = await fetch('/api/checkup', { method: 'POST', body })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) {
        setError(data?.error ?? 'The check-up could not be run. Please try again in a moment.')
        return
      }
      setResult(data as CheckupResult)
      window.scrollTo({ top: 0 })
    } catch {
      setError('The check-up could not be reached. Check your connection and try again.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [context, screenshot])

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    const files = event.dataTransfer.files
    if (files.length > 1) {
      setError('Please drop one file at a time.')
      return
    }
    if (files[0]) void check(files[0])
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
            <p className="truncate text-sm text-muted-foreground">See what a workbook does and what needs fixing, in plain words</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
        {error && (
          <Alert variant="destructive" data-testid="checkup-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>That did not work</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result ? (
          <CheckupResults
            result={result}
            onReset={() => {
              setResult(null)
              setError(null)
            }}
          />
        ) : (
          <>
            <section className="rounded-lg border bg-card p-4 sm:p-5" aria-labelledby="checkup-context-title">
              <h2 id="checkup-context-title" className="text-lg font-semibold">
                1. Anything from Forever Grateful? <span className="font-normal text-muted-foreground">(optional)</span>
              </h2>
              <p className="mt-1 text-base text-muted-foreground">
                If this workbook follows rules from an email or post, paste the text here or add a screenshot. The check-up will
                use it to judge what the spreadsheet is supposed to do. Skip this if you do not have it.
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
                rows={4}
                placeholder="Paste the email or post here"
                aria-label="Text from the email or post"
                data-testid="checkup-context"
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
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

            <h2 className="px-1 text-lg font-semibold">2. Your workbook</h2>
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
                'flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                dragging ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/60',
                busy && 'cursor-default hover:border-border'
              )}
            >
              {busy ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
                  <p className="text-lg font-medium" role="status" aria-live="polite">
                    {STAGES[stage]}
                  </p>
                </>
              ) : (
                <>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                    <FileSpreadsheet className="h-7 w-7 text-emerald-700 dark:text-emerald-400" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xl font-semibold">Drop your Excel workbook here</p>
                    <p className="text-base text-muted-foreground">or click to choose it · one .xlsx file, up to 10 MB</p>
                  </div>
                  <Button type="button" tabIndex={-1} className="pointer-events-none h-11 px-6 text-base">
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
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void check(file)
                }}
              />
            </div>

            <p className="flex items-start justify-center gap-2 text-base text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
              Your original file is never changed. Nothing you add here is kept after the check-up.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
