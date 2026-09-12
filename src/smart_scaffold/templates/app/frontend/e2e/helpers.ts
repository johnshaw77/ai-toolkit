import { expect, type Page } from '@playwright/test'

export const ADMIN_EMAIL = 'admin@example.com'
export const ADMIN_PASSWORD = 'admin1234'

/**
 * antd 會在「只有兩個中文字」的按鈕中間插一個空白（「儲存」變成「儲 存」），
 * 但 link/text 型別的按鈕不會。與其記住哪個會哪個不會，一律用這個寬鬆的比對。
 */
export function cjkButton(text: string): RegExp {
  return new RegExp(text.split('').join('\\s*'))
}

/**
 * 只填表單送出，假設目前已經在登入頁。
 *
 * 跟 `login()` 分開是因為「未登入被踢到登入頁」這種情境要自己控制導向時機：
 * `page.goto()` 在初次載入就 resolve 了，**SPA 的路由守衛還沒把網址換掉**，
 * 這時候去判斷 `page.url()` 會得到舊的值。
 */
export async function submitLogin(page: Page): Promise<void> {
  await page.getByPlaceholder('admin@example.com').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('請輸入密碼').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: cjkButton('登入') }).click()
  await expect(userMenu(page)).toBeVisible()
}

/** 先去 `landing`（會被守衛踢到登入頁），登入完成後回到那一頁。 */
export async function login(page: Page, landing = '/'): Promise<void> {
  await page.goto(landing)
  await page.waitForURL(/\/login/)
  await submitLogin(page)
}

/** 標題列右上角的使用者選單。首頁的統計卡也有「系統管理員」，不能用文字找。 */
export function userMenu(page: Page) {
  return page.getByRole('button', { name: '使用者選單' })
}
