// 規則式分級：不另外呼叫模型，分錯了用 !opus／!sonnet／!haiku 蓋過

export type Tier = 'light' | 'normal' | 'heavy'
export type Force = 'opus' | 'sonnet' | 'haiku'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number
export type Route = { tier: Tier; force?: Force; why: string }
export type Step = { model: string; effort?: Effort }
export type Choice = Step & { label: string }

export const MODELS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-4-5-20251001',
} as const

// 對話已經很長就不降級：換模型要整段重付 input，降級省下的抵不過
export const LIGHT_CONTEXT_LIMIT = 150_000
const LIGHT_MAX_CHARS = 120
const HEAVY_MIN_CHARS = 600
const FOLLOWUP_MAX_CHARS = 20

const FORCE = /^\s*!(opus|sonnet|haiku)\b\s*/i
const HEAVY =
  /架構|設計|重構|除錯|排查|為什麼.{0,20}(錯|壞|失敗|不行|沒反應)|效能|安全性|資安|遷移|race condition|deadlock|refactor|architect|debug|performance|security|migrat|traceback|stack ?trace|panic:|segfault/i
const ACTION =
  /做|改|寫|修|加|刪|建|裝|跑|測|部署|實作|commit|push|deploy|fix|implement|build|add|remove|run|install|test|create|update/i
const QUESTION = /[?？]|嗎|呢|什麼|怎麼|哪|是否|有沒有|能不能|可不可以|^(what|how|why|which|is|are|can|does|do)\b/i
const BIG_MODEL = /opus|fable/i

/** 拆出開頭的 !opus／!sonnet／!haiku；只剩指定沒有內容時保留原文 */
export function parseForce(text: string): { force?: Force; text: string } {
  const m = FORCE.exec(text)
  if (m === null) return { text }
  const rest = text.slice(m[0].length)
  return { force: (m[1] ?? '').toLowerCase() as Force, text: rest.trim() === '' ? text : rest }
}

export function classify(text: string, prev: Route | undefined): Route {
  const t = text.trim()
  if (t === '') return prev ?? { tier: 'normal', why: '沒有文字' }
  if (HEAVY.test(t)) return { tier: 'heavy', why: '架構、除錯或效能類' }
  if (t.length > HEAVY_MIN_CHARS) return { tier: 'heavy', why: '長 prompt' }
  // 「好」「繼續」「照你推薦的做」：接著上一輪做，沿用上一輪的分級，也少換一次模型
  if (prev !== undefined && t.length <= FOLLOWUP_MAX_CHARS && !QUESTION.test(t)) {
    return { ...prev, why: '簡短接續，沿用上一輪' }
  }
  if (t.length <= LIGHT_MAX_CHARS && QUESTION.test(t) && !ACTION.test(t)) return { tier: 'light', why: '簡短問答' }
  return { tier: 'normal', why: '一般' }
}

const RANK = ['low', 'medium', 'high', 'xhigh', 'max'] as const

function atLeast(effort: Effort | undefined, min: (typeof RANK)[number]): Effort {
  if (typeof effort === 'number') return effort
  if (effort === undefined) return min
  return RANK.indexOf(effort) >= RANK.indexOf(min) ? effort : min
}

const short = (model: string): string => model.replace(/^claude-/, '').replace(/-\d{8}$/, '')

function withLabel(step: Step, tag: string): Choice {
  const effort = step.effort === undefined ? '' : `·${step.effort}`
  return { ...step, label: `${short(step.model)}${effort}（${tag}）` }
}

/** 依分級決定這一輪用的模型與 effort；session 是使用者原本的設定 */
export function choose(route: Route, session: Step, contextTokens: number): Choice {
  if (route.force !== undefined) {
    const model = MODELS[route.force]
    // Haiku 不吃 effort，交給引擎用它的預設
    const step: Step = route.force === 'haiku' || session.effort === undefined ? { model } : { model, effort: session.effort }
    return withLabel(step, `指定 ${route.force}`)
  }
  switch (route.tier) {
    case 'heavy': {
      const model = BIG_MODEL.test(session.model) ? session.model : MODELS.opus
      return withLabel({ model, effort: atLeast(session.effort, 'high') }, '難題')
    }
    case 'light': {
      const canDowngrade = BIG_MODEL.test(session.model) && contextTokens <= LIGHT_CONTEXT_LIMIT
      return withLabel({ model: canDowngrade ? MODELS.sonnet : session.model, effort: 'low' }, canDowngrade ? '輕量' : '輕量・對話太長不降級')
    }
    case 'normal':
      return withLabel(session, '一般')
  }
}

/** 子 agent 依類型挑模型；undefined＝不插手（呼叫端自己指定的也不插手） */
export function subagentModel(subagentType: string): Force | undefined {
  const t = subagentType.toLowerCase()
  if (t === 'explore' || t === 'claude-code-guide' || t === 'statusline-setup') return 'haiku'
  if (t === 'plan' || /review|architect|planner|security/.test(t)) return 'opus'
  return undefined
}
