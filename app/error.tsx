'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to error reporting service in production
    console.error('[Error Boundary] Application error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="mt-2">
            {error.message || 'An unexpected error occurred'}
          </AlertDescription>
        </Alert>

        <div className="flex gap-3">
          <Button onClick={reset} variant="default" className="flex-1">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button
            onClick={() => (window.location.href = '/')}
            variant="outline"
            className="flex-1"
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>
        </div>

        {error.digest && (
          <p className="text-xs text-muted-foreground text-center">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
