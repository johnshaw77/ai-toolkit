import type { Item, Mark, Status } from '../types'

type Todo = { content: string; status: Status; activeForm?: string }

// 狀態變了才蓋時間戳，維持原本的 startedAt / doneAt
const stamp = (prev: Item | undefined, next: Item, now: number): Item => {
  const out = { ...next, startedAt: prev?.startedAt, doneAt: prev?.doneAt, mark: prev?.mark }
  if (next.status === 'in_progress' && out.startedAt === undefined) out.startedAt = now
  if (next.status === 'completed' && out.doneAt === undefined) out.doneAt = now
  if (next.status !== 'completed') out.doneAt = undefined
  return out
}

/** TodoWrite 每次送整份清單：以內容當 key，對回舊項目保留時間戳與標記 */
export const fromTodoWrite = (prev: Item[], todos: readonly Todo[], now: number): Item[] => {
  const byText = new Map(prev.map(i => [i.text, i]))
  return todos.map((t, n) =>
    stamp(byText.get(t.content), { id: `todo-${n}`, text: t.content, active: t.activeForm ?? t.content, status: t.status }, now),
  )
}

export const taskCreate = (prev: Item[], id: string, subject: string, activeForm: string | undefined): Item[] =>
  prev.some(i => i.id === id) ? prev : [...prev, { id, text: subject, active: activeForm ?? subject, status: 'pending' }]

export type TaskPatch = { taskId: string; subject?: string; activeForm?: string; status?: Status | 'deleted' }

export const taskUpdate = (prev: Item[], p: TaskPatch, now: number): Item[] => {
  if (p.status === 'deleted') return prev.filter(i => i.id !== p.taskId)
  return prev.map(i => {
    if (i.id !== p.taskId) return i
    const next: Item = { ...i, text: p.subject ?? i.text, active: p.activeForm ?? i.active, status: p.status ?? i.status }
    return stamp(i, next, now)
  })
}

export const isClosed = (i: Item): boolean => i.status === 'completed' || i.mark !== undefined

export const progress = (items: readonly Item[]) => ({
  done: items.filter(isClosed).length,
  total: items.length,
})

export const current = (items: readonly Item[]): Item | undefined =>
  items.find(i => i.status === 'in_progress' && i.mark === undefined)

export const bar = (done: number, total: number, width = 10): string => {
  const n = total === 0 ? 0 : Math.round((done / total) * width)
  return '▓'.repeat(n) + '░'.repeat(width - n)
}

export const fmtElapsed = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export const markItem = (items: Item[], id: string, mark: 'done' | 'skip'): Item[] =>
  items.map(i => (i.id === id ? { ...i, mark } : i))

/** 下一次送出 prompt 時附給 Claude 的說明 */
export const marksNote = (marks: readonly Mark[]): string | null =>
  marks.length === 0
    ? null
    : [
        '使用者在 todo 面板上標記了以下項目，請據此更新清單：',
        ...marks.map(m => `- 「${m.text}」→ ${m.mark === 'done' ? '已完成' : '跳過，不用做'}`),
      ].join('\n')
