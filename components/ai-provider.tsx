'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
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
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
}

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

  const sendMessage = useCallback(async (content: string) => {
    setIsLoading(true)
    setError(null)

    // Add user message
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content,
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      console.log('[AI Provider] Sending message:', content)
      console.log('[AI Provider] Total messages:', messages.length + 1)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content }],
        }),
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
      console.error('[AI Provider] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
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
        sendMessage,
        clearMessages,
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
