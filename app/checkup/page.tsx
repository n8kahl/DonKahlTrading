'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, FileSpreadsheet, KeyRound, Loader2, ShieldCheck, Upload } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckupResults } from '@/components/checkup-results'
import { cn } from '@/lib/utils'
import { MAX_UPLOAD_BYTES } from '@/lib/checkup/limits'
import type { CheckupResult } from '@/lib/checkup/types'

const PASSCODE_KEY = 'tucson-trader-checkup-passcode'
const STAGES = [
  'Opening the workbook…',
  'Checking every formula, row by row…',
  'Writing it up in plain words. This usually takes about a minute…',
]

function loadPasscode(): string {
  try {
    return window.localStorage.getItem(PASSCODE_KEY) ?? ''
  } catch {
    return ''
  }
}

function savePasscode(value: string | null) {
  try {
    if (value) window.localStorage.setItem(PASSCODE_KEY, value)
    else window.localStorage.removeItem(PASSCODE_KEY)
  } catch {
    // Private windows may refuse storage; the passcode just has to be typed again.
  }
}

export default function CheckupPage() {
  const [passcode, setPasscode] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckupResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const passcodeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPasscode(loadPasscode())
  }, [])

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

  const check = useCallback(
    async (file: File) => {
      setError(null)
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        setError('Please choose an Excel workbook saved as .xlsx.')
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError('That file is larger than 10 MB, which is the most the check-up can take.')
        return
      }
      if (!passcode.trim()) {
        setError('Type the passcode first, then choose the file again.')
        passcodeRef.current?.focus()
        return
      }

      setBusy(true)
      try {
        const body = new FormData()
        body.append('file', file)
        const response = await fetch('/api/checkup', {
          method: 'POST',
          headers: { 'x-checkup-passcode': passcode.trim() },
          body,
        })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data) {
          if (response.status === 401) savePasscode(null)
          setError(data?.error ?? 'The check-up could not be run. Please try again in a moment.')
          return
        }
        savePasscode(passcode.trim())
        setResult(data as CheckupResult)
        window.scrollTo({ top: 0 })
      } catch {
        setError('The check-up could not be reached. Check your connection and try again.')
      } finally {
        setBusy(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [passcode]
  )

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
            <h1 className="text-base font-semibold">Spreadsheet check-up</h1>
            <p className="truncate text-xs text-muted-foreground">See what a workbook does and what needs fixing, in plain words</p>
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
            <div className="rounded-lg border bg-card p-4 sm:p-5">
              <label htmlFor="checkup-passcode" className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
                Passcode
              </label>
              <Input
                id="checkup-passcode"
                ref={passcodeRef}
                type="password"
                autoComplete="off"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="The passcode you were given"
                className="mt-2 h-10 max-w-xs text-base"
                disabled={busy}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">This computer remembers it after the first check-up.</p>
            </div>

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
                  <p className="text-base font-medium" role="status" aria-live="polite">
                    {STAGES[stage]}
                  </p>
                </>
              ) : (
                <>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                    <FileSpreadsheet className="h-7 w-7 text-emerald-700 dark:text-emerald-400" aria-hidden />
                  </span>
                  <div>
                    <p className="text-lg font-semibold">Drop your Excel workbook here</p>
                    <p className="text-sm text-muted-foreground">or click to choose it · one .xlsx file, up to 10 MB</p>
                  </div>
                  <Button type="button" tabIndex={-1} className="pointer-events-none">
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

            <p className="flex items-start justify-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
              Your original file is never changed, and it is not kept after the check-up.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
