import { expect, test } from '@playwright/test'

import { cjkButton, login, submitLogin, userMenu } from './helpers'

test.describe('登入', () => {
  test('未登入時會被導向登入頁，並記住原本要去的地方', async ({ page }) => {
    await page.goto('/items')
    await expect(page).toHaveURL(/\/login\?next=/)
    await expect(page.getByRole('heading', { name: '示範管理系統' })).toBeVisible()
  })

  test('密碼錯誤會顯示錯誤訊息而且留在登入頁', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('admin@example.com').fill('admin@example.com')
    await page.getByPlaceholder('請輸入密碼').fill('這不是密碼')
    await page.getByRole('button', { name: cjkButton('登入') }).click()

    await expect(page.getByText('帳號或密碼不正確')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('登入成功之後回到原本要去的頁面', async ({ page }) => {
    await page.goto('/items')
    await page.waitForURL(/\/login\?next=/)
    await submitLogin(page)
    await expect(page).toHaveURL(/\/items/)
  })

  test('登出之後回到登入頁，而且不能再直接進去', async ({ page }) => {
    await login(page)
    await userMenu(page).click()
    await page.getByRole('menuitem', { name: '登出' }).click()

    await expect(page).toHaveURL(/\/login/)
    await page.goto('/items')
    await expect(page).toHaveURL(/\/login/)
  })
})
