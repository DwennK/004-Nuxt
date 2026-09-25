import { expect, test, type Locator } from 'playwright/test'

// Opt-in local UI checks with the development login. Financial writes are intercepted.
const baseURL = process.env.POS_MONEY_E2E_URL
test.skip(!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL), 'Requires a local POS test server')
test.use({ baseURL, viewport: { width: 1440, height: 900 } })

async function focusInput(input: Locator) {
  await input.focus()
  // POS selects the current value on the next frame; wait before replacing it.
  await input.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

async function clearInput(input: Locator) {
  await focusInput(input)
  await input.fill('')
}

test('money fields accept both separators without changing amounts or validation', async ({ page, context }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const login = await context.request.post('/api/auth/login', {
    data: { email: 'test@live.fr', password: 'test', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' }
  })
  expect(login.ok()).toBe(true)

  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'GET') return route.continue()
    await route.fulfill({ status: 409, json: { message: 'Écriture interceptée par le test' } })
  })
  await page.goto('/sales/new')
  await expect(page.getByRole('textbox', { name: 'cable, coque, chargeur, verre...' })).toBeFocused()
  await page.getByRole('button', { name: 'Nouvelle ligne', exact: true }).click()
  await page.getByRole('textbox', { name: 'Libellé de la ligne', exact: true }).fill('Test séparateurs')
  const price = page.getByRole('spinbutton', { name: 'Prix unitaire', exact: true })
  const cash = page.getByRole('spinbutton').last()

  for (const text of ['13.50', '13,50', '-2.50', '-2,50']) {
    await clearInput(price)
    await price.pressSequentially(text)
    await price.press('Tab')
    await expect(price).toHaveValue(text.replace('.', ','))
    await expect(price).toHaveAttribute('aria-valuenow', text.replace(',', '.').replace(/0$/, ''))
  }

  // Real clipboard paste follows a different browser path from typing/fill.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  for (const text of ['1234.50', '1234,50']) {
    await clearInput(price)
    await page.evaluate(value => navigator.clipboard.writeText(value), text)
    await price.press('ControlOrMeta+V')
    await price.press('Tab')
    await expect(price).toHaveAttribute('aria-valuenow', '1234.5')
  }

  await focusInput(price)
  await price.fill('13,50')
  await price.press('Tab')
  await expect(price).toHaveAttribute('aria-valuenow', '13.5')
  await focusInput(price)
  await price.evaluate((input: HTMLInputElement) => input.setSelectionRange(2, 3))
  await price.pressSequentially('.')
  await expect(price).toHaveValue('13,50')
  await price.evaluate((input: HTMLInputElement) => input.setSelectionRange(input.value.length, input.value.length))
  await price.pressSequentially('.')
  await expect(price).toHaveValue('13,50') // A second separator is rejected.
  await price.press('Tab')

  await clearInput(cash)
  await cash.pressSequentially('20.50')
  await cash.press('Tab')
  await expect(cash).toHaveAttribute('aria-valuenow', '20.5')
  await expect(page.getByText('7.00 CHF', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('money-desktop.png') })

  const submitted = page.waitForRequest('**/api/sales/create-and-pay')
  await page.getByRole('button', { name: 'Encaisser · Espèces (F2)', exact: true }).click()
  const payload = (await submitted).postDataJSON()
  expect(payload.document.lines[0].unitPrice).toBe(1350)
  expect(payload.payment.notes).toContain('20.50')
  expect(payload.payment.notes).toContain('7.00')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(price).toHaveAttribute('inputmode', 'decimal')
  await clearInput(price)
  await price.pressSequentially('14.50')
  await price.press('Tab')
  await expect(price).toHaveAttribute('aria-valuenow', '14.5')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('money-mobile.png') })

  await clearInput(price)
  await price.press('Tab')
  await expect(page.getByRole('button', { name: 'Encaisser · Carte / TWINT (F3)', exact: true })).toBeDisabled()
  expect(errors).toEqual([])
})
