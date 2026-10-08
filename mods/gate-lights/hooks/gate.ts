import type { Gate, Light } from '../types'

export const initial: Gate = { test: 'idle', typecheck: 'idle', verify: 'idle', needsVerify: false }

export type GateEvent =
  | { kind: 'test' }
  | { kind: 'typecheck' }
  | { kind: 'verify' }
  | { kind: 'edit'; isFrontend: boolean }

const TEST = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bvitest\b|\bjest\b|\bpytest\b|\bgo test\b|\bcargo test\b|claude plugin test/
const TYPECHECK = /\b(vue-)?tsc\b|type-?check|\bmypy\b|\bgo vet\b/
const FRONTEND = /\.(tsx|jsx|vue|svelte|html|css|scss)$/
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const SHOT = /^mcp__(claude-in-chrome__computer|plugin_chrome-devtools-mcp_chrome-devtools__take_screenshot)$/

export const classify = (tool: string, input: Record<string, unknown>): GateEvent | null => {
  if (tool === 'Bash') {
    const cmd = typeof input.command === 'string' ? input.command : ''
    if (TEST.test(cmd)) return { kind: 'test' }
    if (TYPECHECK.test(cmd)) return { kind: 'typecheck' }
    return null
  }
  if (EDIT_TOOLS.has(tool)) {
    const path = typeof input.file_path === 'string' ? input.file_path : ''
    return { kind: 'edit', isFrontend: FRONTEND.test(path) }
  }
  if (SHOT.test(tool)) return { kind: 'verify' }
  return null
}

const stale = (l: Light): Light => (l === 'idle' ? 'idle' : 'stale')

export const reduce = (g: Gate, e: GateEvent, failed: boolean): Gate => {
  const result: Light = failed ? 'fail' : 'pass'
  switch (e.kind) {
    case 'test': return { ...g, test: result }
    case 'typecheck': return { ...g, typecheck: result }
    case 'verify': return { ...g, verify: result }
    case 'edit':
      return {
        test: stale(g.test),
        typecheck: stale(g.typecheck),
        verify: e.isFrontend ? stale(g.verify) : g.verify,
        needsVerify: g.needsVerify || e.isFrontend,
      }
  }
}

// 型別檢查沒跑過視為專案沒有；UI 驗證只在動過前端檔時才需要。
export const isReady = (g: Gate): boolean =>
  g.test === 'pass' &&
  (g.typecheck === 'idle' || g.typecheck === 'pass') &&
  (!g.needsVerify || g.verify === 'pass')
