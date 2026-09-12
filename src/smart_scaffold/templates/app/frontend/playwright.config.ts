import { defineConfig, devices } from '@playwright/test'

const FRONTEND_PORT = {{frontend_port}}
const BACKEND_PORT = {{backend_port}}

/**
 * e2e 用自己的資料庫檔，不要碰開發中的那一份——測試會新增、刪除資料，
 * 跑完你的開發資料就亂了。
 */
const E2E_DATABASE_URL = 'sqlite+aiosqlite:///./e2e.db'

const backendEnv = {
  DATABASE_URL: E2E_DATABASE_URL,
  SEED_ADMIN_EMAIL: 'admin@example.com',
  SEED_ADMIN_PASSWORD: 'admin1234',
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `uv run uvicorn app.main:app --port ${BACKEND_PORT}`,
      cwd: '../backend',
      url: `http://127.0.0.1:${BACKEND_PORT}/api/v1/health`,
      env: backendEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
