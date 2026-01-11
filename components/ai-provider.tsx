'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import type { ResultEnvelope } from '@/components/ai-cards/types'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ToolResult {
  toolCallId: string
  toolName: string
  result: ResultEnvelope
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolResults?: ToolResult[]
}

interface AIContextValue {
  messages: Message[]
  isLoading: boolean
  error: string | null
  processingStatus: string | null // For showing current operation status
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
  abortRequest: () => void // Allow users to cancel long-running requests
}

// Timeout for AI requests (2 minutes for complex queries)
const AI_REQUEST_TIMEOUT = 120000

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

const AIContext = createContext<AIContextValue | null>(null)

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function AIProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const abortRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
      setProcessingStatus(null)
      setError('Request cancelled')
    }
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)
    setError(null)
    setProcessingStatus('Sending request...')

    // Add user message
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content,
    }
    setMessages((prev) => [...prev, userMessage])

    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort()
      setError('Request timed out. Please try a simpler query.')
    }, AI_REQUEST_TIMEOUT)

    try {
      console.log('[AI Provider] Sending message:', content)
      console.log('[AI Provider] Total messages:', messages.length + 1)

      setProcessingStatus('Connecting to AI...')

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content }],
        }),
        signal: abortController.signal,
      })

      console.log('[AI Provider] Response status:', response.status)

      if (!response.ok) {
        // Try to get the actual error message from the response body
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } catch {
          // Ignore JSON parse errors, use default message
        }
        throw new Error(errorMessage)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      // Handle SSE streaming response with tool results
      console.log('[AI Provider] Starting stream read...')
      setProcessingStatus('Analyzing your request...')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      const toolResults: ToolResult[] = []
      const pendingToolCalls = new Map<string, string>() // toolCallId -> toolName
      let chunkCount = 0
      let buffer = '' // Buffer for incomplete lines

      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: '',
        toolResults: [],
      }
      setMessages((prev) => [...prev, assistantMessage])

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[AI Provider] Stream complete. Total chunks:', chunkCount)
          break
        }

        // Check if aborted
        if (abortController.signal.aborted) {
          reader.cancel()
          break
        }

        chunkCount++
        buffer += decoder.decode(value, { stream: true })

        // Process complete lines from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.slice(6))

            // Text delta
            if (data.type === 'text-delta' && data.delta) {
              assistantContent += data.delta
              setProcessingStatus(null) // Clear status once we have content
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessage.id
                    ? { ...msg, content: assistantContent, toolResults: [...toolResults] }
                    : msg
                )
              )
            }

            // Tool call start - capture toolName
            if (data.type === 'tool-input-start' && data.toolCallId && data.toolName) {
              console.log('[AI Provider] Tool call:', data.toolName)
              pendingToolCalls.set(data.toolCallId, data.toolName)
              // Show friendly status for tool calls
              const toolStatusMap: Record<string, string> = {
                'universal_query': 'Fetching market data...',
                'show_market_pulse': 'Getting market pulse...',
                'show_extremes_heatmap': 'Building heatmap...',
                'analyze_options': 'Analyzing options chain...',
                'get_market_status': 'Checking market status...',
                'show_market_movers': 'Finding market movers...',
              }
              setProcessingStatus(toolStatusMap[data.toolName] || 'Processing data...')
            }

            // Tool output - capture result
            if (data.type === 'tool-output-available' && data.toolCallId && data.output) {
              const toolName = pendingToolCalls.get(data.toolCallId) || 'unknown'
              console.log('[AI Provider] Tool result:', toolName, data.output?.type)
              toolResults.push({
                toolCallId: data.toolCallId,
                toolName,
                result: data.output as ResultEnvelope,
              })
              setProcessingStatus(null) // Clear status after tool completes
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessage.id
                    ? { ...msg, content: assistantContent, toolResults: [...toolResults] }
                    : msg
                )
              )
            }
          } catch {
            // Ignore parse errors for malformed lines
          }
        }
      }

      // Final update
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: assistantContent, toolResults: [...toolResults] }
            : msg
        )
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled - error already set
        console.log('[AI Provider] Request aborted')
      } else {
        console.error('[AI Provider] Error:', err)
        setError(err instanceof Error ? err.message : 'Failed to send message')
      }
    } finally {
      clearTimeout(timeoutId)
      abortControllerRef.current = null
      setProcessingStatus(null)
      console.log('[AI Provider] Request complete')
      setIsLoading(false)
    }
  }, [messages])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return (
    <AIContext.Provider
      value={{
        messages,
        isLoading,
        error,
        processingStatus,
        sendMessage,
        clearMessages,
        abortRequest,
      }}
    >
      {children}
    </AIContext.Provider>
  )
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

export function useAI() {
  const context = useContext(AIContext)
  if (!context) {
    throw new Error('useAI must be used within an AIProvider')
  }
  return context
}
