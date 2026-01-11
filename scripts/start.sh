#!/bin/bash

# Tucson Trader - Production Startup Script
# Handles database migrations and starts the Next.js app

echo "🌵 Tucson Trader - Starting up..."

# Run Prisma db push if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "📦 Running database migrations..."
  npx prisma db push --skip-generate 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ Database migrations complete"
  else
    echo "⚠️  Database migration warning (may already be up to date)"
  fi
else
  echo "⚠️  DATABASE_URL not set - skipping migrations"
fi

# Start Next.js
echo "🚀 Starting Next.js server..."
exec npm run start:next
