import pg from 'pg'

const { Pool } = pg
const VARIANT = 'wsj-market-diary-live-v1'
const SOURCE = 'WSJ/Dow Jones Market Data'
const URL = 'https://www.wsj.com/market-data/stocks/marketsdiary'

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function asNumber(value, field) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim())
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid ${field}`)
  return parsed
}

const months = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

function timestampDate(timestamp) {
  const match = String(timestamp).trim().match(/^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/)
  if (!match) throw new Error(`unrecognized WSJ timestamp: ${timestamp}`)
  const month = months[match[1].toLowerCase()]
  if (!month) throw new Error(`unrecognized WSJ month: ${match[1]}`)
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`
}

function rowId(row) {
  return String(row?.id ?? row?.name ?? '').toLowerCase().replace(/\s+/g, '')
}

function parse(payload) {
  const sets = payload?.data?.instrumentSets
  if (!Array.isArray(sets)) throw new Error('WSJ instrumentSets missing')
  for (const set of sets) {
    const headers = Array.isArray(set?.headerFields) ? set.headerFields : []
    if (!headers.some((header) => /nasdaq/i.test(String(header?.label ?? header?.value ?? '')))) continue
    const rows = Array.isArray(set?.instruments) ? set.instruments : []
    const highs = rows.find((row) => ['newhighs', 'new52weekhighs'].includes(rowId(row)))
    const lows = rows.find((row) => ['newlows', 'new52weeklows'].includes(rowId(row)))
    if (!highs || !lows) continue
    const timestamp = String(highs.timestamp ?? lows.timestamp ?? payload?.data?.timestamp ?? '').trim()
    if (!timestamp) throw new Error('WSJ timestamp missing')
    return {
      date: timestampDate(timestamp),
      newHighs: asNumber(highs.latestClose, 'Nasdaq new highs'),
      newLows: asNumber(lows.latestClose, 'Nasdaq new lows'),
      sourceTimestamp: timestamp,
    }
  }
  throw new Error('WSJ Nasdaq new-high/new-low rows missing')
}

async function fetchSnapshot() {
  const url = new URL(URL)
  url.searchParams.set('id', JSON.stringify({ application: 'WSJ', marketsDiaryType: 'diaries' }))
  url.searchParams.set('type', 'mdc_marketsdiary')
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'if-modified-since': 'Sat, 1 Jan 2000 00:00:00 GMT',
      'user-agent': 'Mozilla/5.0 (compatible; TucsonTrader-BreadthSnapshot/1.0; +https://github.com/n8kahl/DonKahlTrading)',
    },
  })
  if (!response.ok) throw new Error(`WSJ Market Diary HTTP ${response.status}`)
  return parse(await response.json())
}

async function main() {
  const databaseUrl = requiredEnv('DATABASE_URL')
  const snapshot = await fetchSnapshot()
  const capturedAt = new Date()
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  try {
    await pool.query(
      `INSERT INTO st_breadth_snapshots
        (date, "newHighs", "newLows", source, variant, "sourceTimestamp", "capturedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (date, variant) DO UPDATE SET
         "newHighs" = EXCLUDED."newHighs",
         "newLows" = EXCLUDED."newLows",
         source = EXCLUDED.source,
         "sourceTimestamp" = EXCLUDED."sourceTimestamp",
         "capturedAt" = EXCLUDED."capturedAt",
         "updatedAt" = NOW()`,
      [snapshot.date, snapshot.newHighs, snapshot.newLows, SOURCE, VARIANT, snapshot.sourceTimestamp, capturedAt]
    )
  } finally {
    await pool.end()
  }

  console.log(JSON.stringify({
    ok: true,
    date: snapshot.date,
    newHighs: snapshot.newHighs,
    newLows: snapshot.newLows,
    source: SOURCE,
    variant: VARIANT,
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
