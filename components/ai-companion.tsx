'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  X,
  Bot,
  User,
  Loader2,
  Trash2,
  Minimize2,
  Maximize2,
  Share2,
  Download,
} from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useAI, type Message, type ToolResult } from '@/components/ai-provider'
import { renderResult } from '@/components/ai-cards/renderer-registry'
import type { PinConfig } from '@/components/ai-cards/types'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  toolResults?: ToolResult[]
}

// -----------------------------------------------------------------------------
// Tool Result Card Component
// -----------------------------------------------------------------------------

function ToolResultCard({
  result,
  onPin,
}: {
  result: ToolResult
  onPin?: (config: PinConfig) => void
}) {
  const rendered = renderResult(result.result, onPin)

  if (!rendered) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full mt-2"
    >
      {rendered}
    </motion.div>
  )
}

// -----------------------------------------------------------------------------
// Message Bubble Component
// -----------------------------------------------------------------------------

function MessageBubble({
  message,
  onPin,
}: {
  message: ChatMessage
  onPin?: (config: PinConfig) => void
}) {
  const isUser = message.role === 'user'
  const hasToolResults = message.toolResults && message.toolResults.length > 0

  return (
    <div className="space-y-2">
      {/* Text Message */}
      {message.content && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn('flex gap-2 max-w-[85%]', isUser ? 'ml-auto flex-row-reverse' : 'mr-auto')}
        >
          {/* Avatar */}
          <div
            className={cn(
              'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/10 text-white border border-white/20'
            )}
          >
            {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
          </div>

          {/* Message Content */}
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
              isUser
                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                : 'bg-white/10 backdrop-blur-sm text-white border border-white/10 rounded-tl-sm'
            )}
          >
            <p className="font-sans whitespace-pre-wrap">{message.content}</p>
            <p
              className={cn(
                'text-[10px] mt-1.5 font-mono',
                isUser ? 'text-primary-foreground/60' : 'text-white/40'
              )}
            >
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </motion.div>
      )}

      {/* Tool Results - Rendered as Cards */}
      {hasToolResults && (
        <div className="space-y-3 ml-9">
          {message.toolResults!.map((result) => (
            <ToolResultCard key={result.toolCallId} result={result} onPin={onPin} />
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Typing Indicator
// -----------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-2 mr-auto max-w-[85%]"
    >
      <div className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-white/60"
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// -----------------------------------------------------------------------------
// Command Bar Input
// -----------------------------------------------------------------------------

function CommandBarInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = 'Ask about markets, options, or any symbol...',
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 blur-xl opacity-50" />
      <div className="relative bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 p-1">
          <div className="flex-1 relative">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              className={cn(
                'w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/40',
                'focus:outline-none font-sans',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          </div>
          <Button
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            size="sm"
            className={cn(
              'h-10 w-10 rounded-lg bg-primary hover:bg-primary/90',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'transition-all duration-200'
            )}
          >
            {disabled ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Chat Content (Shared between Desktop and Mobile)
// -----------------------------------------------------------------------------

function ChatContent({
  messages,
  isLoading,
  error,
  input,
  setInput,
  handleSend,
  handleClear,
  handleShare,
  handleExport,
  handlePin,
  scrollRef,
  isSharing,
}: {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  input: string
  setInput: (v: string) => void
  handleSend: () => void
  handleClear: () => void
  handleShare: () => void
  handleExport: () => void
  handlePin: (config: PinConfig) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  isSharing?: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Image
              src="/tucson-trader-logo-small.png"
              alt="Trading Copilot"
              width={36}
              height={36}
              className="rounded-full"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Trading Copilot</h3>
            <p className="text-[11px] text-white/50 font-mono">AI-powered analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExport}
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
            disabled={messages.length === 0}
            title="Export as JSON"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
            disabled={messages.length === 0 || isSharing}
            title="Share chat link"
          >
            {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
            disabled={messages.length === 0}
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div ref={scrollRef} className="py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 overflow-hidden">
                <Image
                  src="/tucson-trader-logo-small.png"
                  alt="Trading Copilot"
                  width={64}
                  height={64}
                  className="opacity-50"
                />
              </div>
              <h4 className="text-white/70 font-medium mb-2">Start a conversation</h4>
              <p className="text-white/40 text-sm max-w-[250px]">
                Ask about market conditions, analyze options flow, or get insights on any symbol.
              </p>
              <div className="mt-6 space-y-2 w-full max-w-[280px]">
                {['Show me the market dashboard', 'Analyze SPY options', 'How are the semis doing?'].map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="w-full px-4 py-2.5 text-xs text-left text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
                    >
                      {suggestion}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onPin={handlePin} />
              ))}
              <AnimatePresence>{isLoading && <TypingIndicator />}</AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm"
                >
                  <p className="font-medium">Error</p>
                  <p className="text-xs mt-1 text-red-300/70">{error}</p>
                </motion.div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <CommandBarInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          disabled={isLoading}
        />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Floating Launcher Button
// -----------------------------------------------------------------------------

function LauncherButton({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative group"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Glow Effect */}
      <div
        className={cn(
          'absolute inset-0 rounded-full bg-primary/30 blur-xl opacity-50 transition-opacity duration-500',
          isOpen ? 'opacity-0' : 'animate-pulse'
        )}
      />

      {/* Button */}
      <div
        className={cn(
          'relative w-14 h-14 rounded-full flex items-center justify-center overflow-hidden',
          'bg-background border-2 border-border shadow-2xl',
          'transition-transform duration-300'
        )}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-center"
            >
              <X className="w-6 h-6 text-foreground" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Image
                src="/tucson-trader-logo-small.png"
                alt="Chat"
                width={48}
                height={48}
                className="rounded-full"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  )
}

// -----------------------------------------------------------------------------
// Desktop Chat Panel
// -----------------------------------------------------------------------------

function DesktopChatPanel({
  isOpen,
  isMinimized,
  onToggleMinimize,
  children,
}: {
  isOpen: boolean
  isMinimized: boolean
  onToggleMinimize: () => void
  children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            height: isMinimized ? 60 : 600,
          }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'fixed bottom-24 right-6 w-[450px] z-50 rounded-2xl overflow-hidden',
            'bg-black/90 backdrop-blur-xl',
            'border border-white/10',
            'shadow-2xl shadow-black/50'
          )}
        >
          {/* Minimize Toggle */}
          <button
            onClick={onToggleMinimize}
            className="absolute top-3 right-12 z-10 p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>

          {isMinimized ? (
            <div className="flex items-center gap-3 px-4 py-4">
              <Image
                src="/tucson-trader-logo-small.png"
                alt="Trading Copilot"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="text-sm font-medium text-white">Trading Copilot</span>
            </div>
          ) : (
            children
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// -----------------------------------------------------------------------------
// Main AI Companion Component
// -----------------------------------------------------------------------------

export function AICompanion() {
  const isMobile = useIsMobile()
  const { messages: aiMessages, isLoading, error, sendMessage, clearMessages } = useAI()

  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [input, setInput] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Convert AI messages to chat format
  const messages: ChatMessage[] = aiMessages.map((m: Message) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: new Date(),
    toolResults: m.toolResults,
  }))

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return
    const message = input.trim()
    setInput('')
    await sendMessage(message)
  }, [input, isLoading, sendMessage])

  const handleClear = useCallback(() => {
    clearMessages()
  }, [clearMessages])

  const handlePin = useCallback(async (config: PinConfig) => {
    try {
      // Try to save to API first
      const response = await fetch('/api/pinned-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (response.ok) {
        // Show success feedback (could be a toast)
        console.log('Card pinned to dashboard:', config.title)
      } else {
        // Fallback to localStorage
        const pinnedCards = JSON.parse(localStorage.getItem('pinnedCards') || '[]')
        pinnedCards.push(config)
        localStorage.setItem('pinnedCards', JSON.stringify(pinnedCards))
        console.log('Card pinned locally:', config.title)
      }
    } catch {
      // Fallback to localStorage on network error
      const pinnedCards = JSON.parse(localStorage.getItem('pinnedCards') || '[]')
      pinnedCards.push(config)
      localStorage.setItem('pinnedCards', JSON.stringify(pinnedCards))
    }
  }, [])

  const handleShare = useCallback(async () => {
    if (messages.length === 0) return

    setIsSharing(true)
    try {
      const response = await fetch('/api/chat-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create share link')
      }

      const { id } = await response.json()
      const shareUrl = `${window.location.origin}/chat/${id}`

      await navigator.clipboard.writeText(shareUrl)
      alert(`Share link copied to clipboard:\n${shareUrl}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create share link'
      alert(message)
    } finally {
      setIsSharing(false)
    }
  }, [messages])

  const handleExport = useCallback(() => {
    if (messages.length === 0) return

    const exportData = {
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        toolResults: m.toolResults,
      })),
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tucson-trader-chat-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [messages])

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
    if (isMinimized) setIsMinimized(false)
  }, [isMinimized])

  const chatContent = (
    <ChatContent
      messages={messages}
      isLoading={isLoading}
      error={error}
      input={input}
      setInput={setInput}
      handleSend={handleSend}
      handleClear={handleClear}
      handleShare={handleShare}
      handleExport={handleExport}
      handlePin={handlePin}
      scrollRef={scrollRef}
      isSharing={isSharing}
    />
  )

  // Mobile: Use Drawer (bottom) for better keyboard handling
  if (isMobile) {
    return (
      <>
        {/* Launcher */}
        <div className="fixed bottom-4 right-4 z-50">
          <LauncherButton onClick={toggleOpen} isOpen={isOpen} />
        </div>

        {/* Drawer */}
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerContent className="h-[85vh] bg-black/90 backdrop-blur-xl border-white/10">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Trading Copilot</DrawerTitle>
              <DrawerDescription>AI-powered market analysis</DrawerDescription>
            </DrawerHeader>
            {chatContent}
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  // Desktop: Floating panel
  return (
    <>
      {/* Launcher */}
      <div className="fixed bottom-6 right-6 z-50">
        <LauncherButton onClick={toggleOpen} isOpen={isOpen} />
      </div>

      {/* Chat Panel */}
      <DesktopChatPanel
        isOpen={isOpen}
        isMinimized={isMinimized}
        onToggleMinimize={() => setIsMinimized((prev) => !prev)}
      >
        {chatContent}
      </DesktopChatPanel>
    </>
  )
}
