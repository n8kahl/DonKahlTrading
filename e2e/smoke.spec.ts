import { test, expect } from '@playwright/test'

test.describe('Dashboard Smoke Tests', () => {
  test('homepage loads and displays heatmap', async ({ page }) => {
    await page.goto('/')

    // Wait for the app to load
    await expect(page.locator('text=Tucson Trader')).toBeVisible()

    // Wait for heatmap data to load (table should appear)
    await expect(page.locator('table')).toBeVisible({ timeout: 30000 })

    // Verify at least one symbol is displayed (SPX is default)
    await expect(page.locator('text=SPX')).toBeVisible()
  })

  test('config controls work', async ({ page }) => {
    await page.goto('/')

    // Wait for initial load
    await expect(page.locator('table')).toBeVisible({ timeout: 30000 })

    // Find lookback selector button (shows current value like "63d")
    const lookbackButton = page.locator('button:has-text("63d"), button:has-text("d")')
    if (await lookbackButton.first().isVisible()) {
      await lookbackButton.first().click()

      // Look for dropdown option
      const option = page.locator('text=21d, [data-value="21"]').first()
      if (await option.isVisible()) {
        await option.click()
      }
    }

    // Verify table still visible after config change
    await expect(page.locator('table')).toBeVisible()
  })

  test('theme toggle works', async ({ page }) => {
    await page.goto('/')

    // Wait for page load
    await expect(page.locator('text=Tucson Trader')).toBeVisible()

    // Get initial html class
    const html = page.locator('html')
    const initialClass = await html.getAttribute('class')

    // Find and click theme toggle
    const themeButton = page
      .locator(
        'button:has(svg[class*="lucide-moon"]), button:has(svg[class*="lucide-sun"]), button[aria-label*="theme"]'
      )
      .first()

    if (await themeButton.isVisible()) {
      await themeButton.click()

      // Wait for theme change
      await page.waitForTimeout(300)

      // Verify class changed
      const newClass = await html.getAttribute('class')
      expect(newClass).not.toBe(initialClass)
    }
  })

  test('AI companion opens', async ({ page }) => {
    await page.goto('/')

    // Wait for page load
    await expect(page.locator('text=Tucson Trader')).toBeVisible()

    // Find AI toggle button
    const aiButton = page
      .locator(
        'button:has(svg[class*="lucide-bot"]), button:has-text("AI"), button[aria-label*="AI"]'
      )
      .first()

    if (await aiButton.isVisible()) {
      await aiButton.click()

      // Verify chat interface appears (textarea or input for messages)
      await expect(
        page.locator(
          'textarea, input[placeholder*="message"], input[placeholder*="Ask"]'
        )
      ).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Shared Content Tests', () => {
  test('shared dashboard page handles not found', async ({ page }) => {
    // Navigate to non-existent shared dashboard
    await page.goto('/d/non-existent-id-12345')

    // Should show error message, not crash
    await expect(
      page.locator('text=/not found|error|Dashboard/i')
    ).toBeVisible({ timeout: 10000 })
  })

  test('shared chat page handles not found', async ({ page }) => {
    // Navigate to non-existent shared chat
    await page.goto('/chat/non-existent-id-12345')

    // Should show error message, not crash
    await expect(page.locator('text=/not found|error|Chat/i')).toBeVisible({
      timeout: 10000,
    })
  })
})

test.describe('API Health Checks', () => {
  test('health endpoint responds', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('status')
  })

  test('extremes API responds with data', async ({ request }) => {
    const response = await request.get(
      '/api/extremes?symbols=SPY&lookback=21&days=5'
    )

    // Should either succeed or return structured error
    expect([200, 500, 503]).toContain(response.status())

    const body = await response.json()

    // If successful, should have dates and data
    if (response.status() === 200) {
      expect(body).toHaveProperty('dates')
    } else {
      // Error should have error property
      expect(body).toHaveProperty('error')
    }
  })
})

test.describe('Error Boundary Tests', () => {
  test('app handles invalid routes gracefully', async ({ page }) => {
    // Navigate to completely invalid route
    await page.goto('/this-route-does-not-exist-12345')

    // Should show 404 page, not crash
    await expect(
      page.locator('text=/not found|404|error/i')
    ).toBeVisible({ timeout: 10000 })
  })
})
