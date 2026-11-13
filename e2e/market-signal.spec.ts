import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { computeMarketSignal } from '../lib/market-signal/engine'
import type { MarketSignalClose } from '../lib/market-signal/types'

// The page is rendered from the workbook's own closes (Nasdaq_Tracker_Fixed.xlsx,
// Market Signal!A2:T487), so what the browser shows can be compared with the sheet.
const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'fixtures', 'market-signal-workbook.json'), 'utf8')
) as { columns: string[]; rows: Array<Array<string | number | null>> }

function closes(key: string): MarketSignalClose[] {
  const column = fixture.columns.indexOf(`${key}.close`)
  return fixture.rows.map((row) => ({ date: row[0] as string, close: row[column] as number | null }))
}

const model = computeMarketSignal({
  closesByIndex: { IXIC: closes('IXIC'), NDX: closes('NDX'), SOX: closes('SOX') },
})

const response = {
  ...model,
  meta: { lastFetchedAt: '2026-11-13T02:00:00Z', marketStatus: 'closed', isDelayed: true },
  methodology: {
    workbookParity: 'formula-faithful-v1',
    dataSource: 'workbook fixture',
    partialDailyBarPolicy: 'latest returned daily bar accepted',
  },
}

async function mockModel(page: Page, body: unknown = response) {
  await page.route('**/api/market-signal', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

function row(page: Page, date: string) {
  return page.locator('tbody tr').filter({ has: page.getByRole('cell', { name: date, exact: true }) })
}

const GREEN = 'rgb(22, 163, 74)'
const RED = 'rgb(220, 38, 38)'
const DARK_GREEN = 'rgb(21, 128, 61)'
const DARK_RED = 'rgb(185, 28, 28)'
const AMBER = 'rgb(217, 119, 6)'

test('Market Signal shows the workbook values and colours for the latest rows', async ({ page }) => {
  await mockModel(page)
  await page.goto('/market-signal')

  await expect(page.getByRole('heading', { name: 'Market Signal' })).toBeVisible()
  await expect(page.getByTestId('latest-signal')).toHaveText('RECOVERY')
  await expect(page.getByTestId('latest-signal')).toHaveCSS('background-color', DARK_GREEN)
  await expect(page.getByRole('heading', { name: 'Signal for 2026-11-12' })).toBeVisible()
  await expect(page.getByText('not a verified reproduction')).toBeVisible()
  await expect(page.getByText('not buy or sell advice')).toBeVisible()

  // Sheet row 487 (2026-11-12): Date, Signal, then close/ROC pairs, 10d moves, days since high, trough, +2.5% days.
  const latest = row(page, '2026-11-12').getByRole('cell')
  await expect(latest).toHaveText([
    '2026-11-12', 'RECOVERY',
    '25,366.09', '-0.39%', '28,289.19', '-0.30%', '10,506.67', '-0.54%',
    '3', '3', '8',
    '27', '27', '101',
    '', '', 'TROUGH',
    '1', '1', '4',
  ])
  await expect(latest.nth(16)).toHaveCSS('background-color', DARK_GREEN)

  // Sheet row 482 (2026-11-05): three red ROC cells, three troughs, WARNING.
  const selloff = row(page, '2026-11-05').getByRole('cell')
  await expect(selloff.nth(1)).toHaveText('WARNING')
  await expect(selloff.nth(1)).toHaveCSS('background-color', DARK_RED)
  await expect(selloff.nth(3)).toHaveText('-5.52%')
  await expect(selloff.nth(3)).toHaveCSS('background-color', RED)
  await expect(selloff.nth(7)).toHaveText('-12.25%')
  await expect(selloff.nth(7)).toHaveCSS('background-color', RED)

  // Sheet row 484 (2026-11-09): three green ROC cells.
  const rebound = row(page, '2026-11-09').getByRole('cell')
  await expect(rebound.nth(3)).toHaveText('2.74%')
  await expect(rebound.nth(3)).toHaveCSS('background-color', GREEN)
  await expect(rebound.nth(7)).toHaveText('6.85%')
  await expect(rebound.nth(7)).toHaveCSS('background-color', GREEN)

  // Sheet row 478 (2026-10-30): WATCH; a -2.86% day is red, a -1.38% day (row 477) is not.
  const watch = row(page, '2026-10-30').getByRole('cell')
  await expect(watch.nth(1)).toHaveText('WATCH')
  await expect(watch.nth(1)).toHaveCSS('background-color', AMBER)
  await expect(watch.nth(3)).toHaveCSS('background-color', RED)
  await expect(row(page, '2026-10-29').getByRole('cell').nth(3)).not.toHaveCSS('background-color', RED)
})

test('Market Signal can show every row since the start date and skips holidays', async ({ page }) => {
  await mockModel(page)
  await page.goto('/market-signal')

  await expect(page.locator('tbody tr')).toHaveCount(60)
  await page.getByRole('tab', { name: 'All since 2025-01-02' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(model.rows.length)

  await expect(row(page, '2025-01-09')).toHaveCount(0)
  await expect(row(page, '2025-01-20')).toHaveCount(0)
  await expect(row(page, '2025-01-21').getByRole('cell')).toHaveText([
    '2025-01-21', 'WATCH',
    '19,756.78', '0.64%', '21,566.51', '0.58%', '5,378.49', '1.29%',
    '0', '0', '2',
    '9', '0', '0',
    '', '', '',
    '0', '0', '2',
  ])
  // First row of the sheet: closes only, no ROC and no signal.
  await expect(row(page, '2025-01-02').getByRole('cell')).toHaveText([
    '2025-01-02', '',
    '19,280.79', '', '20,975.62', '', '5,021.50', '',
    '', '', '',
    '0', '0', '0',
    '', '', '',
    '', '', '',
  ])
})

test('Market Signal reports incomplete index data instead of a signal', async ({ page }) => {
  const degraded = computeMarketSignal({
    closesByIndex: { IXIC: closes('IXIC'), NDX: closes('NDX'), SOX: [] },
    healthNotes: ['PHLX SOX (I:SOX) could not be fetched from Massive.'],
  })
  await mockModel(page, { ...response, ...degraded })
  await page.goto('/market-signal')

  await expect(page.getByText('Index data is incomplete')).toBeVisible()
  await expect(page.getByText('PHLX SOX (I:SOX) could not be fetched from Massive.')).toBeVisible()
  await expect(page.getByText('No signal yet')).toBeVisible()
  await expect(page.getByTestId('latest-signal')).toHaveCount(0)
})

test('Market Signal is reachable from the home page and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockModel(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'Market Signal' }).click()
  await expect(page).toHaveURL(/\/market-signal$/)
  await expect(page.getByTestId('latest-signal')).toHaveText('RECOVERY')

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client)
})
