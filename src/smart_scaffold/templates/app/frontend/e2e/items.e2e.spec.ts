import { expect, test } from '@playwright/test'

import { cjkButton, login } from './helpers'

/** 每一輪用不一樣的代號，免得被上一次跑剩下的資料絆倒。 */
function uniqueCode(): string {
  return `E2E-${Date.now().toString().slice(-6)}`
}

test.describe('資料列表', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/items')
  })

  test('列表顯示種好的範例資料', async ({ page }) => {
    await expect(page.getByRole('cell', { name: 'A-001' })).toBeVisible()
    await expect(page.getByText(/共 \d+ 筆/)).toBeVisible()
  })

  test('搜尋會縮小結果，重置會還原', async ({ page }) => {
    await page.getByPlaceholder('搜尋代號或名稱').fill('A-001')
    await page.getByRole('button', { name: cjkButton('查詢') }).click()
    await expect(page.getByText('共 1 筆')).toBeVisible()

    await page.getByRole('button', { name: cjkButton('重置') }).click()
    await expect(page.getByRole('cell', { name: 'A-002' })).toBeVisible()
  })

  test('新增、編輯、刪除走完一圈', async ({ page }) => {
    const code = uniqueCode()

    await page.getByRole('button', { name: cjkButton('新增') }).click()
    await page.getByPlaceholder('例如 A-001').fill(code)
    await page.getByPlaceholder('請輸入名稱').fill('E2E 建立的項目')
    await page.getByRole('button', { name: cjkButton('儲存') }).click()
    await expect(page.getByText('已新增')).toBeVisible()
    await expect(page.getByRole('cell', { name: code })).toBeVisible()

    const row = page.getByRole('row', { name: new RegExp(code) })
    await row.getByRole('button', { name: cjkButton('編輯') }).click()
    await page.getByPlaceholder('請輸入名稱').fill('E2E 改過的名字')
    await page.getByRole('button', { name: cjkButton('儲存') }).click()
    await expect(page.getByText('已更新')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'E2E 改過的名字' })).toBeVisible()

    await row.getByRole('button', { name: cjkButton('刪除') }).click()
    await page.getByRole('tooltip').getByRole('button', { name: cjkButton('刪除') }).click()
    await expect(page.getByText('已刪除')).toBeVisible()
    await expect(page.getByRole('cell', { name: code })).toBeHidden()
  })

  test('代號重複會顯示後端回的錯誤訊息', async ({ page }) => {
    await page.getByRole('button', { name: cjkButton('新增') }).click()
    await page.getByPlaceholder('例如 A-001').fill('A-001')
    await page.getByPlaceholder('請輸入名稱').fill('撞名的項目')
    await page.getByRole('button', { name: cjkButton('儲存') }).click()

    await expect(page.getByText('代號 A-001 已經有人用了')).toBeVisible()
  })
})
