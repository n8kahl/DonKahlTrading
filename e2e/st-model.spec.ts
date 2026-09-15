import { expect, test } from '@playwright/test'

const response = {
  dates: ['2026-09-14', '2026-09-11'],
  symbols: ['SOXL', 'TQQQ', 'FNGG', 'TECL', 'TNA', 'MSTR', 'YINN', 'TAN'],
  rows: [],
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
    status: 'degraded', priceDataThrough: '2026-09-14', breadthDataThrough: '2024-02-15',
    breadthMode: 'unavailable', staleSymbols: [], unavailableSources: ['NYA'],
    notes: ['Legacy Nasdaq NH/NL input is unavailable; Bull composite signals are gated off.'],
  },
  meta: { lastFetchedAt: '2026-09-15T18:00:00Z', marketStatus: 'open', isDelayed: false },
  methodology: {
    workbookParity: 'formula-faithful-v1', nhnl: 'unavailable-not-substituted',
    partialDailyBarPolicy: 'current session excluded',
  },
}

test('ST Model renders workbook-style signals and visible breadth gate', async ({ page }) => {
  await page.route('**/api/st-model?days=126', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  })

  await page.goto('/st-model')
  await expect(page.getByRole('heading', { name: 'ST Model' })).toBeVisible()
  await expect(page.getByText('Price data through')).toBeVisible()
  await expect(page.getByText('2026-09-14')).toBeVisible()
  await expect(page.getByText('NH/NL confirmation is intentionally gated')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'SOXL' })).toBeVisible()
  await expect(page.getByText('B', { exact: true }).first()).toBeVisible()
})
