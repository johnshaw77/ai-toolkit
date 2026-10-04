import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { fallback, parseProbe, PROBE } from './badge'

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
    return next(e)
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
