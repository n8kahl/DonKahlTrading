import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',

  // Database configuration for migrations
  migrate: {
    async url() {
      return process.env.DATABASE_URL || ''
    },
  },
})
