import { expect, test } from '@playwright/test'

import { login, userMenu } from './helpers'

test.describe('後台外殼', () => {
  test('走過每一頁，console 不可以有任何 error 或 warning', async ({ page }) => {
    const noise: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        noise.push(`[${message.type()}] ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => noise.push(`[pageerror] ${error.message}`))

    await login(page)
    const paths = ['/users', '/']
    // scaffold:if demo
    paths.unshift('/items')
    // scaffold:endif

    for (const path of paths) {
      await page.goto(path)
      await expect(userMenu(page)).toBeVisible()
    }

    expect(noise).toEqual([])
  })

  test('側邊欄可以在頁面之間切換', async ({ page }) => {
    await login(page)
    // scaffold:if demo
    await page.getByRole('menuitem', { name: '資料列表' }).click()
    await expect(page).toHaveURL(/\/items/)
    // scaffold:endif
    await page.getByRole('menuitem', { name: '使用者' }).click()
    await expect(page).toHaveURL(/\/users/)
    await expect(page.getByRole('cell', { name: 'admin@example.com' })).toBeVisible()
  })

  test('深色模式切換之後會記住', async ({ page }) => {
    await login(page)
    const before = await page.evaluate(() => document.documentElement.dataset.theme)
    await page.getByRole('button', { name: '切換深色模式' }).click()
    const after = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(after).not.toBe(before)

    await page.reload()
    await expect(userMenu(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after)
  })

  test('不存在的網址顯示 404，而且外殼還在', async ({ page }) => {
    await login(page)
    await page.goto('/沒有這個頁面')
    await expect(page.getByText('找不到這個頁面')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '首頁' })).toBeVisible()
  })
})
