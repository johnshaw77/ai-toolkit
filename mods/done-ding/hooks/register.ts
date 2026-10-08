import type { Register } from 'claude-code'

import { DEFAULT_MIN_SECONDS, describe, messageFor, parseArgs, shouldDing, soundFor } from './ding'
import type { Config } from './ding'

export const register: Register = on => {
  let config: Config = { isOn: true, minSeconds: DEFAULT_MIN_SECONDS }

  on('session.start', async ($, e, next) => {
    const isOn = await $.store.get('isOn')
    const minSeconds = await $.store.get('minSeconds')
    config = {
      isOn: typeof isOn === 'boolean' ? isOn : true,
      minSeconds: typeof minSeconds === 'number' && minSeconds >= 1 ? minSeconds : DEFAULT_MIN_SECONDS,
    }
    await $.command.register({ name: 'ding', description: '長任務結束提示音：/ding on｜off｜<秒數門檻>' })
    return next(e)
  })

  on('command.run', { command: 'ding' }, async ($, e) => {
    const p = parseArgs(e.args)
    if (p.kind === 'invalid') return { text: `看不懂「${e.args.trim()}」。${describe(config)}` }
    if (p.kind === 'toggle') {
      config = { ...config, isOn: p.isOn }
      await $.store.set('isOn', p.isOn)
    } else if (p.kind === 'seconds') {
      config = { ...config, minSeconds: p.seconds }
      await $.store.set('minSeconds', p.seconds)
    }
    return { text: describe(config) }
  })

  on('turn.complete', async ($, e, next) => {
    const f = { reason: e.reason, durationMs: e.durationMs, agentId: e.agentId }
    if (shouldDing(f, config)) {
      const msg = messageFor(f)
      $.ui.toast(msg)
      // 沒有 afplay／osascript（非 macOS）就算了，不要因為提示音讓 turn 出錯
      void $.process.run(['afplay', soundFor(f.reason)]).catch(() => undefined)
      void $.process.run(['osascript', '-e', `display notification "${msg}" with title "Claude Code"`]).catch(() => undefined)
    }
    return next(e)
  })
}
