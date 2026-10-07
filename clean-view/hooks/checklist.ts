// 清單的純邏輯：名稱清理、寬度計算、各種事件怎麼改動清單。
// 這裡不碰 `$`，所以測試可以直接呼叫。

import type { CleanViewChecklist, CleanViewTask } from '../types'

export const NAME_MAX_CELLS = 40
export const FALLBACK_NAME = '處理中'
export const PLACEHOLDER_TITLE = '處理你的請求'

// ---------- 名稱清理 ----------

const CODE_EXTENSIONS = [
  'tsx?', 'jsx?', 'mjs', 'cjs', 'mts', 'cts', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'swift', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'ps1',
  'json', 'ya?ml', 'toml', 'ini', 'env', 'lock', 'css', 'scss', 'sass', 'less',
  'html?', 'vue', 'svelte', 'sql', 'mdx?', 'xml', 'gradle', 'dart', 'lua', 'exs?',
  'txt', 'cfg', 'conf',
].join('|')

const BACKTICK_CODE = /`[^`]*`/g
const ANYTHING_WITH_SLASH = /[\w.~@+\-\\/]*[\\/][\w.~@+\-\\/]*/g
const CODE_FILE_NAME = new RegExp(`[\\w.\\-]*\\w\\.(?:${CODE_EXTENSIONS})(?![\\w])`, 'gi')
const EMPTY_PARENS = /\(\s*\)|（\s*）/g
// 中文字之間拿掉東西後留下的空白（「修正 的版面」→「修正的版面」）
const SPACE_BETWEEN_CJK = /(?<=[　-鿿＀-￯]) (?=[　-鿿＀-￯])/g
const EDGE_PUNCTUATION = /^[\s,;:、，：；·\-–—]+|[\s,;:、，：；·\-–—]+$/g

/** 一律經過這裡：拿掉程式碼、路徑、檔名，收合空白，首字母大寫，超過 40 格就截斷。 */
export function cleanName(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(BACKTICK_CODE, ' ')
    .replace(/`/g, ' ')
    .replace(ANYTHING_WITH_SLASH, ' ')
    .replace(CODE_FILE_NAME, ' ')
    .replace(EMPTY_PARENS, ' ')
    .replace(/\s+/g, ' ')
    .replace(SPACE_BETWEEN_CJK, '')
    .replace(EDGE_PUNCTUATION, '')
    .trim()
  if (text === '') return FALLBACK_NAME
  const capitalised = text.charAt(0).toUpperCase() + text.slice(1)
  return truncateCells(capitalised, NAME_MAX_CELLS)
}

// ---------- 顯示寬度 ----------

const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff], [0x20000, 0x3fffd],
]

function charCells(char: string): number {
  const code = char.codePointAt(0) ?? 0
  return WIDE_RANGES.some(([from, to]) => code >= from && code <= to) ? 2 : 1
}

/** 終端機上佔幾格：中日韓文字佔 2 格。 */
export function displayWidth(text: string): number {
  let cells = 0
  for (const char of text) cells += charCells(char)
  return cells
}

/** 截到 `max` 格以內；英文在字的邊界截斷，結尾加「…」。 */
export function truncateCells(text: string, max: number): string {
  if (displayWidth(text) <= max) return text
  const chars = [...text]
  let cells = 0
  let end = 0
  while (end < chars.length) {
    const next = cells + charCells(chars[end] ?? '')
    if (next > max - 1) break
    cells = next
    end += 1
  }
  let head = chars.slice(0, end).join('')
  const isMidWord = /[A-Za-z0-9]$/.test(head) && /^[A-Za-z0-9]/.test(chars[end] ?? '')
  if (isMidWord) {
    const lastSpace = head.lastIndexOf(' ')
    if (lastSpace > 0) head = head.slice(0, lastSpace)
  }
  return `${head.replace(EDGE_PUNCTUATION, '')}…`
}

/** 截斷後補空白到剛好 `cells` 格，讓欄位對齊、不換行。 */
export function fitCells(text: string, cells: number): string {
  const cut = displayWidth(text) <= cells ? text : truncateCells(text, cells)
  return cut + ' '.repeat(Math.max(0, cells - displayWidth(cut)))
}

// ---------- 時間 ----------

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分${seconds % 60}秒`
  return `${Math.floor(minutes / 60)}小時${minutes % 60}分`
}

// ---------- 進度條 ----------

export const METER_CELLS = 10

export function meter(task: CleanViewTask, tick: number): string {
  if (task.status === 'done') return '█'.repeat(METER_CELLS)
  if (task.status === 'upcoming') return '░'.repeat(METER_CELLS)
  if (task.hasReported) {
    const filled = Math.round(task.percent / 10)
    return '█'.repeat(filled) + '░'.repeat(METER_CELLS - filled)
  }
  // 還沒有百分比：一段 3 格的亮塊來回掃過
  const span = METER_CELLS + 3
  const start = (tick % span) - 3
  let out = ''
  for (let i = 0; i < METER_CELLS; i += 1) out += i >= start && i < start + 3 ? '▓' : '░'
  return out
}

// ---------- 清單 ----------

export const IDLE: CleanViewChecklist = {
  jobId: '',
  title: '',
  phase: 'idle',
  tasks: [],
  needsYouReason: null,
  stuckReason: null,
  startedAt: null,
  finishedAt: null,
  isCollapsed: false,
  hasPlan: false,
}

export function newJob(jobId: string, now: number): CleanViewChecklist {
  return {
    ...IDLE,
    jobId,
    title: PLACEHOLDER_TITLE,
    phase: 'working',
    startedAt: now,
    tasks: [
      { id: 'placeholder-1', name: '理解你的需求', status: 'active', percent: 0, hasReported: false },
      { id: 'placeholder-2', name: '規劃步驟', status: 'upcoming', percent: 0, hasReported: false },
    ],
  }
}

export function isJobOpen(c: CleanViewChecklist): boolean {
  return c.phase === 'working' || c.phase === 'needs-you' || c.phase === 'stuck'
}

export function isAnimating(c: CleanViewChecklist): boolean {
  return c.phase === 'working' || c.phase === 'needs-you'
}

/** 新的計畫進來：Claude 在動，所以清掉「需要你」和「卡住」。 */
function working(c: CleanViewChecklist, tasks: CleanViewTask[]): CleanViewChecklist {
  return { ...c, tasks, hasPlan: true, phase: 'working', needsYouReason: null, stuckReason: null }
}

export function applyPlan(c: CleanViewChecklist, steps: readonly unknown[]): CleanViewChecklist {
  const tasks = steps.slice(0, 8).map(
    (step, i): CleanViewTask => ({
      id: `step-${i + 1}`,
      name: cleanName(step),
      status: i === 0 ? 'active' : 'upcoming',
      percent: 0,
      hasReported: false,
    }),
  )
  return tasks.length === 0 ? c : working(c, tasks)
}

function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s…]+/g, '')
  return norm(a) === norm(b)
}

function findTask(tasks: readonly CleanViewTask[], name: string): number {
  const exact = tasks.findIndex(t => sameName(t.name, name))
  if (exact !== -1) return exact
  const norm = (s: string) => s.toLowerCase().replace(/[\s…]+/g, '')
  const wanted = norm(name)
  if (wanted.length < 2) return -1
  return tasks.findIndex(t => {
    const have = norm(t.name)
    return have.length >= 2 && (have.includes(wanted) || wanted.includes(have))
  })
}

function freshId(tasks: readonly CleanViewTask[]): string {
  let n = tasks.length + 1
  while (tasks.some(t => t.id === `step-${n}`)) n += 1
  return `step-${n}`
}

export function clampPercent(raw: unknown): number {
  const n = Math.round(Number(raw))
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

export function applyProgress(c: CleanViewChecklist, rawName: unknown, rawPercent: unknown): CleanViewChecklist {
  const name = cleanName(rawName)
  const percent = clampPercent(rawPercent)
  let tasks: CleanViewTask[] = c.hasPlan ? [...c.tasks] : []
  let idx = findTask(tasks, name)
  if (idx === -1) {
    // 不在計畫裡的名稱：當成新步驟，接在最後一個完成的步驟後面
    idx = tasks.findLastIndex(t => t.status === 'done') + 1
    tasks.splice(idx, 0, { id: freshId(tasks), name, status: 'upcoming', percent: 0, hasReported: false })
  }
  tasks = tasks.map((t, i): CleanViewTask => {
    if (i < idx) return { ...t, status: 'done', percent: 100 }
    if (i === idx) return { ...t, status: 'active', percent, hasReported: true }
    return t.status === 'active' ? { ...t, status: 'upcoming' } : t
  })
  if (percent >= 100) tasks = finishTask(tasks, idx)
  return working(c, tasks)
}

/** 勾掉第 idx 步，下一個還沒開始的步驟自動開始。 */
function finishTask(tasks: CleanViewTask[], idx: number): CleanViewTask[] {
  const nextIdx = tasks.findIndex((t, i) => i > idx && t.status === 'upcoming')
  return tasks.map((t, i): CleanViewTask => {
    if (i === idx) return { ...t, status: 'done', percent: 100, hasReported: true }
    if (i === nextIdx) return { ...t, status: 'active', percent: 0, hasReported: false }
    return t
  })
}

type Todo = { content?: unknown; status?: unknown }

export function applyTodos(c: CleanViewChecklist, todos: readonly Todo[]): CleanViewChecklist {
  const tasks = todos.map((todo, i): CleanViewTask => {
    const name = cleanName(todo.content)
    const prev = c.tasks.find(t => sameName(t.name, name))
    if (todo.status === 'completed') {
      return { id: `todo-${i + 1}`, name, status: 'done', percent: 100, hasReported: true }
    }
    if (todo.status === 'in_progress') {
      const kept = prev?.status === 'active' && prev.hasReported
      return { id: `todo-${i + 1}`, name, status: 'active', percent: kept ? prev.percent : 0, hasReported: kept }
    }
    return { id: `todo-${i + 1}`, name, status: 'upcoming', percent: 0, hasReported: false }
  })
  return tasks.length === 0 ? c : working(c, tasks)
}

export function applyTaskCreate(c: CleanViewChecklist, taskId: string, subject: unknown): CleanViewChecklist {
  const base = c.hasPlan ? c.tasks : []
  const id = `task-${taskId}`
  const name = cleanName(subject)
  if (base.some(t => t.id === id)) {
    return working(c, base.map(t => (t.id === id ? { ...t, name } : t)))
  }
  const hasActive = base.some(t => t.status === 'active')
  const task: CleanViewTask = { id, name, status: hasActive ? 'upcoming' : 'active', percent: 0, hasReported: false }
  return working(c, [...base, task])
}

type TaskPatch = { subject?: unknown; status?: unknown }

export function applyTaskUpdate(c: CleanViewChecklist, taskId: string, patch: TaskPatch): CleanViewChecklist {
  const id = `task-${taskId}`
  let tasks = c.hasPlan ? [...c.tasks] : []
  if (!tasks.some(t => t.id === id)) {
    if (patch.subject === undefined) return c
    tasks.push({ id, name: cleanName(patch.subject), status: 'upcoming', percent: 0, hasReported: false })
  }
  if (patch.status === 'deleted') return working(c, tasks.filter(t => t.id !== id))
  tasks = tasks.map((t): CleanViewTask => {
    if (t.id !== id) return t
    const named = patch.subject === undefined ? t : { ...t, name: cleanName(patch.subject) }
    if (patch.status === 'completed') return { ...named, status: 'done', percent: 100, hasReported: true }
    if (patch.status === 'in_progress') return { ...named, status: 'active' }
    if (patch.status === 'pending') return { ...named, status: 'upcoming', percent: 0, hasReported: false }
    return named
  })
  return working(c, tasks)
}

// ---------- 狀態文字 ----------

export const REASONS = {
  permission: 'Claude 需要你同意才能繼續',
  question: 'Claude 有問題想問你',
  elicitation: 'Claude 需要你提供一些資料',
  waitingReply: 'Claude 在等你回覆',
  rejected: '你拒絕了一個步驟，所以 Claude 先暫停了',
  failing: '有個步驟一直失敗，Claude 正在換個方法',
  refusal: 'Claude 無法協助這個請求',
} as const

export function notificationReason(type: string, message: string): string | null {
  if (type === 'permission_prompt') return REASONS.permission
  if (type === 'elicitation_dialog') return REASONS.elicitation
  if (type === 'idle_prompt' || type === 'auth_success') return null
  return /permission|許可|同意/i.test(message) ? REASONS.permission : null
}

/** 把 API 錯誤換成一句平靜的白話。 */
export function apiErrorReason(kind: string | undefined, details: string | undefined): string {
  const text = `${kind ?? ''} ${details ?? ''}`.toLowerCase()
  if (/prompt is too long|too many tokens|context (window|length|limit)|max_output_tokens/.test(text)) {
    return '對話太長了，請輸入 /compact 後再試一次'
  }
  if (kind === 'rate_limit' || /rate.?limit|usage limit|\b429\b/.test(text)) {
    return '你已達到使用上限，請稍後再試'
  }
  if (kind === 'overloaded' || /overloaded|\b529\b/.test(text)) {
    return 'Claude 的伺服器正忙，請過一分鐘再試'
  }
  if (
    kind === 'authentication_failed' ||
    kind === 'oauth_org_not_allowed' ||
    /authentication|unauthori[sz]ed|\b401\b|invalid api key|please run \/login/.test(text)
  ) {
    return '登入狀態失效了，請輸入 /login'
  }
  if (/econn|enotfound|eai_again|network|fetch failed|socket|timed? ?out|connection/.test(text)) {
    return '網路連線中斷了'
  }
  if (kind === 'billing_error') return '帳號的額度或付款有問題，請檢查你的方案'
  return '發生了一點問題，請再試一次'
}

export type TurnEnd = {
  reason: 'answer' | 'aborted' | 'refusal' | 'error'
  answer: string
  wasRejected: boolean
  apiError: { kind?: string; details?: string } | null
  now: number
}

/** 一輪結束時，依結束原因決定清單的最後樣子。 */
export function finishTurn(c: CleanViewChecklist, end: TurnEnd): CleanViewChecklist {
  if (!isJobOpen(c)) return c
  const stuck = (stuckReason: string): CleanViewChecklist => ({
    ...c, phase: 'stuck', stuckReason, needsYouReason: null, finishedAt: end.now,
  })
  if (end.reason === 'error') {
    return stuck(apiErrorReason(end.apiError?.kind, end.apiError?.details ?? end.answer))
  }
  if (end.reason === 'refusal') return stuck(REASONS.refusal)
  if (end.wasRejected) return stuck(REASONS.rejected)
  if (end.reason === 'aborted') {
    return { ...c, phase: 'stopped', needsYouReason: null, stuckReason: null, finishedAt: end.now }
  }
  if (c.hasPlan && c.tasks.some(t => t.status !== 'done')) {
    return { ...c, phase: 'needs-you', needsYouReason: REASONS.waitingReply, stuckReason: null }
  }
  return {
    ...c,
    phase: 'done',
    tasks: c.tasks.map(t => ({ ...t, status: 'done', percent: 100 })),
    needsYouReason: null,
    stuckReason: null,
    finishedAt: end.now,
    isCollapsed: false,
  }
}
