import { execFileSync } from 'node:child_process'

/**
 * 跑測試前先把 e2e 專用的資料庫建好並塞進初始資料。
 *
 * 刻意每次都從零開始（刪掉舊的 e2e.db），測試才不會被上一輪留下的資料影響——
 * 「昨天過今天不過」的假失敗多半都是這樣來的。
 */
export default function globalSetup(): void {
  const cwd = new URL('../../backend/', import.meta.url).pathname
  const env = {
    ...process.env,
    DATABASE_URL: 'sqlite+aiosqlite:///./e2e.db',
    SEED_ADMIN_EMAIL: 'admin@example.com',
    SEED_ADMIN_PASSWORD: 'admin1234',
  }

  execFileSync('uv', ['run', 'python', '-c', 'import pathlib; pathlib.Path("e2e.db").unlink(True)'], {
    cwd,
    env,
    stdio: 'inherit',
  })
  execFileSync('uv', ['run', 'alembic', 'upgrade', 'head'], { cwd, env, stdio: 'inherit' })
  execFileSync('uv', ['run', 'python', '-m', 'app.seed'], { cwd, env, stdio: 'inherit' })
}
