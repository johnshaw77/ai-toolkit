// 分級交給 TypeSafe Jev（三選一）；這裡只放純函式：組請求、讀回應、決定這一輪用哪個模型

export type Tier = 'haiku' | 'sonnet' | 'opus'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number
export type Step = { model: string; effort?: Effort }
export type Verdict = { tier: Tier; confidence: number; score?: number }
export type Choice = Step & { label: string }

export const MODELS = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
} as const

export const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone'
// 信心低於這個值就不降級（升級照做）：不確定時留在原模型，少一次快取重寫
export const MIN_CONFIDENCE = 0.5
// 對話比開場多出這麼多之後只升不降：換模型要整段重寫快取，降級省下的抵不過。
// 只算多出的部分，system prompt 與工具定義這段固定開銷（這台約 70k）不算
export const NO_DOWNGRADE_TOKENS = 40_000
export const TIMEOUT_MS = 1500
const FOLLOWUP_MAX_CHARS = 12

const TIERS: readonly Tier[] = ['haiku', 'sonnet', 'opus']
// 不用 !：輸入框打 ! 會進 shell 模式，prompt 根本送不到模型
const FORCE = /^\s*~(opus|sonnet|haiku)\b\s*/i
const QUESTION = /[?？]|嗎|呢|什麼|怎麼|哪|是否|有沒有|能不能|可不可以|^(what|how|why|which|is|are|can|does|do)\b/i

/** 拆出開頭的 ~opus／~sonnet／~haiku；只剩指定沒有內容時保留原文 */
export function parseForce(text: string): { force?: Tier; text: string } {
  const m = FORCE.exec(text)
  if (m === null) return { text }
  const rest = text.slice(m[0].length)
  return { force: (m[1] ?? '').toLowerCase() as Tier, text: rest.trim() === '' ? text : rest }
}

/** 「好」「繼續」「照你推薦的做」：接著上一輪做，沿用上一輪的判斷，不另外問 Jev */
export function isFollowup(text: string): boolean {
  const t = text.trim()
  return t.length <= FOLLOWUP_MAX_CHARS && !QUESTION.test(t)
}

/** `/router`、`/router on`、`/router off`；看不懂回傳 undefined */
export function toggled(isOn: boolean, args: string): boolean | undefined {
  const a = args.trim().toLowerCase()
  if (a === '') return !isOn
  if (a === 'on') return true
  if (a === 'off') return false
  return undefined
}

// 上一則 prompt 不送：離線 16 題比較，帶上它反而把「這段程式的時間複雜度」誤判成 haiku（15/16 → 16/16）
export function buildRequest(text: string, currentModel: string): string {
  return JSON.stringify({
    state: JSON.stringify({ request: text, current_model: currentModel }),
    model: 'jev-latest',
    questions: {
      tier: {
        type: 'choice',
        instructions:
          'Pick the cheapest model tier that can fully complete `request` in one pass, without retrying on a stronger model. Judge the reasoning required, not the requested reply length. `current_model` is the model in use.',
        criteria: {
          haiku:
            'What: quick, mechanical work with one obvious path. Signals: translate or reformat short text, extract a value, rename or comment code, run one obvious command, answer a factual question about a known concept. Not for: writing new logic, debugging, or anything needing judgment between approaches.',
          sonnet:
            'What: everyday coding and writing with a clear scope. Signals: write a self-contained function or script, add a feature or validation to an existing component, fix a bug whose cause is visible, explain or review a given piece of code, rewrite a document for a new audience. Not for: unknown-cause debugging, cross-module design, security, concurrency, or migrations.',
          opus:
            'What: open-ended work where the hard part is reasoning. Signals: unknown-cause debugging, system or data architecture, cross-module refactors, security, auth, concurrency, migrations, strategy or root-cause analysis weighing tradeoffs. Not for: tasks whose steps are already obvious.',
        },
      },
      difficulty: {
        type: 'score',
        instructions: 'How much model capability does `request` need to be done well (not the length of the answer)?',
        criteria: [
          '單純查詢、單句翻譯、抽取、格式轉換，單一步驟、不需要推理',
          '短文字生成或改寫、簡單的單段程式或小修改，只需少量判斷',
          '範圍清楚的完整小功能、結構化內容產出，需要多個步驟但不需深入權衡',
          '多步推理或權衡分析：較大型的程式實作、跨元件設計、商業或數據問題分析',
          '長鏈推理、系統架構設計、比較多種取捨的決策，或大量程式碼產出',
        ],
      },
    },
  })
}

/** 讀 TypeSafe 回應；格式不對回傳 undefined，呼叫端就不換模型 */
export function parseVerdict(body: string): Verdict | undefined {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return undefined
  }
  const answers = (json as { answers?: Record<string, Record<string, unknown>> }).answers
  const tier = answers?.tier
  if (tier === undefined || !TIERS.includes(tier.choice as Tier) || typeof tier.confidence !== 'number') return undefined
  const score = answers?.difficulty?.score
  return { tier: tier.choice as Tier, confidence: tier.confidence, ...(typeof score === 'number' ? { score } : {}) }
}

/** 認不出來的模型（例如 fable）當成最高級，只會被升不會被降 */
export function rank(model: string): number {
  const i = TIERS.findIndex(t => model.includes(t))
  return i === -1 ? TIERS.length : i
}

const short = (model: string): string => model.replace(/^claude-/, '')

/** 對話比開場多出的 tokens；baseline 是這個 session 看過最小的非零長度（compact 後會變小） */
export function growth(tokens: number, baseline: number | undefined): { growth: number; baseline: number | undefined } {
  if (tokens <= 0) return { growth: 0, baseline }
  const b = baseline === undefined ? tokens : Math.min(baseline, tokens)
  return { growth: tokens - b, baseline: b }
}

/**
 * 決定這一輪的模型。
 * session：使用者原本的設定；current：上一輪實際用的模型（沒有就是 session）；
 * grownTokens：對話比開場多出的長度
 */
export function choose(
  input: { force?: Tier; verdict?: Verdict },
  session: Step,
  current: string,
  grownTokens: number,
): Choice {
  const keep = (model: string, tag: string): Choice => ({ ...withEffort(model, session), label: `${short(model)}（${tag}）` })
  if (input.force !== undefined) return keep(MODELS[input.force], `指定 ${input.force}`)
  const v = input.verdict
  if (v === undefined) return keep(current, '沿用')
  const target = MODELS[v.tier]
  const tag = v.confidence.toFixed(2)
  if (rank(target) < rank(current)) {
    if (v.confidence < MIN_CONFIDENCE) return keep(current, `${tag}，不確定不降級`)
    if (grownTokens > NO_DOWNGRADE_TOKENS) return keep(current, `${tag}，對話太長不降級`)
  }
  return keep(target, tag)
}

// Haiku 不吃 effort，交給引擎用它的預設；其他沿用使用者原本的 effort
function withEffort(model: string, session: Step): Step {
  return model.includes('haiku') || session.effort === undefined ? { model } : { model, effort: session.effort }
}
