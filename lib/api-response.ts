import { NextResponse } from "next/server"

// =============================================================================
// API Response Types
// =============================================================================

export type ApiErrorCode =
  | "MASSIVE_API_KEY_MISSING"
  | "DATABASE_URL_MISSING"
  | "AI_PROVIDER_MISSING"
  | "INVALID_PARAMS"
  | "INVALID_SYMBOL"
  | "MASSIVE_UPSTREAM_ERROR"
  | "DATABASE_ERROR"
  | "RATE_LIMIT_EXCEEDED"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"

export interface ApiError {
  success: false
  error: {
    code: ApiErrorCode
    message: string
    details?: Record<string, unknown>
  }
}

export interface ApiSuccess<T> {
  success: true
  data: T
  meta?: {
    requestId?: string
    timestamp: string
    dataAsOf?: string
    marketStatus?: "open" | "closed" | "pre-market" | "after-hours"
    warnings?: string[]
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// =============================================================================
// Response Helpers
// =============================================================================

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      success: false as const,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    { status }
  )
}

export function apiSuccess<T>(
  data: T,
  meta?: ApiSuccess<T>["meta"]
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({
    success: true as const,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  })
}

// =============================================================================
// Common Error Responses
// =============================================================================

export const ApiErrors = {
  missingMassiveApiKey: () =>
    apiError(
      "MASSIVE_API_KEY_MISSING",
      "Market data service not configured. Please contact support.",
      503
    ),

  missingDatabaseUrl: () =>
    apiError(
      "DATABASE_URL_MISSING",
      "This feature requires database configuration.",
      503
    ),

  missingAiProvider: () =>
    apiError(
      "AI_PROVIDER_MISSING",
      "AI chat requires either ANTHROPIC_API_KEY or OPENAI_API_KEY.",
      503
    ),

  invalidParams: (message: string, details?: Record<string, unknown>) =>
    apiError("INVALID_PARAMS", message, 400, details),

  invalidSymbol: (symbols: string[]) =>
    apiError(
      "INVALID_SYMBOL",
      `Invalid or empty symbols provided: ${symbols.join(", ")}`,
      400,
      { invalidSymbols: symbols }
    ),

  upstreamError: (message: string, failedSymbols?: string[]) =>
    apiError(
      "MASSIVE_UPSTREAM_ERROR",
      message,
      502,
      failedSymbols ? { failedSymbols } : undefined
    ),

  databaseError: (message: string) =>
    apiError("DATABASE_ERROR", message, 500),

  rateLimitExceeded: (retryAfter: number) =>
    NextResponse.json(
      {
        success: false as const,
        error: {
          code: "RATE_LIMIT_EXCEEDED" as const,
          message: "Too many requests. Please try again later.",
        },
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    ),

  payloadTooLarge: (maxSize: string) =>
    apiError(
      "PAYLOAD_TOO_LARGE",
      `Request payload exceeds maximum size of ${maxSize}.`,
      413
    ),

  notFound: (resource: string) =>
    apiError("NOT_FOUND", `${resource} not found.`, 404),

  internalError: (message = "An unexpected error occurred.") =>
    apiError("INTERNAL_ERROR", message, 500),
}

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateSymbols(
  symbolsParam: string,
  defaultSymbols = "DJI,SPX,IXIC,NDX,RUT,SOX"
): { valid: true; symbols: string[] } | { valid: false; error: NextResponse } {
  const raw = symbolsParam || defaultSymbols
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0 && /^[A-Z0-9.^-]{1,10}$/.test(s))

  if (symbols.length === 0) {
    return {
      valid: false,
      error: ApiErrors.invalidParams("No valid symbols provided"),
    }
  }

  return { valid: true, symbols }
}

export function validateNumericParam(
  value: string | null,
  defaultValue: number,
  min: number,
  max: number,
  name: string
): { valid: true; value: number } | { valid: false; error: NextResponse } {
  const parsed = value ? Number.parseInt(value, 10) : defaultValue

  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return {
      valid: false,
      error: ApiErrors.invalidParams(
        `${name} must be a number between ${min} and ${max}`,
        { provided: value, min, max }
      ),
    }
  }

  return { valid: true, value: parsed }
}
