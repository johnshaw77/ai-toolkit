import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { fallback, parseLabel, parseProbe, PROBE, withLabel } from './badge'

const badge = atom({ plugin: 'host-badge', key: 'badge' } as const, null)

async function probe($: EngineInterface) {
  try {
    const { stdout } = await $.process.run(PROBE, { timeoutMs: 5_000 })
    return parseProbe(stdout)
  } catch {
    return fallback('')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const b = await probe($)
    await update($, badge, () => b)
    $.ui.toast(`目前在 ${b.label}`)
    $.ui.status(`⬢ ${b.label}`)
    await $.command.register({ name: 'badge', description: '改機器名稱色塊：/badge <名稱>，不給就顯示目前名稱' })
    return next(e)
  })

  on('command.run', { command: 'badge' }, async ($, e) => {
    const label = parseLabel(e.args)
    const now = await read($, badge)
    if (!label) return { text: `目前是 ${now?.label ?? '（未載入）'}。用法：/badge <名稱>` }

    const path = `${await $.env.get('HOME')}/.claude/host-badge.json`
    const old = await $.fs.read(path).catch(() => '')
    await $.fs.write(path, withLabel(old, label))
    await update($, badge, b => ({ label, color: b?.color ?? fallback('').color }))
    $.ui.status(`⬢ ${label}`)
    return { text: `色塊名稱改成 ${label}（已寫入 ${path}）` }
  })

  // 放在最上面一行；疊加寫法，下層 mod 的畫面接在下面
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = await read($, badge)
    if (e.props.hasSurvey || b === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Text>
          <Text backgroundColor={b.color} color="black" bold>
            {`  ${b.label}  `}
          </Text>
        </Text>
        {below}
      </Box>
    )
  })
}
