// 換話題提醒：把新請求跟前面幾則對話一起問 TypeSafe Jev，有把握沒關係就提醒 /clear；這裡只放純函式

export type Verdict = { related: boolean; confidence: number }
export type Turn = { role: 'user' | 'assistant'; text: string }

export const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone'
export const TIMEOUT_MS = 1500
// 信心要夠高才提醒：誤報一次就讓人想關掉
export const MIN_CONFIDENCE = 0.8
// 對話比開場多出這麼多才值得問：太短的話 /clear 省不了什麼
export const MIN_GROWTH_TOKENS = 10_000
// 提醒過一次之後，隔這麼多則 prompt 才會再提醒；你沒清就別一直煩
export const COOLDOWN_PROMPTS = 3
const FOLLOWUP_MAX_CHARS = 12
const RECENT_MESSAGES = 6
const SNIPPET_CHARS = 300

const QUESTION = /[?？]|嗎|呢|什麼|怎麼|哪|是否|有沒有|能不能|可不可以|^(what|how|why|which|is|are|can|does|do)\b/i

/** 「好」「繼續」「照你推薦的做」：一定是接著前面做，不用問 */
export function isFollowup(text: string): boolean {
  const t = text.trim()
  return t.length <= FOLLOWUP_MAX_CHARS && !QUESTION.test(t)
}

/** `/topic`、`/topic on`、`/topic off`；看不懂回傳 undefined */
export function toggled(isOn: boolean, args: string): boolean | undefined {
  const a = args.trim().toLowerCase()
  if (a === '') return !isOn
  if (a === 'on') return true
  if (a === 'off') return false
  return undefined
}

/** 對話比開場多出的 tokens；baseline 是這個 session 看過最小的非零長度（compact 或 clear 後會變小） */
export function growth(tokens: number, baseline: number | undefined): { growth: number; baseline: number | undefined } {
  if (tokens <= 0) return { growth: 0, baseline }
  const b = baseline === undefined ? tokens : Math.min(baseline, tokens)
  return { growth: tokens - b, baseline: b }
}

const clip = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= SNIPPET_CHARS ? t : `${t.slice(0, SNIPPET_CHARS)}…`
}

/** 取最近幾則有文字的訊息（工具結果那種沒有文字的 user 訊息略過），每則截短 */
export function recentTurns(messages: readonly Turn[]): Turn[] {
  return messages
    .filter(m => m.text.trim() !== '')
    .slice(-RECENT_MESSAGES)
    .map(m => ({ role: m.role, text: clip(m.text) }))
}

export function buildRequest(text: string, recent: readonly Turn[]): string {
  return JSON.stringify({
    state: JSON.stringify({ recent_conversation: recent, new_request: clip(text) }),
    model: 'jev-latest',
    questions: {
      relation: {
        type: 'choice',
        instructions:
          'Decide whether `new_request` depends on `recent_conversation`: would answering it well need anything said, decided or produced there? Judge by dependence, not by shared keywords or the same general field.',
        criteria: {
          related:
            'What: continues, questions, corrects or builds on the recent conversation. Signals: refers to something just discussed or produced ("that", "it", "the above", "also"), asks to change or extend the same code or document, reacts to the last answer. Also pick this when unsure.',
          unrelated:
            'What: a new, self-contained task that needs nothing from the recent conversation. Signals: a different project, file or subject, a general question, a fresh task that would read the same with no history at all. Not for: follow-ups that merely omit the subject.',
        },
      },
    },
  })
}

/** 讀 TypeSafe 回應；格式不對回傳 undefined，呼叫端就不提醒 */
export function parseVerdict(body: string): Verdict | undefined {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return undefined
  }
  const r = (json as { answers?: Record<string, Record<string, unknown>> }).answers?.relation
  if (r === undefined || (r.choice !== 'related' && r.choice !== 'unrelated') || typeof r.confidence !== 'number') return undefined
  return { related: r.choice === 'related', confidence: r.confidence }
}

export const shouldRemind = (v: Verdict): boolean => !v.related && v.confidence >= MIN_CONFIDENCE

export function reminder(growthTokens: number): string {
  const k = Math.round(growthTokens / 1000)
  return `🧹 這題好像跟前面無關（對話已多 ${k}k tokens），要不要先 /clear？`
}
