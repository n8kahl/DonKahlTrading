'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
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
// Error Card Component
// -----------------------------------------------------------------------------

export function ErrorCard({ data, onRetry, className }: ErrorCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-red-500/20 bg-red-500/5 p-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertCircle className="w-4 h-4 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-red-400 mb-1">
            {data.title}
          </h4>
          <p className="text-xs text-red-300/70 leading-relaxed">
            {data.message}
          </p>
          {data.recoverable && onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
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
