// Agent Dock 的純邏輯：人數、名稱、指示文字、計數、徽章、計時、總結、進度條。
// 這裡不碰 `$`，測試可以直接呼叫；所有 `$` 呼叫都在 dock.tsx。

import type { DockCard, DockCardStatus, DockHelperModel, DockJob } from '../types'
import { cleanName, displayWidth, formatDuration, truncateCells } from './checklist'

export const SIZE_PRESETS = [1, 3, 5, 10, 20, 50, 100] as const
export const MAX_SIZE = 100
export const BIG_TEAM = 20
export const CARD_LIMIT = 12
export const SEAT_LIMIT = 25
export const DEFAULT_MAX_SUBAGENTS = 20
export const DEFAULT_MAX_TOOL_CONCURRENCY = 10

export const DOCK_PANE = 'agent-dock'
export const DOCK_TITLE = 'Agent Dock'
export const DOCK_COLUMNS = 84
export const TOO_NARROW = '視窗太窄，放不下 Agent Dock。請把視窗拉寬，或看狀態列。'

// 冷靜的深色主題：珊瑚 → 金，進行中是綠，卡住是紅
export const COLORS = {
  coral: '#FF7A59',
  gold: '#F2C14E',
  live: '#3DDC97',
  stuck: '#FF5A5F',
  hairline: '#3A3F4B',
  muted: '#8A90A0',
} as const

const BADGE_COLORS = ['#E07A5F', '#D4A373', '#81B29A', '#6D9DC5', '#B392AC', '#C9ADA7', '#8D99AE', '#A3B18A']

// ---------- 人數 ----------

/** 「10」→ 10；不是 1 到 100 的整數就是 null。 */
export function parseSize(text: unknown): number | null {
  const raw = String(text ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= MAX_SIZE ? n : null
}

/** `/dock` 的參數：「3」→ 人數 3；「3 收集台積電消息」→ 人數 3＋要送出的問題。 */
export function parseDockArgs(args: string): { size: number | null; ask: string } {
  const match = args.trim().match(/^(\S+)(?:\s+([\s\S]*))?$/)
  if (match === null) return { size: null, ask: '' }
  return { size: parseSize(match[1]), ask: (match[2] ?? '').trim() }
}

/** 新 session 讀回存檔：超過 20 人不沿用，回到 1。 */
export function restoreSize(saved: unknown): number {
  const n = parseSize(saved)
  if (n === null || n > BIG_TEAM) return 1
  return n
}

export function atATime(maxSubagents: string | undefined, maxToolConcurrency: string | undefined): number {
  const a = parseSize(maxSubagents) ?? DEFAULT_MAX_SUBAGENTS
  const b = parseSize(maxToolConcurrency) ?? DEFAULT_MAX_TOOL_CONCURRENCY
  return Math.max(1, Math.min(a, b))
}

// ---------- 名稱 ----------

const CLAUSE_BREAK = /[。！？!?\n；;，,：:]|\s[-–—]\s|\.\s/

/** 任務名稱：請求的第一個子句，約 40 格。 */
export function jobName(request: string): string {
  const first = request.trim().split(CLAUSE_BREAK).find(part => part.trim() !== '') ?? request
  return cleanName(first)
}

/** 卡片上的名稱：Agent 呼叫的描述，清乾淨、最多 28 格。 */
export function taskName(description: unknown): string {
  return truncateCells(cleanName(description), 28)
}

/**
 * 卡片上的兩個英文字母徽章，只取名稱裡的英文字：
 * 「比價：Gontran Cherrier」→ GC、「比價：PAUL 台北」→ PA；
 * 完全沒有英文就用編號（第 1 位 → 01）。
 */
export function initials(name: string, index: number): string {
  const words = name.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []
  const first = words[0]
  if (first === undefined) return String((index % 99) + 1).padStart(2, '0')
  const last = words.length > 1 ? (words[words.length - 1] ?? '') : first.slice(1)
  return (first.charAt(0) + (last.charAt(0) || first.charAt(0))).toUpperCase()
}

export function badgeColor(index: number): string {
  return BADGE_COLORS[index % BADGE_COLORS.length] ?? COLORS.coral
}

// ---------- 給 Claude 的文字 ----------

export const HELPER_PROGRESS_LINE =
  'As you work, call report_progress (mcp__clean-view__report_progress; load it with ToolSearch if it is deferred) ' +
  'with your task name and a percent at about 25, 50, 75 and 100. Do not call plan_steps.'

export function instruction(n: number): string {
  return [
    `Agent Dock — Team Size is ${n}.`,
    `- Split this request into exactly ${n} independent pieces and launch one helper (the Agent tool) per piece, all in one message so they run in parallel.`,
    '- Find a real split, one helper per item (per store, per task, per file, per section). Never argue that it cannot be split and never pad with useless work.',
    '- Give each helper a short plain Traditional Chinese description of 3 to 5 words, e.g. 「比價：Panera」.',
    `- In each helper's prompt add: "${HELPER_PROGRESS_LINE}"`,
    '- When they finish, combine their results into one answer.',
  ].join('\n')
}

export function capMessage(n: number): string {
  return `Team Size is ${n}: this request already has ${n} helpers. Finish with the helpers you have.`
}

export const NUDGE_PREFIX = 'You used '

export function nudgeText(used: number, n: number): string {
  return (
    `${NUDGE_PREFIX}${used} of ${n} helpers. Split the remaining work across the other ${n - used}, ` +
    'one helper per piece, all in parallel.'
  )
}

export const STOPPED_BEFORE_START = 'Stopped before this helper started.'
export const HELPER_PLAN_ANSWER = 'Helpers skip the plan. Just call report_progress as you work.'

// ---------- 工作與卡片 ----------

export function newDockJob(id: string, request: string, size: number, now: number): DockJob {
  return {
    id,
    name: jobName(request),
    size,
    phase: 'live',
    startedAt: now,
    finishedAt: null,
    launched: 0,
    hasNudged: false,
    isMainIdle: false,
    cards: [],
  }
}

function isFinished(status: DockCardStatus): boolean {
  return status === 'done' || status === 'stuck' || status === 'stopped'
}

function setCard(job: DockJob, id: string, fn: (card: DockCard) => DockCard): DockJob {
  return { ...job, cards: job.cards.map(c => (c.id === id ? fn(c) : c)) }
}

/** Claude 一寫出 Agent 呼叫就先排進佇列。 */
export function addQueuedCards(job: DockJob, calls: readonly { id: string; description: unknown }[]): DockJob {
  const fresh = calls
    .filter(call => !job.cards.some(c => c.id === call.id))
    .map(
      (call): DockCard => ({
        id: call.id,
        name: taskName(call.description),
        agentId: null,
        status: 'queued',
        percent: 0,
        hasReported: false,
        startedAt: null,
        finishedAt: null,
      }),
    )
  return fresh.length === 0 ? job : { ...job, cards: [...job.cards, ...fresh] }
}

/** 卡片開始工作（名額在放行時就已算進 `launched`）。 */
export function startCard(job: DockJob, id: string, description: unknown, now: number): DockJob {
  return setCard(addQueuedCards(job, [{ id, description }]), id, c => ({ ...c, status: 'working', startedAt: now }))
}

export function dropCard(job: DockJob, id: string): DockJob {
  return { ...job, cards: job.cards.filter(c => c.id !== id) }
}

export function attachAgent(job: DockJob, id: string, agentId: string): DockJob {
  return setCard(job, id, c => ({ ...c, agentId }))
}

export function finishCard(job: DockJob, id: string, status: DockCardStatus, now: number): DockJob {
  return setCard(job, id, c =>
    isFinished(c.status)
      ? c
      : { ...c, status, percent: status === 'done' ? 100 : c.percent, finishedAt: now },
  )
}

export function finishByAgent(job: DockJob, agentId: string, status: DockCardStatus, now: number): DockJob {
  const card = job.cards.find(c => c.agentId === agentId)
  return card === undefined ? job : finishCard(job, card.id, status, now)
}

/** helper 的 report_progress：先用 agentId 對，對不到再用名稱，再對不到就給唯一一張還沒對上的卡。 */
export function helperProgress(job: DockJob, agentId: string, task: unknown, percent: number): DockJob {
  const norm = (s: string) => s.toLowerCase().replace(/[\s…]+/g, '')
  let card = job.cards.find(c => c.agentId === agentId)
  if (card === undefined) {
    const wanted = norm(cleanName(task))
    const unclaimed = job.cards.filter(c => c.agentId === null && c.status === 'working')
    card =
      unclaimed.find(c => norm(c.name) === wanted) ??
      unclaimed.find(c => wanted.length >= 2 && (norm(c.name).includes(wanted) || wanted.includes(norm(c.name)))) ??
      (unclaimed.length === 1 ? unclaimed[0] : undefined)
  }
  if (card === undefined || isFinished(card.status)) return job
  return setCard(job, card.id, c => ({ ...c, agentId, percent, hasReported: true }))
}

/** 按了 Esc：還沒開始的卡片標成已停止。 */
export function stopJob(job: DockJob, now: number): DockJob {
  return {
    ...job,
    phase: 'stopped',
    isMainIdle: true,
    finishedAt: now,
    cards: job.cards.map(c => (c.status === 'queued' ? { ...c, status: 'stopped', finishedAt: now } : c)),
  }
}

/** 全部 helper 都結束、主對話也沒有要再派人，就算完成。 */
export function settleJob(job: DockJob, now: number): DockJob {
  if (job.phase !== 'live' || !job.isMainIdle || job.cards.length === 0) return job
  if (!job.cards.every(c => isFinished(c.status))) return job
  return { ...job, phase: 'done', finishedAt: now }
}

// ---------- 計數與顯示 ----------

export type DockCounts = { working: number; queued: number; done: number; stuck: number; stopped: number }

export function counts(job: DockJob | null): DockCounts {
  const out: DockCounts = { working: 0, queued: 0, done: 0, stuck: 0, stopped: 0 }
  for (const c of job?.cards ?? []) out[c.status] += 1
  return out
}

/** 整體進度：每張卡的百分比平均；團隊人數比卡片多時，還沒出現的也算 0。 */
export function overallPercent(job: DockJob): number {
  const expected = Math.max(job.size > 1 ? job.size : 0, job.cards.length)
  if (expected === 0) return job.phase === 'done' ? 100 : 0
  const sum = job.cards.reduce((acc, c) => acc + (isFinished(c.status) ? 100 : c.percent), 0)
  return Math.round(sum / expected)
}

export function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function badge(job: DockJob | null, teamSize: number): string {
  if (job === null || job.phase !== 'live') return `◆ Dock 待命 · 團隊 ${teamSize} 人`
  const c = counts(job)
  return `◆ 工作中 ${c.working} · 排隊 ${c.queued} · 完成 ${c.done}${c.stuck > 0 ? ` · 卡住 ${c.stuck}` : ''}`
}

export function summary(job: DockJob): string {
  const c = counts(job)
  const total = job.cards.length
  const took = formatDuration((job.finishedAt ?? job.startedAt) - job.startedAt)
  const stuck = c.stuck > 0 ? `（${c.stuck} 位卡住）` : ''
  return `${total} 位助手完成「${job.name}」，花了 ${took}${stuck}`
}

export function modelLabel(model: DockHelperModel): string {
  return model === 'fast' ? '快速省錢' : '跟你同一個模型'
}

export function infoLine(size: number, perWave: number, model: DockHelperModel): string {
  const split = size === 1 ? '由 Claude 決定要幾位助手' : `每個請求拆給 ${size} 位助手`
  return `${split}  ·  一次 ${Math.min(size, perWave)} 位  ·  ${modelLabel(model)}`
}

export type MeterSegment = { kind: 'fill' | 'glow' | 'rest'; text: string }

function segments(parts: readonly [MeterSegment['kind'], number][]): MeterSegment[] {
  return parts
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => ({ kind, text: (kind === 'rest' ? '─' : '━').repeat(n) }))
}

/** 卡片上的進度條，分段回傳讓畫面上色；沒回報過的跑一段 4 格的掃動。 */
export function cardMeter(card: DockCard, tick: number, cells: number): MeterSegment[] {
  if (card.status === 'done') return segments([['fill', cells]])
  if (card.status === 'queued' || card.status === 'stopped') return segments([['rest', cells]])
  if (card.hasReported || card.status === 'stuck') {
    const filled = Math.round((card.percent / 100) * cells)
    return segments([['glow', filled], ['rest', cells - filled]])
  }
  const start = (tick % (cells + 4)) - 4
  const from = Math.max(0, start)
  const to = Math.min(cells, start + 4)
  return segments([['rest', from], ['glow', Math.max(0, to - from)], ['rest', cells - Math.max(from, to)]])
}

/** 兩個 hex 顏色之間取 n 個漸層色。 */
export function gradient(from: string, to: string, n: number): string[] {
  const parse = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const a = parse(from)
  const b = parse(to)
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const t = n <= 1 ? 0 : i / (n - 1)
    return `#${a.map((v, k) => Math.round(v + ((b[k] ?? v) - v) * t).toString(16).padStart(2, '0')).join('')}`
  })
}

export type CardLayout = { mode: 'cards' | 'tiles'; perRow: number; cellWidth: number }

/** 12 張以內畫完整卡片（一排 2 或 3 張）；更多就改成小格子。 */
export function cardLayout(width: number, count: number): CardLayout {
  if (count <= CARD_LIMIT) {
    const perRow = width >= 108 ? 3 : width >= 70 ? 2 : 1
    return { mode: 'cards', perRow, cellWidth: Math.floor((width - (perRow - 1)) / perRow) }
  }
  const cellWidth = 14
  return { mode: 'tiles', perRow: Math.max(1, Math.floor((width + 1) / (cellWidth + 1))), cellWidth }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
