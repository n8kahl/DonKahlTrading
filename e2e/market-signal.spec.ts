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
    workbookParity: 'formula-faithful-v2',
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
  return page
    .locator('section[aria-label="Market Signal table"] tbody tr')
    .filter({ has: page.getByRole('cell', { name: date, exact: true }) })
}

const GREEN = 'rgb(22, 163, 74)'
const RED = 'rgb(220, 38, 38)'
const LIGHT_GREEN = 'rgb(198, 239, 206)'
const YELLOW = 'rgb(255, 255, 0)'
const DARK_GREEN = 'rgb(21, 128, 61)'
const DARK_RED = 'rgb(185, 28, 28)'
const AMBER = 'rgb(217, 119, 6)'

// Cell order: Date, Signal, close/ROC x3, 10d net x3, days since high x3, 10% below high x3, 10d +2.5% days x3.

test('Market Signal shows the workbook values and colours for the latest rows', async ({ page }) => {
  await mockModel(page)
  await page.goto('/market-signal')

  await expect(page.getByRole('heading', { name: 'Market Signal' })).toBeVisible()
  await expect(page.getByTestId('latest-signal')).toHaveText('WATCH')
  await expect(page.getByTestId('latest-signal')).toHaveCSS('background-color', AMBER)
  await expect(page.getByRole('heading', { name: 'Signal for 2026-11-12' })).toBeVisible()
  await expect(page.getByText('not his own call')).toBeVisible()
  await expect(page.getByText('not buy or sell advice')).toBeVisible()

  // Sheet row 487 (2026-11-12).
  const latest = row(page, '2026-11-12').getByRole('cell')
  await expect(latest).toHaveText([
    '2026-11-12', 'WATCH',
    '25,366.09', '-0.39%', '28,289.19', '-0.30%', '10,506.67', '-0.54%',
    '-1', '-1', '0',
    '27', '27', '101',
    '', '', 'BELOW',
    '1', '1', '4',
  ])
  await expect(latest.nth(8)).toHaveCSS('background-color', RED)
  await expect(latest.nth(10)).not.toHaveCSS('background-color', RED)
  await expect(latest.nth(16)).toHaveCSS('background-color', DARK_GREEN)

  // Sheet row 482 (2026-11-05): three red ROC cells, all three 10% below high, WARNING, and a SOX trough date.
  const selloff = row(page, '2026-11-05').getByRole('cell')
  await expect(selloff.nth(0)).toHaveAttribute('data-trough', 'true')
  await expect(selloff.nth(1)).toHaveText('WARNING')
  await expect(selloff.nth(1)).toHaveCSS('background-color', DARK_RED)
  await expect(selloff.nth(3)).toHaveText('-5.52%')
  await expect(selloff.nth(3)).toHaveCSS('background-color', RED)
  await expect(selloff.nth(7)).toHaveText('-12.25%')
  await expect(selloff.nth(7)).toHaveCSS('background-color', RED)
  await expect(selloff.nth(8)).toHaveText('-2')
  await expect(selloff.nth(14)).toHaveText('BELOW')
  await expect(row(page, '2026-11-06').getByRole('cell').nth(0)).not.toHaveAttribute('data-trough', 'true')

  // Sheet row 484 (2026-11-09): three green ROC cells, but the net counts are still not positive.
  const rebound = row(page, '2026-11-09').getByRole('cell')
  await expect(rebound.nth(1)).toHaveText('WARNING')
  await expect(rebound.nth(3)).toHaveText('2.74%')
  await expect(rebound.nth(3)).toHaveCSS('background-color', GREEN)
  await expect(rebound.nth(7)).toHaveText('6.85%')
  await expect(rebound.nth(7)).toHaveCSS('background-color', GREEN)
  await expect(rebound.nth(10)).toHaveText('0')

  // Sheet row 478 (2026-10-30): WATCH; a -2.86% day is red, a -1.38% day (row 477) is not.
  const watch = row(page, '2026-10-30').getByRole('cell')
  await expect(watch.nth(1)).toHaveText('WATCH')
  await expect(watch.nth(1)).toHaveCSS('background-color', AMBER)
  await expect(watch.nth(3)).toHaveCSS('background-color', RED)
  await expect(row(page, '2026-10-29').getByRole('cell').nth(3)).not.toHaveCSS('background-color', RED)

  // 2026-10-02: RECOVERY from NDX +1 and SOX +1 while Nasdaq is 0.
  const recovery = row(page, '2026-10-02').getByRole('cell')
  await expect(recovery.nth(1)).toHaveText('RECOVERY')
  await expect(recovery.nth(1)).toHaveCSS('background-color', DARK_GREEN)
  await expect(recovery.nth(8)).toHaveText('0')
  await expect(recovery.nth(9)).toHaveText('+1')
  await expect(recovery.nth(9)).toHaveCSS('background-color', LIGHT_GREEN)
  // 2026-09-18: the SOX net count turns +1 from 0 (yellow in the workbook).
  await expect(row(page, '2026-09-18').getByRole('cell').nth(10)).toHaveText('+1')
  await expect(row(page, '2026-09-18').getByRole('cell').nth(10)).toHaveCSS('background-color', YELLOW)
})

test('Market Signal can show every row since the start date and skips holidays', async ({ page }) => {
  await mockModel(page)
  await page.goto('/market-signal')

  await expect(page.locator('section[aria-label="Market Signal table"] tbody tr')).toHaveCount(60)
  await page.getByRole('tab', { name: 'All since 2025-01-02' }).click()
  await expect(page.locator('section[aria-label="Market Signal table"] tbody tr')).toHaveCount(model.rows.length)

  await expect(row(page, '2025-01-09')).toHaveCount(0)
  await expect(row(page, '2025-01-20')).toHaveCount(0)
  await expect(row(page, '2025-04-18')).toHaveCount(0)
  await expect(row(page, '2025-01-21').getByRole('cell')).toHaveText([
    '2025-01-21', 'WATCH',
    '19,756.78', '0.64%', '21,566.51', '0.58%', '5,378.49', '1.29%',
    '0', '0', '+2',
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

  // The forum author's April 2025 table: SOX alone at +1 on the 23rd is still WARNING; two of three on the 25th is RECOVERY.
  await expect(row(page, '2025-04-23').getByRole('cell')).toHaveText([
    '2025-04-23', 'WARNING',
    '16,708.05', '2.50%', '18,693.26', '2.28%', '3,983.92', '3.96%',
    '0', '0', '+1',
    '44', '44', '63',
    'BELOW', 'BELOW', 'BELOW',
    '3', '2', '3',
  ])
  await expect(row(page, '2025-04-23').getByRole('cell').nth(3)).toHaveCSS('background-color', GREEN)
  await expect(row(page, '2025-04-25').getByRole('cell').nth(1)).toHaveText('RECOVERY')
  await expect(row(page, '2025-04-25').getByRole('cell').nth(8)).toHaveText('+1')
  await expect(row(page, '2025-04-08').getByRole('cell').nth(10)).toHaveText('-4')
  await expect(row(page, '2025-11-24').getByRole('cell').nth(1)).toHaveText('RECOVERY')
})

test('Market Signal lists the SOX trough dates and highlights them in the table', async ({ page }) => {
  await mockModel(page)
  await page.goto('/market-signal')

  const list = page.getByTestId('trough-list').locator('tbody tr')
  await expect(list).toHaveCount(9)
  await expect(list.first().getByRole('cell')).toHaveText(['2026-11-05', 'PHLX SOX', '9,011.14', '-31.8%', '2026-10-06', '2026-11-09'])
  await expect(list.last().getByRole('cell')).toHaveText(['2025-04-08', 'PHLX SOX', '3,562.94', '-34.9%', '2025-01-22', '2025-04-09'])

  await page.getByRole('tab', { name: 'All since 2025-01-02' }).click()
  const highlighted = page.locator('section[aria-label="Market Signal table"] td[data-trough="true"]')
  await expect(highlighted).toHaveText([
    '2026-11-05', '2026-09-14', '2026-07-29', '2026-06-10', '2026-03-30', '2025-12-17', '2025-11-20', '2025-04-21', '2025-04-08',
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
  await expect(page.getByText('No confirmed trough since 2025-01-02.')).toBeVisible()
})

test('Market Signal is reachable from the home page and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockModel(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'Market Signal' }).click()
  await expect(page).toHaveURL(/\/market-signal$/)
  await expect(page.getByTestId('latest-signal')).toHaveText('WATCH')

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client)
})
