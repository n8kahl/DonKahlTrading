'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error] Critical application error:', error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#0a0a0a',
            color: '#fafafa',
          }}
        >
          <div style={{ maxWidth: '400px', textAlign: 'center' }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ margin: '0 auto 1rem' }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
              }}
            >
              Critical Error
            </h1>
            <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>
              {error.message || 'The application encountered a critical error'}
            </p>
            <button
              onClick={reset}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginRight: '0.5rem',
              }}
            >
              Reload Application
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'transparent',
                color: '#a1a1aa',
                border: '1px solid #404040',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Go Home
            </button>
            {error.digest && (
              <p
                style={{
                  marginTop: '1.5rem',
                  fontSize: '0.75rem',
                  color: '#71717a',
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
