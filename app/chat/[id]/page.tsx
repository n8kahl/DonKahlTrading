'use client'

import { useEffect, useState, use } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import {
  AlertCircle,
  Copy,
  Bot,
  User,
  MessageSquare,
  TrendingUp,
  Activity,
  Calendar,
  Eye,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'
import { renderResult, hasRenderer } from '@/components/ai-cards/renderer-registry'
import type { ResultEnvelope } from '@/components/ai-cards/types'

interface ToolResult {
  toolCallId?: string
  toolName: string
  result: ResultEnvelope
}

interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  toolResults?: ToolResult[]
}

interface SharedChat {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  viewCount: number
}

export default function SharedChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [chat, setChat] = useState<SharedChat | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const fetchChat = async () => {
      try {
        const response = await fetch(`/api/chat-share?id=${id}`)
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Chat not found')
        }
        const data = await response.json()
        setChat(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chat')
      } finally {
        setIsLoading(false)
      }
    }
    fetchChat()
  }, [id])

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <LoadingSkeleton />
        </div>
      </div>
    )
  }

  if (error || !chat) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-3xl mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || 'Chat not found'}</AlertDescription>
          </Alert>
          <div className="mt-4 text-center">
            <Button variant="outline" onClick={() => (window.location.href = '/')}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="max-w-3xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded bg-primary">
                <TrendingUp className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  Tucson Trader
                </h1>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  <span className="text-amber-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    Shared Chat
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                onClick={copyLink}
                size="sm"
                variant="outline"
                className="h-8"
              >
                <Copy className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline text-xs">
                  {copied ? 'Copied!' : 'Copy Link'}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Info Bar */}
      <div className="border-b border-border bg-muted/50 px-4 py-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3" />
          <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-none">
            {chat.title}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          <span>{new Date(chat.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Eye className="w-3 h-3" />
          <span>
            {chat.viewCount} view{chat.viewCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Chat Messages */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 space-y-4">
        {chat.messages.map((message, index) => (
          <div
            key={message.id || index}
            className={cn(
              'flex gap-3 p-4 rounded-lg',
              message.role === 'user' ? 'bg-muted' : 'bg-card border'
            )}
          >
            <div className="flex-shrink-0 mt-0.5">
              {message.role === 'user' ? (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3 min-w-0">
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>

              {/* Tool Results */}
              {message.toolResults && message.toolResults.length > 0 && (
                <div className="space-y-2">
                  {message.toolResults.map((result, i) => {
                    const key = result.toolCallId || `${index}-${i}`

                    // Check if we have a renderer for this result type
                    if (result.result && hasRenderer(result.result.type)) {
                      return (
                        <div
                          key={key}
                          className="w-full rounded-lg overflow-hidden"
                        >
                          {renderResult(result.result)}
                        </div>
                      )
                    }

                    // Fallback for unknown types
                    return (
                      <div
                        key={key}
                        className="text-xs text-muted-foreground bg-muted/50 p-2 rounded"
                      >
                        Tool: {result.toolName}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center">
        <p className="text-xs text-muted-foreground">
          Shared from{' '}
          <a href="/" className="text-primary hover:underline">
            Tucson Trader
          </a>
        </p>
      </footer>
    </div>
  )
}
