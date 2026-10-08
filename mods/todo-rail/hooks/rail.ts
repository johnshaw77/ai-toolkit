// 待辦進度條：每個待辦一格，完成／進行中／待做各一種樣子

import type { Todo } from '../types'

export const GLYPH = { completed: '■', in_progress: '▣', pending: '□' } as const
export const COLOR = { completed: '#4ade80', in_progress: '#fbbf24', pending: '#6b7280' } as const
export const MAX_CELLS = 30

export type Rail = {
  cells: readonly Todo['status'][]
  done: number
  total: number
  /** 進行中那項的說法（「正在…」），沒有就是 undefined */
  current: string | undefined
}

export function railOf(todos: readonly Todo[]): Rail {
  const current = todos.find(t => t.status === 'in_progress')
  return {
    cells: todos.slice(0, MAX_CELLS).map(t => t.status),
    done: todos.filter(t => t.status === 'completed').length,
    total: todos.length,
    current: current === undefined ? undefined : current.activeForm || current.content,
  }
}

/** 全部完成的清單，在下一個 turn 開始時收掉 */
export const isAllDone = (todos: readonly Todo[]): boolean =>
  todos.length > 0 && todos.every(t => t.status === 'completed')

/** 旁邊的字太長會擠掉輸入框，截斷 */
export const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`)

// 新版待辦（TaskCreate／TaskUpdate／TaskList）一次只動一項，要自己合併

export type TaskPatch = {
  taskId: string
  subject?: string | undefined
  activeForm?: string | undefined
  status?: Todo['status'] | 'deleted' | undefined
}

export const addTask = (todos: readonly Todo[], id: string, subject: string, activeForm = ''): Todo[] => [
  ...todos.filter(t => t.id !== id),
  { id, content: subject, status: 'pending', activeForm },
]

export function patchTask(todos: readonly Todo[], p: TaskPatch): Todo[] {
  const status = p.status
  if (status === 'deleted') return todos.filter(t => t.id !== p.taskId)
  return todos.map(t =>
    t.id !== p.taskId
      ? t
      : {
          ...t,
          content: p.subject ?? t.content,
          activeForm: p.activeForm ?? t.activeForm,
          status: status ?? t.status,
        },
  )
}

/** TaskList 的結果是權威版本：照它的順序與狀態，保留已知的 activeForm */
export const syncTasks = (
  todos: readonly Todo[],
  tasks: readonly { id: string; subject: string; status: Todo['status'] }[],
): Todo[] =>
  tasks.map(k => ({ id: k.id, content: k.subject, status: k.status, activeForm: todos.find(t => t.id === k.id)?.activeForm ?? '' }))

/** /rail demo 用的假資料：不靠模型就能看到畫面 */
export const DEMO: readonly Todo[] = [
  { content: '讀既有程式', status: 'completed', activeForm: '讀既有程式中' },
  { content: '寫 rail.ts', status: 'completed', activeForm: '寫 rail.ts 中' },
  { content: '補測試', status: 'in_progress', activeForm: '補測試中' },
  { content: '型別檢查', status: 'pending', activeForm: '型別檢查中' },
  { content: '更新 README', status: 'pending', activeForm: '更新 README 中' },
]

// 工具結果的型別在 hook 裡收窄不了，防禦式取值：形狀不對就當作沒有

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/** TaskCreate 的結果 → 新待辦的 id */
export function createdId(result: unknown): string | undefined {
  const task = isRecord(result) ? result['task'] : undefined
  const id = isRecord(task) ? task['id'] : undefined
  return typeof id === 'string' ? id : undefined
}

export const isUpdated = (result: unknown): boolean => isRecord(result) && result['success'] === true

const STATUSES: readonly string[] = ['pending', 'in_progress', 'completed']

/** TaskList 的結果 → 待辦清單；不是陣列就 undefined（不要因此清空畫面） */
export function listedTasks(result: unknown): { id: string; subject: string; status: Todo['status'] }[] | undefined {
  const tasks = isRecord(result) ? result['tasks'] : undefined
  if (!Array.isArray(tasks)) return undefined
  return tasks.flatMap(k =>
    isRecord(k) && typeof k['id'] === 'string' && typeof k['subject'] === 'string' && STATUSES.includes(String(k['status']))
      ? [{ id: k['id'], subject: k['subject'], status: k['status'] as Todo['status'] }]
      : [],
  )
}
