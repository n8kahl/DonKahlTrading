// =============================================================================
// Tucson Trader - Database Client
// Prisma client singleton for Railway PostgreSQL
// Uses pg adapter for Prisma 7
// =============================================================================

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Prevent multiple Prisma Client instances in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

// Create connection pool for pg adapter
function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    // Return a dummy pool for build time (will fail at runtime if no DATABASE_URL)
    return new Pool({ connectionString: 'postgresql://localhost:5432/dummy' })
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
}

function createPrismaClient(): PrismaClient {
  const pool = globalForPrisma.pool ?? createPool()
  globalForPrisma.pool = pool

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Checks if the database is reachable
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

/**
 * Cleanup stale rate limit entries (older than 1 hour)
 */
export async function cleanupRateLimits(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 3600000)

  const result = await prisma.rateLimitEntry.deleteMany({
    where: {
      windowStart: {
        lt: oneHourAgo,
      },
    },
  })

  return result.count
}
