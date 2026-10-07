import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { initials, instruction, parseSize, restoreSize } from '../hooks/dock-logic'

// 測試環境有 setTimeout，但 hooks 用的 lib 沒有宣告它
declare function setTimeout(fn: () => void, ms: number): unknown

const PLUGIN = 'clean-view'
const SURFACES = ['terminal', 'desktop'] as const
const PROGRESS = 'mcp__clean-view__report_progress'
const COMMAND = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }
const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

function pane(bodyColumns = 120) {
  return {
    plugin: PLUGIN,
    component: 'Pane' as const,
    requestId: 'agent-dock',
    props: {
      title: 'Agent Dock',
      isFocused: false,
      bodyColumns,
      placement: 'dock' as const,
      scroll: { offset: 0, bodyRows: 60 },
      view: {},
    },
  }
}

type World = {
  contexts: (readonly string[] | undefined)[]
  submitted: string[]
  statuses: (string | undefined)[]
  panes: Set<string>
}

/** 引擎底層：plugin 會用到的每個名詞都在記憶體裡回答。 */
function engineBeneath(on: On, stored: Record<string, unknown> = {}, env: Record<string, string> = {}): World {
  const world: World = { contexts: [], submitted: [], statuses: [], panes: new Set() }
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, stored)
  mock.env(on, { HOME: '/tmp/dock-test-home', ...env })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'session-1' }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', (_$, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...world.panes].map(id => ({ id, title: 'Agent Dock', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.open', (_$, e) => {
    world.panes.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    world.panes.delete(e.id)
    return { value: undefined }
  })
  on('process.run', async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 5))
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.write', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true as const, text: '測試', usage: USAGE } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => {
    if (e.origin.kind === 'plugin') world.submitted.push(e.text)
    else world.contexts.push(e.context)
    return { text: e.text, context: e.context }
  })
  on('session.append', (_$, e, next) => next(e))
  let launched = 0
  on('tool.call', (_$, e) => {
    if (e.tool === 'Agent') {
      launched += 1
      return { result: { status: 'async_launched', agentId: `agent-${launched}`, description: '', prompt: '', outputFile: '' } }
    }
    return { result: 'ok' }
  })
  return world
}

// 測試的 `$` 型別在這台電腦被幾百個 MCP 工具撐爆，這裡放寬
type Eng = any

async function boot($: Eng) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

/** 等指令裡沒有 await 的背景工作跑完 */
async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise<void>(resolve => setTimeout(resolve, 10))
}

async function ask($: Eng, text: string) {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
}

async function agent($: Eng, description: string) {
  return $.tool.call({ tool: 'Agent', description, prompt: `做：${description}` })
}

describe('1. parseSize', () => {
  test('只接受 1 到 100 的整數', () => {
    expect(parseSize('10')).toBe(10)
    expect(parseSize(' 25 ')).toBe(25)
    expect(parseSize('0')).toBeNull()
    expect(parseSize('101')).toBeNull()
    expect(parseSize('abc')).toBeNull()
    expect(parseSize('2.5')).toBeNull()
  })
})

test('1b. 徽章一律是兩個英文字母或編號', () => {
  expect(initials('比價：Gontran Cherrier', 0)).toBe('GC')
  expect(initials('比價：PAUL 台北', 1)).toBe('PA')
  expect(initials('Price check: Panera', 2)).toBe('PP')
  expect(initials('比價：吳寶春麥方店', 0)).toBe('01')
  expect(initials('研究市場', 11)).toBe('12')
})

test('2. 存了 50 人，新 session 回到 1；10 人照舊', async ($, on) => {
  expect(restoreSize(50)).toBe(1)
  expect(restoreSize(10)).toBe(10)
  engineBeneath(on, { 'dock.teamSize': 50 })
  await boot($)
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^ 1 $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /你的 1 人團隊待命中/ })).toBeDefined()
  await ui.unmount()
})

test('2b. 存了 10 人，新 session 還是 10', async ($, on) => {
  engineBeneath(on, { 'dock.teamSize': 10 })
  await boot($)
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^ 10 $/ })).toBeDefined()
  await ui.unmount()
})

test('3. 5 人時請求帶上「剛好 5 份」的指示；1 人時什麼都不加', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 5 })
  await boot($)
  await ask($, '研究五家烘焙坊的定價')
  expect(world.contexts.at(-1)).toEqual([instruction(5)])
  expect(instruction(5)).toMatch(/exactly 5 independent pieces/)
})

test('3b. 1 人時請求不加任何指示', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 1 })
  await boot($)
  await ask($, '研究烘焙坊的定價')
  expect(world.contexts.at(-1)).toBeUndefined()
})

test('4. 5 人時第 6 個 Agent 呼叫被擋下', async ($, on) => {
  engineBeneath(on, { 'dock.teamSize': 5 })
  await boot($)
  await ask($, '比較六家店的價格')
  for (let i = 1; i <= 5; i += 1) {
    const ran = await agent($, `比價 ${i}`)
    expect(ran.deny).toBeUndefined()
  }
  const sixth = await agent($, '比價 6')
  expect(sixth.deny ?? sixth.text).toBe('Team Size is 5: this request already has 5 helpers. Finish with the helpers you have.')
})

test('5. 10 人只用了 3 位，剛好補送一次提醒', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 10 })
  await boot($)
  await ask($, '整理三份報告')
  for (const name of ['報告一', '報告二', '報告三']) await agent($, name)
  await $.turn.complete({ answer: '派出去了', durationMs: 1000, isAborted: false, turnId: 'm1', reason: 'answer' })
  await settle()
  expect(world.submitted).toEqual([
    'You used 3 of 10 helpers. Split the remaining work across the other 7, one helper per piece, all in parallel.',
  ])
  await $.turn.complete({ answer: '再派一次', durationMs: 1000, isAborted: false, turnId: 'm2', reason: 'answer' })
  await settle()
  expect(world.submitted).toHaveLength(1)
})

test('6 & 7. 三位助手：排隊 → 工作中 → 60% → 完成，最後顯示總結', async ($, on) => {
  // 同時上限設成 1，第 2、3 位要排隊
  engineBeneath(on, { 'dock.teamSize': 3 }, { CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '1' })
  await boot($)
  await ask($, '研究烘焙坊定價，順便比較口味')
  const names = ['比價：Panera', '比價：Crumbl', '比價：Paul']
  const calls = names.map(n => agent($, n))
  await settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...pane(), surface })
    expect(await ui.findAll({ type: 'Text', text: /^ 進行中$/ })).toHaveLength(1)
    expect(await ui.findAll({ type: 'Text', text: /^ 排隊$/ })).toHaveLength(2)
    await ui.unmount()
  }

  // 第一位回報 60%
  await $.tool.call({ tool: PROGRESS, agentId: 'agent-1', task: '比價：Panera', percent: 60 } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...pane(), surface })
    expect(await ui.find({ type: 'Text', text: /^ 60%$/ })).toBeDefined()
    await ui.unmount()
  }

  // 一位做完，下一位才補上
  for (let i = 1; i <= 3; i += 1) {
    await $.turn.complete({ answer: '好了', durationMs: 1000, isAborted: false, turnId: `h${i}`, reason: 'answer', agentId: `agent-${i}` })
    await settle()
    await settle()
  }
  await Promise.all(calls)
  await $.turn.complete({ answer: '合併好了', durationMs: 1000, isAborted: false, turnId: 'm1', reason: 'answer' })

  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  expect(await ui.findAll({ type: 'Text', text: /^ 100%$/ })).toHaveLength(3)
  expect(await ui.find({ type: 'Text', text: /^✓ 3 位助手完成「研究烘焙坊定價」，花了 / })).toBeDefined()
  await ui.unmount()
})

test('8. /dock 收成狀態列徽章，再打一次就打開', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 3 })
  await boot($)
  await $.command.run({ command: 'dock', args: '', ...COMMAND })
  await settle()
  expect(world.panes.has('agent-dock')).toBe(true)

  await $.command.run({ command: 'dock', args: '', ...COMMAND })
  await settle()
  expect(world.panes.has('agent-dock')).toBe(false)
  expect(world.statuses.at(-1)).toBe('◆ Dock 待命 · 團隊 3 人')

  const bad = await $.command.run({ command: 'dock', args: 'abc', ...COMMAND })
  expect(bad.text).toBe('團隊人數是 1 到 100 的整數，例如 /dock 10。')
  const big = await $.command.run({ command: 'dock', args: '50', ...COMMAND })
  expect(big.text).toBe('請在 Agent Dock 確認 50 位的團隊。')
})
