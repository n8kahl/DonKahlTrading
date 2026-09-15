import { expect, test } from '@playwright/test'

const response = {
  dates: ['2026-09-14', '2026-09-11'],
  symbols: ['SOXL', 'TQQQ', 'FNGG', 'TECL', 'TNA', 'MSTR', 'YINN', 'TAN'],
  rows: [
    {
      date: '2026-09-14', symbol: 'SOXL', std: 'B', alt: '', bull: '',
      rsi: 4.2, pctRise: 0.01, pctFall: -0.21, daysFromHigh: 12,
      qqqDaysSince63dHigh: 3, pyImpact: 'PY_Danger',
      regimes: { sma: 'Bull', nhnl: 'Unavailable', dbe: 'Bull' },
      bullSignalEligible: false,
    },
    {
      date: '2026-09-11', symbol: 'SOXL', std: '', alt: '', bull: '',
      rsi: 25, pctRise: 0.03, pctFall: -0.08, daysFromHigh: 11,
      qqqDaysSince63dHigh: 2, pyImpact: 'PY_Danger',
      regimes: { sma: 'Bull', nhnl: 'Unavailable', dbe: 'Bull' },
      bullSignalEligible: false,
    },
  ],
  byDate: {
    '2026-09-14': {
      SOXL: {
        date: '2026-09-14', symbol: 'SOXL', std: 'B', alt: '', bull: '',
        rsi: 4.2, pctRise: 0.01, pctFall: -0.21, daysFromHigh: 12,
        qqqDaysSince63dHigh: 3, pyImpact: 'PY_Danger',
        regimes: { sma: 'Bull', nhnl: 'Unavailable', dbe: 'Bull' },
        bullSignalEligible: false,
      },
    },
    '2026-09-11': {
      SOXL: {
        date: '2026-09-11', symbol: 'SOXL', std: '', alt: '', bull: '',
        rsi: 25, pctRise: 0.03, pctFall: -0.08, daysFromHigh: 11,
        qqqDaysSince63dHigh: 2, pyImpact: 'PY_Danger',
        regimes: { sma: 'Bull', nhnl: 'Unavailable', dbe: 'Bull' },
        bullSignalEligible: false,
      },
    },
  },
  health: {
    status: 'degraded', priceDataThrough: '2026-09-14', breadthDataThrough: '2026-09-14',
    breadthMode: 'unavailable', staleSymbols: [], unavailableSources: ['NYA'],
    notes: ['Legacy NH/NL history is warming up: 1/9 contiguous completed sessions.'],
  },
  meta: { lastFetchedAt: '2026-09-15T18:00:00Z', marketStatus: 'open', isDelayed: false },
  methodology: {
    workbookParity: 'formula-faithful-v1', nhnl: 'legacy breadth unavailable/warming-up',
    partialDailyBarPolicy: 'current session excluded',
  },
}

async function mockModel(page: import('@playwright/test').Page) {
  await page.route('**/api/st-model?days=126', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  })
}

test('ST Model defaults to a clear today-first signal surface', async ({ page }) => {
  await mockModel(page)
  await page.goto('/st-model')

  await expect(page.getByRole('heading', { name: 'ST Model' })).toBeVisible()
  await expect(page.getByText('Core signals')).toBeVisible()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await expect(page.getByText('1 of 8 symbols')).toBeVisible()
  await expect(page.getByText('Bull layer')).toBeVisible()
  await expect(page.getByText('Limited', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Today by symbol' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'SOXL' })).toBeVisible()
  await expect(page.getByText('Signal active')).toBeVisible()
  await expect(page.getByText('Std B')).toBeVisible()
  await expect(page.getByText('No signal today').first()).toBeVisible()
  await expect(page.getByText('Core ST signals are live; full Bull confirmation is limited')).toBeVisible()

  await page.getByText('Data health details').click()
  await expect(page.getByText('Unavailable sources: NYA')).toBeVisible()
  await expect(page.getByText(/warming up: 1\/9/)).toBeVisible()
})

test('signal history hides blank workbook rows and keeps only actual signals', async ({ page }) => {
  await mockModel(page)
  await page.goto('/st-model')

  await page.getByRole('tab', { name: 'Signal history' }).click()
  await expect(page.getByRole('heading', { name: 'Signal history' })).toBeVisible()
  await expect(page.getByText('2026-09-14')).toBeVisible()
  await expect(page.getByText('2026-09-11')).toHaveCount(0)
  await expect(page.getByText('Std B')).toBeVisible()
})

test('mobile view is page-responsive and contains spreadsheet overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockModel(page)
  await page.goto('/st-model')

  await expect(page.getByRole('heading', { name: 'Today by symbol' })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(8)

  const defaultWidths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(defaultWidths.scroll).toBeLessThanOrEqual(defaultWidths.client)

  await page.getByRole('tab', { name: 'Spreadsheet view' }).click()
  await expect(page.getByRole('columnheader', { name: 'SOXL' })).toBeVisible()

  const spreadsheetWidths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(spreadsheetWidths.scroll).toBeLessThanOrEqual(spreadsheetWidths.client)
})
