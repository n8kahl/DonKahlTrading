'use client'

import { AlertCircle, Info, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CardProps } from './types'

// -----------------------------------------------------------------------------
// Error Card Types
// -----------------------------------------------------------------------------

export interface ErrorData {
  type: 'error'
  title: string
  message: string
  recoverable?: boolean
}

interface ErrorCardProps extends CardProps {
  data: ErrorData
  onRetry?: () => void
}

// -----------------------------------------------------------------------------
// Error Severity Detection
// -----------------------------------------------------------------------------

function getErrorSeverity(title: string, message: string): 'warning' | 'error' {
  const warningPatterns = [
    /unavailable/i,
    /temporarily/i,
    /try again/i,
    /no data/i,
    /not found/i,
    /timeout/i,
  ]

  const combined = `${title} ${message}`
  return warningPatterns.some((p) => p.test(combined)) ? 'warning' : 'error'
}

// -----------------------------------------------------------------------------
// Error Card Component
// -----------------------------------------------------------------------------

export function ErrorCard({ data, onRetry, className }: ErrorCardProps) {
  const severity = getErrorSeverity(data.title, data.message)
  const isWarning = severity === 'warning'

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isWarning
          ? 'border-amber-500/20 bg-amber-500/5'
          : 'border-red-500/20 bg-red-500/5',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
            isWarning ? 'bg-amber-500/10' : 'bg-red-500/10'
          )}
        >
          {isWarning ? (
            <Info className="w-4 h-4 text-amber-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4
            className={cn(
              'text-sm font-medium mb-1',
              isWarning ? 'text-amber-400' : 'text-red-400'
            )}
          >
            {data.title}
          </h4>
          <p
            className={cn(
              'text-xs leading-relaxed',
              isWarning ? 'text-amber-300/70' : 'text-red-300/70'
            )}
          >
            {data.message}
          </p>
          {data.recoverable && onRetry && (
            <button
              onClick={onRetry}
              className={cn(
                'mt-3 inline-flex items-center gap-1.5 text-xs transition-colors',
                isWarning
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-red-400 hover:text-red-300'
              )}
            >
              <RefreshCw className="w-3 h-3" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
