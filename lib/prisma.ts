import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Get DATABASE_URL from environment
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    // During build time or when DATABASE_URL is not set,
    // throw a helpful error when actually trying to use prisma
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined
        }
        return () => {
          throw new Error(
            "DATABASE_URL environment variable is not set. " +
            "Please configure your database connection."
          )
        }
      }
    })
  }

  // Dynamic import to avoid issues during build
  const pg = require('pg')
  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
