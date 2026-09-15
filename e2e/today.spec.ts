import { expect, test, type Page } from '@playwright/test'

const symbols = ['SOXL', 'TQQQ', 'FNGG', 'TECL', 'TNA', 'MSTR', 'YINN', 'TAN']

function point(date: string, symbol: string, std = '', alt = '') {
  return {
    date,
    symbol,
    std,
    alt,
    bull: '',
    rsi: symbol === 'SOXL' ? 4.2 : 38.5,
    pctRise: 0.04,
    pctFall: symbol === 'SOXL' ? -0.21 : -0.07,
    daysFromHigh: 6,
    qqqDaysSince63dHigh: 3,
    pyImpact: 'PY_Danger',
    regimes: { sma: 'Bull', nhnl: 'Unavailable', dbe: 'Bull' },
    bullSignalEligible: false,
  }
}

const today = '2026-09-14'
const prior = '2026-09-11'
const todayRows = symbols.map((symbol) => point(today, symbol, symbol === 'SOXL' ? 'B' : ''))
const priorRows = symbols.map((symbol) => point(prior, symbol))

const stResponse = {
  dates: [today, prior],
  symbols,
  rows: [...todayRows, ...priorRows],
  byDate: {
    [today]: Object.fromEntries(todayRows.map((row) => [row.symbol, row])),
    [prior]: Object.fromEntries(priorRows.map((row) => [row.symbol, row])),
  },
  health: {
    status: 'degraded',
    priceDataThrough: today,
    breadthDataThrough: today,
    breadthMode: 'unavailable',
    staleSymbols: [],
    unavailableSources: ['NYA'],
    notes: ['Legacy confirmation remains fail-closed.'],
  },
  meta: { marketStatus: 'open', lastFetchedAt: '2026-09-15T18:00:00Z' },
}

function metrics(daysSinceHigh: number) {
  return { daysSinceHigh, daysSinceLow: 0, pctFromHigh: 0, pctFromLow: 0, rollingHigh: 0, rollingLow: 0 }
}

const marketSymbols = ['DJI', 'SPX', 'IXIC', 'NDX', 'RUT', 'SOX']
const priorClose = [4, 5, 6, 2, 16, 5]
const latestClose = [1, 0, 2, 0, 12, 1]
const priorHigh = [4, 5, 6, 2, 16, 5]
const latestHigh = [1, 0, 2, 0, 0, 1]

const marketResponse = {
  dates: [prior, today],
  symbols: marketSymbols,
  basisClose: Object.fromEntries(marketSymbols.map((symbol, index) => [symbol, [metrics(priorClose[index]), metrics(latestClose[index])]])),
  basisHigh: Object.fromEntries(marketSymbols.map((symbol, index) => [symbol, [metrics(priorHigh[index]), metrics(latestHigh[index])]])),
  sanity: { staleSymbols: [], constantDays: [] },
  meta: { marketStatus: 'open', lastUpdated: '2026-09-15T18:00:00Z' },
}

async function mockDesk(page: Page) {
  await page.route('**/api/st-model?days=90', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stResponse) })
  })
  await page.route('**/api/extremes?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketResponse) })
  })
}

test('Today is a factual synthesis above Market and Dad model', async ({ page }) => {
  await mockDesk(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Trading Desk' })).toBeVisible()
  await expect(page.getByText(/No combined score, no invented trade recommendation/)).toBeVisible()
  await expect(page.getByText('Risk-On', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('1 active symbol')).toBeVisible()
  await expect(page.getByText('Limited', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What changed' })).toBeVisible()
  await expect(page.getByText('SOXL: Std B')).toBeVisible()
  await expect(page.getByText('RUT: breakout rejection')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Market Dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: "Dad's Model" })).toBeVisible()

  await expect(page.getByRole('link', { name: /Dad's Model/ }).first()).toHaveAttribute('href', '/st-model')
  await expect(page.getByRole('link', { name: /^Market/ }).first()).toHaveAttribute('href', '/market')
})

test('Today stays page-responsive at phone width and keeps all three primary destinations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockDesk(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Trading Desk' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/')
  await expect(page.getByRole('link', { name: 'Market' }).last()).toHaveAttribute('href', '/market')
  await expect(page.getByRole('link', { name: 'Model' })).toHaveAttribute('href', '/st-model')

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client)
})
