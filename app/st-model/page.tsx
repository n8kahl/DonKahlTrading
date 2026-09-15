'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Activity, AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { STModelDashboard } from '@/components/st-model-dashboard'
import type { STModelResult } from '@/lib/st-model'

interface STModelApiResponse extends STModelResult {
  meta?: {
    lastFetchedAt?: string
    marketStatus?: string
    isDelayed?: boolean
  }
  methodology?: {
    workbookParity: string
    specVersion?: string
    sourceWorkbookSha256?: string
    nhnl: string
    partialDailyBarPolicy: string
  }
}

async function fetcher(url: string): Promise<STModelApiResponse> {
  const response = await fetch(url)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

export default function STModelPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<STModelApiResponse>('/api/st-model?days=126', fetcher, {
    refreshInterval: 300_000,
    keepPreviousData: true,
  })

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href="/" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted" aria-label="Back to Tucson Trader">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="shrink-0 text-base font-semibold">ST Model</h1>
                <span className="hidden items-center gap-1 truncate text-xs text-emerald-600 dark:text-emerald-500 sm:inline-flex">
                  <Activity className="h-3 w-3 shrink-0" /> Massive daily data
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">Don&apos;s model, rebuilt natively in Tucson Trader</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating} className="shrink-0 px-2.5 sm:px-3">
            {isValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-2" /> : <RefreshCw className="h-3.5 w-3.5 sm:mr-2" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-[1600px] space-y-4 p-3 sm:p-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>ST Model unavailable</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {isLoading && !data ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Computing ST Model...
          </div>
        ) : data ? (
          <STModelDashboard model={data} marketStatus={data.meta?.marketStatus} />
        ) : null}
      </main>
    </div>
  )
}
