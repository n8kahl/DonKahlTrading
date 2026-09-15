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
    status: 'degraded', priceDataThrough: '2026-09-14', breadthDataThrough: '2026-09-14',
    breadthMode: 'unavailable', staleSymbols: [], unavailableSources: ['NYA'],
    notes: ['WSJ/Dow Jones NH/NL is warming up: 1/9 contiguous completed sessions.'],
  },
  meta: { lastFetchedAt: '2026-09-15T18:00:00Z', marketStatus: 'open', isDelayed: false },
  methodology: {
    workbookParity: 'formula-faithful-v1', nhnl: 'WSJ/Dow Jones Market Diary; unavailable/warming-up',
    partialDailyBarPolicy: 'current session excluded',
  },
}

test('ST Model renders workbook-style signals and visible breadth warmup gate', async ({ page }) => {
  await page.route('**/api/st-model?days=126', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  })

  await page.goto('/st-model')
  await expect(page.getByRole('heading', { name: 'ST Model' })).toBeVisible()
  await expect(page.getByText('Price data through')).toBeVisible()
  await expect(page.getByText('2026-09-14').first()).toBeVisible()
  await expect(page.getByText('Gated / warming')).toBeVisible()
  await expect(page.getByText('NH/NL confirmation is intentionally gated')).toBeVisible()
  await expect(page.getByText(/warming up: 1\/9/)).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'SOXL' })).toBeVisible()
  await expect(page.getByText('B', { exact: true }).first()).toBeVisible()
})

test('ST Model identifies active canonical WSJ breadth explicitly', async ({ page }) => {
  const active = {
    ...response,
    health: {
      ...response.health,
      breadthMode: 'wsj-dow-jones',
      notes: ['WSJ/Dow Jones NH/NL history is current with 9 contiguous completed sessions.'],
    },
  }
  await page.route('**/api/st-model?days=126', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(active) })
  })

  await page.goto('/st-model')
  await expect(page.getByText('WSJ / Dow Jones')).toBeVisible()
  await expect(page.getByText('NH/NL confirmation is intentionally gated')).toHaveCount(0)
})
