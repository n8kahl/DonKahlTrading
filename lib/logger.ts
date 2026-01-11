// =============================================================================
// Tucson Trader - Structured Logging
// Production-ready observability with timing metrics and error codes
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  requestId?: string
  endpoint?: string
  symbol?: string
  userId?: string
  durationMs?: number
  statusCode?: number
  errorCode?: string
  [key: string]: unknown
}

export interface StructuredLog {
  timestamp: string
  level: LogLevel
  message: string
  context: LogContext
  service: string
  environment: string
}

// =============================================================================
// Configuration
// =============================================================================

const SERVICE_NAME = 'tucson-trader'
const ENVIRONMENT = process.env.NODE_ENV || 'development'
const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL]
}

// =============================================================================
// Core Logger
// =============================================================================

function formatLog(level: LogLevel, message: string, context: LogContext = {}): StructuredLog {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
  }
}

function writeLog(log: StructuredLog): void {
  if (!shouldLog(log.level)) return

  // In production, output JSON for log aggregators
  if (ENVIRONMENT === 'production') {
    const output = JSON.stringify(log)
    if (log.level === 'error') {
      console.error(output)
    } else if (log.level === 'warn') {
      console.warn(output)
    } else {
      console.log(output)
    }
  } else {
    // In development, use readable format
    const prefix = `[${log.level.toUpperCase()}]`
    const ctx = Object.keys(log.context).length > 0 ? ` ${JSON.stringify(log.context)}` : ''
    const output = `${log.timestamp} ${prefix} ${log.message}${ctx}`

    if (log.level === 'error') {
      console.error(output)
    } else if (log.level === 'warn') {
      console.warn(output)
    } else {
      console.log(output)
    }
  }
}

// =============================================================================
// Public API
// =============================================================================

export const logger = {
  debug(message: string, context?: LogContext): void {
    writeLog(formatLog('debug', message, context))
  },

  info(message: string, context?: LogContext): void {
    writeLog(formatLog('info', message, context))
  },

  warn(message: string, context?: LogContext): void {
    writeLog(formatLog('warn', message, context))
  },

  error(message: string, context?: LogContext): void {
    writeLog(formatLog('error', message, context))
  },

  /**
   * Logs API request with timing
   */
  apiRequest(
    endpoint: string,
    method: string,
    context?: Omit<LogContext, 'endpoint'>
  ): void {
    writeLog(
      formatLog('info', `API ${method} ${endpoint}`, {
        endpoint,
        ...context,
      })
    )
  },

  /**
   * Logs API response with timing and status
   */
  apiResponse(
    endpoint: string,
    statusCode: number,
    durationMs: number,
    context?: Omit<LogContext, 'endpoint' | 'statusCode' | 'durationMs'>
  ): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    writeLog(
      formatLog(level, `API response ${statusCode}`, {
        endpoint,
        statusCode,
        durationMs,
        ...context,
      })
    )
  },

  /**
   * Logs external API call (Polygon/Massive)
   */
  externalCall(
    service: string,
    endpoint: string,
    durationMs: number,
    success: boolean,
    context?: LogContext
  ): void {
    const level: LogLevel = success ? 'info' : 'warn'
    writeLog(
      formatLog(level, `External call to ${service}`, {
        endpoint,
        durationMs,
        success,
        ...context,
      })
    )
  },

  /**
   * Logs error with error code
   */
  apiError(
    endpoint: string,
    errorCode: string,
    message: string,
    context?: Omit<LogContext, 'endpoint' | 'errorCode'>
  ): void {
    writeLog(
      formatLog('error', message, {
        endpoint,
        errorCode,
        ...context,
      })
    )
  },
}

// =============================================================================
// Request Timing Helper
// =============================================================================

export interface TimingContext {
  startTime: number
  requestId: string
  endpoint: string
}

export function startTiming(endpoint: string): TimingContext {
  return {
    startTime: Date.now(),
    requestId: generateRequestId(),
    endpoint,
  }
}

export function endTiming(ctx: TimingContext): number {
  return Date.now() - ctx.startTime
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// =============================================================================
// Middleware-style Request Logger
// =============================================================================

export function withLogging<T>(
  endpoint: string,
  fn: (ctx: TimingContext) => Promise<T>
): Promise<T> {
  const ctx = startTiming(endpoint)
  logger.apiRequest(endpoint, 'GET', { requestId: ctx.requestId })

  return fn(ctx)
    .then((result) => {
      const durationMs = endTiming(ctx)
      logger.apiResponse(endpoint, 200, durationMs, { requestId: ctx.requestId })
      return result
    })
    .catch((error) => {
      const durationMs = endTiming(ctx)
      logger.apiError(endpoint, 'INTERNAL_ERROR', error.message, {
        requestId: ctx.requestId,
        durationMs,
      })
      throw error
    })
}
