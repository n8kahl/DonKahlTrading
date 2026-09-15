import { prisma } from '../db'
import type { BreadthCountRow } from './breadth-history'
import type { WsjBreadthSnapshot } from './wsj-breadth'

export interface StoredBreadthRow extends BreadthCountRow {
  source: string
  variant: string
  sourceTimestamp: string | null
  capturedAt: string
}

export async function upsertBreadthSnapshot(snapshot: WsjBreadthSnapshot): Promise<void> {
  await prisma.stBreadthSnapshot.upsert({
    where: {
      date_variant: {
        date: snapshot.date,
        variant: snapshot.variant,
      },
    },
    update: {
      newHighs: snapshot.newHighs,
      newLows: snapshot.newLows,
      source: snapshot.source,
      sourceTimestamp: snapshot.sourceTimestamp,
      capturedAt: new Date(snapshot.capturedAt),
    },
    create: {
      date: snapshot.date,
      newHighs: snapshot.newHighs,
      newLows: snapshot.newLows,
      source: snapshot.source,
      variant: snapshot.variant,
      sourceTimestamp: snapshot.sourceTimestamp,
      capturedAt: new Date(snapshot.capturedAt),
    },
  })
}

export async function loadBreadthHistory(variant: string, limit = 90): Promise<StoredBreadthRow[]> {
  const records = await prisma.stBreadthSnapshot.findMany({
    where: { variant },
    orderBy: { date: 'desc' },
    take: limit,
  })

  return records.reverse().map((record) => ({
    date: record.date,
    newHighs: record.newHighs,
    newLows: record.newLows,
    source: record.source,
    variant: record.variant,
    sourceTimestamp: record.sourceTimestamp,
    capturedAt: record.capturedAt.toISOString(),
  }))
}
