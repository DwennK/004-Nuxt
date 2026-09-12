import { expect, test } from 'playwright/test'

// This opt-in suite requires the disposable database and records in docs/dossier-editing.md.
// Never run these financial writes against a developer's ordinary configured database.
const baseURL = process.env.POS_DOSSIER_E2E_URL
test.skip(!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL), 'Requires the isolated local dossier test server')
test.use({ baseURL, viewport: { width: 1440, height: 900 } })

test('reservation, takeover, preserved draft, save, reminders and mobile layout', async ({ page, context }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const login = await context.request.post('/api/auth/login', { data: { email: 'test@live.fr', password: 'test', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' } })
  expect(login.ok()).toBe(true)
  await page.goto('/documents/1')
  const line = page.getByRole('textbox', { name: 'Libellé de la ligne', exact: true })
  await expect.poll(async () => await line.isEnabled() || await page.getByRole('button', { name: 'Reprendre la main', exact: true }).isVisible()).toBe(true)
  if (await page.getByRole('button', { name: 'Reprendre la main', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Reprendre la main', exact: true }).click()
    await page.getByRole('button', { name: 'Charger et continuer', exact: true }).click()
  }
  await expect(line).toBeEnabled()
  await line.fill('Brouillon non enregistré du poste A')
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()

  const other = await context.newPage()
  other.on('pageerror', error => errors.push(error.message))
  await other.goto('/dossiers/1/edit')
  await expect(other.getByTestId('dossier-banner')).toContainText('Dossier ouvert sur un autre poste')
  await expect(other.getByRole('textbox', { name: 'Libellé de la ligne', exact: true })).toBeDisabled()
  await expect(other.getByRole('button', { name: /^Cloner /, exact: false })).toBeDisabled()
  await expect(page.getByTestId('dossier-banner')).toBeVisible({ timeout: 20_000 })
  await other.getByRole('button', { name: 'Reprendre la main', exact: true }).click()
  await other.getByRole('button', { name: 'Charger et continuer', exact: true }).click()
  await expect(other.getByRole('textbox', { name: 'Libellé de la ligne', exact: true })).toBeEnabled()
  await page.bringToFront()
  await expect(page.getByTestId('dossier-banner')).toContainText('Modification suspendue', { timeout: 20_000 })
  await expect(line).toHaveValue('Brouillon non enregistré du poste A')
  await expect(line).toBeDisabled()
  await page.getByTestId('unsaved-changes').click()
  await expect(page.getByRole('menuitem', { name: 'Copier les saisies' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: testInfo.outputPath('dossier-desktop.png') })

  await other.getByRole('textbox', { name: 'Libellé de la ligne', exact: true }).fill('Travail enregistré du poste B')
  await other.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click()
  await expect(other).toHaveURL(/\/dossiers\/1$/)
  const saved = await other.evaluate(async () => (await fetch('/api/tickets/1')).json())
  expect(saved.lines[0].label).toBe('Travail enregistré du poste B')
  // An HTTP request cannot bypass the visual lock by omitting its proof.
  const rejected = await other.evaluate(async () => (await fetch('/api/tickets/1/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'diagnosis' }) })).status)
  expect(rejected).toBe(428)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('dossier-banner')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('dossier-mobile.png') })

  // Local form reminder clock; server lease expiry is tested separately in SQLite tests.
  page.on('dialog', dialog => dialog.accept())
  await page.goto('/dossiers/new')
  await page.clock.install()
  await page.getByRole('textbox', { name: 'Problème signalé', exact: false }).fill('Brouillon pour le rappel sonore')
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  await page.getByTestId('unsaved-changes').click()
  await page.getByRole('menuitem', { name: 'Couper le rappel', exact: true }).click()
  await page.clock.fastForward(300_001)
  await page.getByTestId('unsaved-changes').click()
  await expect(page.getByRole('menuitem', { name: 'Rappel coupé', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 900 })
  expect(errors).toEqual([])
  await other.close()
})

test('an explicitly retried payment with a lost response is recorded only once', async ({ page, context }) => {
  expect((await context.request.post('/api/auth/login', { data: { email: 'test@live.fr', password: 'test', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' } })).ok()).toBe(true)
  await page.goto('/documents')
  const document = await page.evaluate(async () => {
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ type: 'invoice', status: 'issued', customerId: 1, ticketId: null, issuedAt: new Date().toISOString(), notes: 'Test local de réponse perdue', lines: [{ label: 'Prestation de test', quantity: 1, unitPrice: 1000, vatRate: 8.1 }] })
    })
    if (!response.ok) throw new Error(`Create test invoice: ${response.status}`)
    return response.json()
  })
  await page.goto(`/documents/${document.id}`)
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeEnabled()
  await page.getByRole('tab', { name: 'Paiements', exact: true }).click()
  await page.getByRole('button', { name: 'Acompte / autre montant', exact: true }).click()
  const paymentForm = page.getByRole('dialog')
  await paymentForm.getByRole('textbox', { name: 'Notes', exact: true }).fill('Saisie de paiement à conserver')
  await expect(paymentForm.getByTestId('unsaved-changes')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(paymentForm).not.toBeVisible()
  let dropped = false
  await page.route(`**/api/documents/${document.id}/mark-paid`, async (route) => {
    if (dropped) return route.continue()
    dropped = true
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Encaisser le solde · 10.00 CHF', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Vérifier la tentative', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Vérifier la tentative', exact: true }).click()
  await expect(page.getByText('Opération confirmée', { exact: true })).toBeVisible()
  const saved = await page.evaluate(async id => (await fetch(`/api/documents/${id}`)).json(), document.id)
  expect(saved.payments).toHaveLength(1)
  expect(saved.payments[0].amount).toBe(1000)
  await page.goto('/sales/new')
  await page.waitForFunction(() => !!(document.querySelector('#__nuxt') as HTMLElement & { __vue_app__?: unknown })?.__vue_app__)
  await page.getByRole('button', { name: 'Nouvelle ligne', exact: true }).click()
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()
})

test('different accounts retain their drafts across offline takeover and reconnection', async ({ page, context, browser }) => {
  expect((await context.request.post('/api/auth/login', { data: { email: 'test@live.fr', password: 'test', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' } })).ok()).toBe(true)
  await page.goto('/dossiers')
  const credentials = { email: `dossier-${crypto.randomUUID()}@example.test`, password: 'Local-only-test-123!', name: 'Collègue test local', isAdmin: false }
  const user = await page.evaluate(async (data) => {
    const response = await fetch('/api/settings/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!response.ok) throw new Error(`Create local colleague: ${response.status}`)
    return response.json()
  }, credentials)
  const colleague = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
  try {
    await page.goto('/documents/1')
    const line = page.getByRole('textbox', { name: 'Libellé de la ligne', exact: true })
    await expect.poll(async () => await line.isEnabled() || await page.getByRole('button', { name: 'Reprendre la main', exact: true }).isVisible()).toBe(true)
    if (await page.getByRole('button', { name: 'Reprendre la main', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Reprendre la main', exact: true }).click()
      await page.getByRole('button', { name: 'Charger et continuer', exact: true }).click()
    }
    await line.fill('Saisie conservée malgré la déconnexion')
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByTestId('dossier-banner')).toContainText('Connexion à vérifier')

    expect((await colleague.request.post('/api/auth/login', { data: { email: credentials.email, password: credentials.password, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' } })).ok()).toBe(true)
    const other = await colleague.newPage()
    await other.goto('/dossiers/1/edit')
    await expect(other.getByTestId('dossier-banner')).toContainText('Compte test POS')
    await other.getByRole('button', { name: 'Reprendre la main', exact: true }).click()
    await other.getByRole('button', { name: 'Charger et continuer', exact: true }).click()
    await expect(other.getByRole('textbox', { name: 'Libellé de la ligne', exact: true })).toBeEnabled()

    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByTestId('dossier-banner')).toContainText('Modification suspendue')
    await expect(page.getByTestId('dossier-banner')).toContainText(credentials.name)
    await expect(line).toHaveValue('Saisie conservée malgré la déconnexion')
    await expect(line).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Enregistrer les modifications', exact: true })).toBeDisabled()
  } finally {
    await context.setOffline(false)
    await colleague.close()
    await page.evaluate(async (id) => {
      await fetch(`/api/settings/users/${id}`, { method: 'DELETE' })
    }, user.id)
  }
})
