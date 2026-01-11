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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content }],
        }),
      })

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

      // Handle streaming response with tool results
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      const toolResults: ToolResult[] = []
      const pendingToolCalls: Map<string, string> = new Map() // toolCallId -> toolName

      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: '',
        toolResults: [],
      }
      setMessages((prev) => [...prev, assistantMessage])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.trim()) continue

          // Text content: 0:"text"
          if (line.startsWith('0:')) {
            try {
              const text = JSON.parse(line.slice(2))
              assistantContent += text
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessage.id
                    ? { ...msg, content: assistantContent, toolResults: [...toolResults] }
                    : msg
                )
              )
            } catch {
              // Ignore parse errors
            }
          }

          // Tool call start: 9:{...}
          if (line.startsWith('9:')) {
            try {
              const toolCall = JSON.parse(line.slice(2))
              if (toolCall.toolCallId && toolCall.toolName) {
                pendingToolCalls.set(toolCall.toolCallId, toolCall.toolName)
              }
            } catch {
              // Ignore parse errors
            }
          }

          // Tool result: a:{...}
          if (line.startsWith('a:')) {
            try {
              const resultData = JSON.parse(line.slice(2))
              // resultData format: [{toolCallId, result}]
              if (Array.isArray(resultData)) {
                for (const item of resultData) {
                  if (item.toolCallId && item.result) {
                    const toolName = pendingToolCalls.get(item.toolCallId) || 'unknown'
                    toolResults.push({
                      toolCallId: item.toolCallId,
                      toolName,
                      result: item.result as ResultEnvelope,
                    })
                  }
                }
              }
              // Update message with tool results
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessage.id
                    ? { ...msg, content: assistantContent, toolResults: [...toolResults] }
                    : msg
                )
              )
            } catch {
              // Ignore parse errors
            }
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
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
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
