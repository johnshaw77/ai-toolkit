// 海上 HUD：把 context、額度、驗證燈號、待辦換算成海景裡的東西

export type Light = 'idle' | 'pass' | 'fail' | 'stale'
export type Gate = { test: Light; typecheck: Light; verify: Light }
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export type SeaData = {
  /** context 用量 0~100：吃水與貨物 */
  ctx: number | null
  /** 5 小時額度 0~100：太陽從日出走到日落 */
  usage: number | null
  /** 7 天額度 0~100：月相，剩越少月亮越缺 */
  weekly: number | null
  /** 驗證燈號：前桅支索上的三面信號旗 */
  gate: Gate
  /** 待辦：航海圖上的島，完成一項靠一座 */
  todos: readonly TodoStatus[]
}

export const EMPTY_GATE: Gate = { test: 'idle', typecheck: 'idle', verify: 'idle' }

// ── 驗證燈號（與 gate-lights mod 同規則，各自獨立運作）──
const TEST = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bvitest\b|\bjest\b|\bpytest\b|\bgo test\b|\bcargo test\b|claude plugin test/
const TYPECHECK = /\b(vue-)?tsc\b|type-?check|\bmypy\b|\bgo vet\b/
const SHOT = /^mcp__(claude-in-chrome__computer|plugin_chrome-devtools-mcp_chrome-devtools__take_screenshot)$/
const FRONTEND = /\.(tsx|jsx|vue|svelte|html|css|scss)$/

const stale = (l: Light): Light => (l === 'idle' ? 'idle' : 'stale')

export function reduceGate(g: Gate, tool: string, input: Record<string, unknown>, failed: boolean): Gate {
  const result: Light = failed ? 'fail' : 'pass'
  if (tool === 'Bash') {
    const cmd = typeof input.command === 'string' ? input.command : ''
    if (TEST.test(cmd)) return { ...g, test: result }
    if (TYPECHECK.test(cmd)) return { ...g, typecheck: result }
    return g
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
    const path = typeof input.file_path === 'string' ? input.file_path : ''
    return { test: stale(g.test), typecheck: stale(g.typecheck), verify: FRONTEND.test(path) ? stale(g.verify) : g.verify }
  }
  if (SHOT.test(tool)) return { ...g, verify: result }
  return g
}

// ── 待辦：TodoWrite 每次整份覆蓋；Task 系列逐筆以 id 更新 ──
export type TodoBook = { write: TodoStatus[]; tasks: Record<string, TodoStatus> }

export const EMPTY_TODOS: TodoBook = { write: [], tasks: {} }

export function reduceTodos(b: TodoBook, tool: string, input: Record<string, unknown>, result: unknown): TodoBook {
  if (tool === 'TodoWrite') {
    const todos = Array.isArray(input.todos) ? (input.todos as { status: TodoStatus }[]) : []
    return { ...b, write: todos.map(t => t.status) }
  }
  if (tool === 'TaskCreate') {
    const id = (result as { task?: { id?: string } } | undefined)?.task?.id
    return id === undefined ? b : { ...b, tasks: { ...b.tasks, [id]: 'pending' } }
  }
  if (tool === 'TaskUpdate') {
    const id = typeof input.taskId === 'string' ? input.taskId : undefined
    const st = input.status
    if (id === undefined || !(id in b.tasks) || typeof st !== 'string') return b
    const tasks = { ...b.tasks }
    if (st === 'deleted') delete tasks[id]
    else tasks[id] = st as TodoStatus
    return { ...b, tasks }
  }
  return b
}

export const todoList = (b: TodoBook): TodoStatus[] => [...b.write, ...Object.values(b.tasks)]

// ── 換算成畫面的量 ──
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** 吃水：40% 以下不沉，到 100% 沉下半個船身 */
export const sinkPx = (ctx: number | null, hullH: number): number =>
  ctx === null ? 0 : Math.round(clamp01((ctx - 40) / 60) * hullH * 0.5)

/** 甲板上的貨箱數，0~6 */
export const crates = (ctx: number | null): number => (ctx === null ? 0 : Math.round(clamp01(ctx / 100) * 6))

/** 太陽：0% 日出在左邊海平線，50% 正午最高，100% 日落在右邊 */
export function sunPos(usage: number, w: number, horizon: number): { x: number; y: number; dusk: number } {
  const t = clamp01(usage / 100)
  return {
    x: Math.round(w * (0.1 + 0.8 * t)),
    y: Math.round(horizon - 2 - Math.sin(Math.PI * t) * horizon * 0.7),
    dusk: clamp01((t - 0.65) / 0.35),
  }
}

/** 月亮亮面比例：用掉越多越缺 */
export const moonLit = (weekly: number): number => 1 - clamp01(weekly / 100)

export const LIGHT_COLOR: Record<Light, number> = { idle: 0x8a8f98, pass: 0x3fb950, fail: 0xf85149, stale: 0xe0b030 }
