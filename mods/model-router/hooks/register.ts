import type { EngineInterface, Register } from 'claude-code'

import { buildRequest, choose, growth, isFollowup, MODELS, parseForce, parseVerdict, TIMEOUT_MS, toggled, TYPESAFE_URL } from './classify'
import type { Choice, Tier, Verdict } from './classify'

const STATUS_IDLE = '🧭 自動分配'
const MAX_QUEUED = 20

type Decision = { force?: Tier; verdict?: Verdict }
const MISSING_KEY = '沒有 TYPESAFE_API_KEY，先不換模型'

/** 問 Jev 這則 prompt 該用哪個模型；任何問題都回 problem，呼叫端就不換模型 */
async function judge($: EngineInterface, text: string, currentModel: string): Promise<{ verdict?: Verdict; problem?: string }> {
  const key = await $.env.get('TYPESAFE_API_KEY')
  if (key === undefined || key === '') return { problem: MISSING_KEY }
  try {
    // $ 呼叫期間 hook 預算會暫停，fetch 卡住不會被切斷，所以自己限時
    const res = await Promise.race([
      $.http.fetch(TYPESAFE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: buildRequest(text, currentModel),
      }),
      $.clock.sleep(TIMEOUT_MS).then(() => undefined),
    ])
    if (res === undefined) return { problem: 'Jev 逾時，這輪不換模型' }
    if (!res.ok) return { problem: `Jev 回 ${res.status}，這輪不換模型` }
    const verdict = parseVerdict(res.text)
    return verdict === undefined ? { problem: 'Jev 回應看不懂，這輪不換模型' } : { verdict }
  } catch {
    return { problem: '連不上 Jev，這輪不換模型' }
  }
}

export const register: Register = on => {
  // 預設關：要用的人自己 /router on
  let isOn = false
  // 下一個 turn 要套用的判斷；undefined＝沿用上一輪的模型
  let pending: Decision | undefined
  // 執行中打好、排隊的 prompt 先判斷好，等它真的變成新 turn（turn.start 帶同樣文字）再套用
  const queued = new Map<string, Decision>()
  // 上一則真人 prompt 的判斷：簡短接續沿用
  let lastVerdict: Verdict | undefined
  // 上一輪實際用的模型；只升不降要跟它比
  let current: string | undefined
  // 使用者原本設定的模型（turn.step 才知道），還沒看過時當成 Opus
  let sessionModel: string | undefined
  // 這個 session 看過最小的非零對話長度＝開場的固定開銷；開關不重設，router 中途打開也算得對
  let baseline: number | undefined
  // 一個 turn 只決定一次，turn 內每個 step 都用同一個模型，prompt cache 才接得上
  let turn: { id: string; choice: Choice } | undefined
  let hasWarnedKey = false

  const reset = (): void => {
    pending = undefined
    queued.clear()
    lastVerdict = undefined
    current = undefined
    turn = undefined
  }

  on('session.start', async ($, e, next) => {
    isOn = (await $.store.get('isOn')) === true
    await $.command.register({ name: 'router', description: '依難度自動分配模型（TypeSafe Jev）：/router on｜off，不給就切換', argumentHint: 'on|off' })
    $.ui.status(isOn ? STATUS_IDLE : undefined)
    return next(e)
  })

  on('command.run', { command: 'router' }, async ($, e) => {
    const next = toggled(isOn, e.args)
    if (next === undefined) return { text: `看不懂「${e.args.trim()}」。用法：/router on｜off，不給就切換。` }
    isOn = next
    reset()
    await $.store.set('isOn', isOn)
    $.ui.status(isOn ? STATUS_IDLE : undefined)
    return { text: isOn ? '模型自動分配：開（由 TypeSafe Jev 判斷）。' : '模型自動分配：關，之後都用你原本設定的模型。' }
  })

  on('prompt.submit', async ($, e, next) => {
    // task-notification 等非真人 prompt 沿用上一輪的模型
    if (!isOn || e.origin.kind !== 'composer') return next(e)
    if (e.text.trim().startsWith('/')) return next(e)
    const { force, text } = parseForce(e.text)
    let decision: Decision | undefined
    if (force !== undefined) {
      decision = { force }
    } else if (lastVerdict !== undefined && isFollowup(text)) {
      decision = { verdict: lastVerdict }
    } else {
      const { verdict, problem } = await judge($, text, current ?? sessionModel ?? MODELS.opus)
      if (problem === MISSING_KEY) {
        if (!hasWarnedKey) $.ui.toast(`🧭 ${problem}`)
        hasWarnedKey = true
      } else if (problem !== undefined) {
        $.ui.toast(`🧭 ${problem}`)
      }
      decision = verdict === undefined ? undefined : { verdict }
      lastVerdict = verdict
    }
    if (e.turnId === undefined) {
      pending = decision
      turn = undefined
    } else if (decision !== undefined) {
      // 執行中打的：可能排成下一個 turn，也可能被送進正在跑的 turn（那就用不到，留著也無妨）
      queued.set(text.trim(), decision)
      if (queued.size > MAX_QUEUED) queued.delete(queued.keys().next().value as string)
    }
    return next(text === e.text ? e : { ...e, text })
  })

  on('turn.start', async ($, e, next) => {
    const decision = queued.get(e.text.trim())
    if (isOn && decision !== undefined) {
      queued.delete(e.text.trim())
      pending = decision
      turn = undefined
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // 子 agent 不插手，交給 Agent Dock 和呼叫端
    if (e.agentId !== undefined) return yield* next(e)
    sessionModel = e.model
    // 開場長度每個 step 都量（不收費），關著也量，之後打開才知道對話長了多少
    const { context } = await $.session.usage()
    const g = growth(context.tokens ?? 0, baseline)
    baseline = g.baseline
    if (!isOn) return yield* next(e)
    if (turn?.id !== e.turnId) {
      const choice = choose(pending ?? {}, { model: e.model, effort: e.effort }, current ?? e.model, g.growth)
      turn = { id: e.turnId, choice }
      pending = undefined
      current = choice.model
      $.ui.status(`🧭 ${choice.label}`)
    }
    const { model, effort } = turn.choice
    // 換成 Haiku 時要把使用者原本的 effort 拿掉，不能沿用 e 裡的
    const { effort: _, ...rest } = e
    return yield* next(effort === undefined ? { ...rest, model } : { ...rest, model, effort })
  })
}
