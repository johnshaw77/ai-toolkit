import type { EngineInterface, Register } from 'claude-code'

import { buildRequest, COOLDOWN_PROMPTS, growth, isFollowup, MIN_GROWTH_TOKENS, parseVerdict, recentTurns, reminder, shouldRemind, TIMEOUT_MS, toggled, TYPESAFE_URL } from './topic'
import type { Verdict } from './topic'

const MISSING_KEY = '沒有 TYPESAFE_API_KEY，不檢查換話題'

/** 問 Jev 新請求跟前面有沒有關係；任何問題都回 problem，呼叫端就不提醒 */
async function judge($: EngineInterface, text: string): Promise<{ verdict?: Verdict; problem?: string }> {
  const key = await $.env.get('TYPESAFE_API_KEY')
  if (key === undefined || key === '') return { problem: MISSING_KEY }
  try {
    const messages = await $.session.messages()
    const recent = recentTurns(messages.map(m => ({ role: m.role, text: m.text })))
    // 還沒有任何對話就沒什麼好比的
    if (recent.length === 0) return {}
    // $ 呼叫期間 hook 預算會暫停，fetch 卡住不會被切斷，所以自己限時
    const res = await Promise.race([
      $.http.fetch(TYPESAFE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: buildRequest(text, recent),
      }),
      $.clock.sleep(TIMEOUT_MS).then(() => undefined),
    ])
    if (res === undefined) return { problem: 'Jev 逾時，這次不檢查換話題' }
    if (!res.ok) return { problem: `Jev 回 ${res.status}，這次不檢查換話題` }
    const verdict = parseVerdict(res.text)
    return verdict === undefined ? { problem: 'Jev 回應看不懂，這次不檢查換話題' } : { verdict }
  } catch {
    return { problem: '連不上 Jev，這次不檢查換話題' }
  }
}

export const register: Register = on => {
  let isOn = true
  // 這個 session 看過最小的非零對話長度＝開場的固定開銷；關著也量，中途打開才算得對
  let baseline: number | undefined
  let hasWarnedKey = false
  // 距離上次提醒又送了幾則 prompt；起始值讓第一次不受冷卻限制
  let sinceRemind = COOLDOWN_PROMPTS

  on('session.start', async ($, e, next) => {
    isOn = (await $.store.get('isOn')) !== false
    await $.command.register({ name: 'topic', description: '換話題時提醒 /clear（TypeSafe Jev）：/topic on｜off，不給就切換', argumentHint: 'on|off' })
    return next(e)
  })

  on('command.run', { command: 'topic' }, async ($, e) => {
    const next = toggled(isOn, e.args)
    if (next === undefined) return { text: `看不懂「${e.args.trim()}」。用法：/topic on｜off，不給就切換。` }
    isOn = next
    await $.store.set('isOn', isOn)
    return { text: isOn ? '換話題提醒：開，新請求跟前面無關時會提醒你 /clear。' : '換話題提醒：關。' }
  })

  on('turn.step', async function* ($, e, next) {
    // 只量主對話；量長度不收費
    if (e.agentId === undefined) {
      const { context } = await $.session.usage()
      baseline = growth(context.tokens ?? 0, baseline).baseline
    }
    return yield* next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!isOn || e.origin.kind !== 'composer') return next(e)
    const text = e.text.trim()
    if (text.startsWith('/') || isFollowup(text)) return next(e)
    sinceRemind++
    if (sinceRemind <= COOLDOWN_PROMPTS) return next(e)
    const { context } = await $.session.usage()
    const g = growth(context.tokens ?? 0, baseline)
    baseline = g.baseline
    if (g.growth < MIN_GROWTH_TOKENS) return next(e)
    const { verdict, problem } = await judge($, text)
    if (problem === MISSING_KEY) {
      if (!hasWarnedKey) $.ui.toast(`🧹 ${problem}`)
      hasWarnedKey = true
    } else if (problem !== undefined) {
      $.ui.toast(`🧹 ${problem}`)
    }
    if (verdict !== undefined && shouldRemind(verdict)) {
      $.ui.toast(reminder(g.growth))
      sinceRemind = 0
    }
    // 只提醒，不擋 prompt
    return next(e)
  })
}
