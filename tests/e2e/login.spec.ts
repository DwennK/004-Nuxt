import { expect, test } from 'playwright/test'

test('login shell exposes the expected authentication controls', async ({ page }) => {
  const response = await page.goto('/login')

  expect(response?.ok()).toBe(true)
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
  await expect(page.getByLabel('Mot de passe')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
})
