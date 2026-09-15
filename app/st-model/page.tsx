'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Activity, AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { STModelTable } from '@/components/st-model-table'
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-2">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted" aria-label="Back to Tucson Trader">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold">ST Model</h1>
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
                  <Activity className="h-3 w-3" /> Massive daily data
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Native Tucson Trader reproduction of Don's Excel model</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
            {isValidating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-4 p-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>ST Model unavailable</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {data?.health && (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">Price data through</div>
              <div className="mt-1 font-semibold">{data.health.priceDataThrough || 'Unknown'}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">Model health</div>
              <div className="mt-1 font-semibold capitalize">{data.health.status}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">Market</div>
              <div className="mt-1 font-semibold capitalize">{data.meta?.marketStatus || 'Unknown'}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">Legacy breadth</div>
              <div className="mt-1 font-semibold">{data.health.breadthMode === 'legacy-exact' ? 'Active' : 'Gated'}</div>
            </div>
          </div>
        )}

        {(data?.health.unavailableSources?.length ?? 0) > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>One or more workbook sources are unavailable from the market-data provider</AlertTitle>
            <AlertDescription>
              Missing: {data?.health.unavailableSources?.join(', ')}. Any dependent regime is shown as unavailable rather than approximated.
            </AlertDescription>
          </Alert>
        )}

        {data?.health.breadthMode === 'unavailable' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>NH/NL confirmation is intentionally gated</AlertTitle>
            <AlertDescription>
              The Excel model's Nasdaq 52-week new-high/new-low source is stale. Tucson Trader does not substitute ETF-proxy breadth into the legacy Bull signal without a parity decision, so Std and Alt remain live while the three-regime Bull confirmation stays off.
            </AlertDescription>
          </Alert>
        )}

        {isLoading && !data ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Computing ST Model...
          </div>
        ) : data ? (
          <STModelTable model={data} />
        ) : null}
      </main>
    </div>
  )
}
