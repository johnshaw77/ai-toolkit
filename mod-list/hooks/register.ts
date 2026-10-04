import type { Register } from 'claude-code'

import { formatTable, parseProbe, PROBE } from './list'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: '列出所有 mod：指令、有沒有載入、做什麼' })
    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    try {
      const ran = await $.process.run(PROBE)
      if (ran.exitCode !== 0) return { text: `讀不到 mod 清單（python3 結束碼 ${ran.exitCode}）：${ran.stderr.trim()}` }
      return { text: formatTable(parseProbe(ran.stdout)) }
    } catch (err) {
      return { text: `讀不到 mod 清單：${String(err)}` }
    }
  })
}
