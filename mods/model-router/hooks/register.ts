import type { Register } from 'claude-code'

import { choose, classify, parseForce, subagentModel } from './classify'
import type { Choice, Route } from './classify'

export const register: Register = on => {
  let isEnabled = true
  // 上一次的分級；簡短接續會沿用它
  let route: Route | undefined
  // 一個 turn 只決定一次，turn 內每個 step 都用同一個模型，prompt cache 才接得上
  let turn: { id: string; choice: Choice } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'router', description: '開關模型自動分配' })
    $.ui.status('🧭 自動分配')
    return next(e)
  })

  on('command.run', { command: 'router' }, async $ => {
    isEnabled = !isEnabled
    $.ui.status(isEnabled ? '🧭 自動分配' : undefined)
    return { text: isEnabled ? '模型自動分配：開。' : '模型自動分配：關，之後都用你原本設定的模型。' }
  })

  on('prompt.submit', async ($, e, next) => {
    // 執行中插進來的訊息屬於正在跑的 turn，不重新分級
    if (!isEnabled || e.turnId !== undefined) return next(e)
    const { force, text } = parseForce(e.text)
    route = force !== undefined ? { tier: 'normal', force, why: `指定 ${force}` } : classify(text, route)
    turn = undefined
    return next(text === e.text ? e : { ...e, text })
  })

  on('turn.step', async function* ($, e, next) {
    if (!isEnabled || e.agentId !== undefined || route === undefined) return yield* next(e)
    if (turn?.id !== e.turnId) {
      const { context } = await $.session.usage()
      const choice = choose(route, { model: e.model, effort: e.effort }, context.tokens ?? 0)
      turn = { id: e.turnId, choice }
      $.ui.status(`🧭 ${choice.label}`)
    }
    const { model, effort } = turn.choice
    return yield* next(effort === undefined ? { ...e, model } : { ...e, model, effort })
  })

  on('agent.spawn', async ($, e, next) => {
    // fork 一定沿用主模型；呼叫端自己指定 model 就尊重它
    if (!isEnabled || e.fork || e.model !== undefined) return next(e)
    const model = subagentModel(e.subagentType)
    return next(model === undefined ? e : { ...e, model })
  })
}
