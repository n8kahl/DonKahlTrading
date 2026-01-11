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

      // Handle streaming text response
      console.log('[AI Provider] Starting stream read...')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let chunkCount = 0

      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: '',
      }
      setMessages((prev) => [...prev, assistantMessage])

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[AI Provider] Stream complete. Total chunks:', chunkCount)
          break
        }

        chunkCount++
        const chunk = decoder.decode(value, { stream: true })
        console.log('[AI Provider] Chunk', chunkCount, ':', chunk.substring(0, 50))

        // Plain text stream - just accumulate the text
        assistantContent += chunk
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: assistantContent }
              : msg
          )
        )
      }

      // Final update
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: assistantContent }
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
