import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { classify, initial, isReady, reduce } from './gate'
import type { Light } from '../types'

const gate = atom({ plugin: 'gate-lights', key: 'gate' } as const, initial)
const isHidden = atom({ plugin: 'gate-lights', key: 'isHidden' } as const, false)

const GLYPH: Record<Light, { dot: string; color: 'gray' | 'green' | 'red' | 'yellow' }> = {
  idle: { dot: '○', color: 'gray' },
  pass: { dot: '●', color: 'green' },
  fail: { dot: '●', color: 'red' },
  stale: { dot: '◐', color: 'yellow' },
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    const ev = classify(e.tool, e as unknown as Record<string, unknown>)
    if (ev) {
      await update($, gate, g => reduce(g, ev, ran.isError === true))
    }
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const g = await read($, gate)
    const untouched = g.test === 'idle' && g.typecheck === 'idle' && g.verify === 'idle'
    if (e.props.hasSurvey || untouched || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const lights: [string, Light][] = [
      ['測試', g.test],
      ['型別', g.typecheck],
      ['驗證', g.needsVerify ? g.verify : 'idle'],
    ]
    const ready = isReady(g)

    // 這一格只畫得出一棵樹：把下層的畫面接在自己下面，不要蓋掉
    const below = await next(e)
    return (
      <Box flexDirection="column">
      <Box>
        {lights.map(([name, l]) => (
          <Text key={name}>
            <Text color={GLYPH[l].color}>{GLYPH[l].dot}</Text>
            <Text dimColor> {name}  </Text>
          </Text>
        ))}
        <Text color={ready ? 'green' : 'yellow'}>{ready ? '✓ 可回報' : '… 未達完成定義'} </Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
      {below}
      </Box>
    )
  })
}
