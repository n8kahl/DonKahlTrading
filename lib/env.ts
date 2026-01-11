import { z } from 'zod'

// =============================================================================
// Environment Variable Schema
// =============================================================================

const envSchema = z.object({
  // Required - Core API
  MASSIVE_API_KEY: z.string().min(1, 'Polygon.io API key is required'),

  // Required - Database (optional, enables sharing/pinning features)
  DATABASE_URL: z.string().url().optional(),

  // AI Providers - At least one required for chat features
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Optional - App config
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
})

export type Env = z.infer<typeof envSchema>

// =============================================================================
// Runtime Environment Checks (for API routes)
// =============================================================================

export interface EnvCheck {
  isValid: boolean
  missing: string[]
}

/**
 * Check if MASSIVE_API_KEY is configured.
 * Use this at the start of API routes that require market data.
 */
export function requireMassiveApiKey(): EnvCheck {
  const key = process.env.MASSIVE_API_KEY
  return {
    isValid: !!key && key.length > 0,
    missing: !key ? ['MASSIVE_API_KEY'] : [],
  }
}

/**
 * Check if DATABASE_URL is configured.
 * Use this at the start of API routes that require database access.
 */
export function requireDatabaseUrl(): EnvCheck {
  const url = process.env.DATABASE_URL
  return {
    isValid: !!url && url.length > 0,
    missing: !url ? ['DATABASE_URL'] : [],
  }
}

/**
 * Check if at least one AI provider is configured.
 * Use this at the start of chat-related API routes.
 */
export function requireAiProvider(): EnvCheck {
  const anthropic = process.env.ANTHROPIC_API_KEY
  const openai = process.env.OPENAI_API_KEY
  const hasAi = (!!anthropic && anthropic.length > 0) || (!!openai && openai.length > 0)
  return {
    isValid: hasAi,
    missing: hasAi ? [] : ['ANTHROPIC_API_KEY or OPENAI_API_KEY'],
  }
}

// =============================================================================
// Validation Functions
// =============================================================================

let cachedEnv: Env | null = null
let validationRan = false

export function validateEnv(): { isValid: boolean; errors: string[] } {
  const result = envSchema.safeParse(process.env)

  const errors: string[] = []

  if (!result.success) {
    errors.push(
      ...result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    )
  }

  // Additional business rules
  if (result.success) {
    // AI chat requires at least one AI provider
    if (!result.data.ANTHROPIC_API_KEY && !result.data.OPENAI_API_KEY) {
      errors.push(
        'AI Chat requires either ANTHROPIC_API_KEY or OPENAI_API_KEY'
      )
    }

    cachedEnv = result.data
  }

  validationRan = true

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function getEnv(): Env {
  if (!validationRan) {
    const validation = validateEnv()
    if (!validation.isValid && process.env.NODE_ENV !== 'production') {
      console.warn('[ENV] Validation warnings:', validation.errors)
    }
  }

  // Return with defaults for missing optional values
  return (
    cachedEnv || {
      MASSIVE_API_KEY: process.env.MASSIVE_API_KEY || '',
      DATABASE_URL: process.env.DATABASE_URL,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NODE_ENV:
        (process.env.NODE_ENV as 'development' | 'production' | 'test') ||
        'development',
    }
  )
}

// =============================================================================
// Convenience Accessors
// =============================================================================

export function getEnvConfig() {
  const env = getEnv()
  return {
    massiveApiKey: env.MASSIVE_API_KEY,
    databaseUrl: env.DATABASE_URL,
    hasDatabase: !!env.DATABASE_URL,
    hasAI: !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY),
    preferredAI: env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
  }
}

// =============================================================================
// Feature Flags Based on Environment
// =============================================================================

export function getFeatureFlags() {
  const config = getEnvConfig()
  return {
    chatEnabled: config.hasAI,
    sharingEnabled: config.hasDatabase,
    pinningEnabled: config.hasDatabase,
  }
}

// =============================================================================
// Backward Compatibility
// =============================================================================

// Keep the old validateEnv signature for existing code
export function validateEnvLegacy() {
  const requiredEnvVars = {
    MASSIVE_API_KEY: process.env.MASSIVE_API_KEY,
  }

  const missing = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  return {
    isValid: missing.length === 0,
    missing,
  }
}
