import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  autoInstruction,
  autoPlan,
  badge,
  buildTeamRequest,
  initials,
  instruction,
  newDockJob,
  parseAuto,
  parseDockArgs,
  parseSize,
  parseTeamVerdict,
  restoreSize,
  upToInstruction,
} from '../hooks/dock-logic'

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
  appended: string[]
  contexts: (readonly string[] | undefined)[]
  submitted: string[]
  statuses: (string | undefined)[]
  panes: Set<string>
}

/** 引擎底層：plugin 會用到的每個名詞都在記憶體裡回答。 */
function engineBeneath(on: On, stored: Record<string, unknown> = {}, env: Record<string, string> = {}): World {
  const world: World = { appended: [], contexts: [], submitted: [], statuses: [], panes: new Set() }
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
    world.contexts.push(e.context)
    return { text: e.text, context: e.context }
  })
  on('session.append', (_$, e, next) => {
    const blocks = (e.message.content ?? []) as { type?: string; text?: string }[]
    if (e.origin.kind === 'plugin') world.appended.push(blocks.map(b => b.text ?? '').join(''))
    return next(e)
  })
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

test('1c. /dock 的參數：人數＋要送出的問題', () => {
  expect(parseDockArgs('3')).toEqual({ size: 3, ask: '' })
  expect(parseDockArgs(' 3 收集鴻海、台積電最新消息 ')).toEqual({ size: 3, ask: '收集鴻海、台積電最新消息' })
  expect(parseDockArgs('abc 問題').size).toBeNull()
  expect(parseDockArgs('').size).toBeNull()
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

test('5b. 一位都沒派（問答、commit）就不提醒', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 3 })
  await boot($)
  await ask($, '幫我 commit 這些改動')
  await $.turn.complete({ answer: '好了', durationMs: 1000, isAborted: false, turnId: 'm1', reason: 'answer' })
  await settle()
  expect(world.submitted).toEqual([])
})

test('8b. /dock 3 問題：設好人數並送出，請求帶上拆成 3 份的指示', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 1 })
  await boot($)
  const ran = await $.command.run({ command: 'dock', args: '3 收集鴻海、台積電最新消息', ...COMMAND })
  expect(ran.text).toBe('團隊人數設為 3，送出：收集鴻海、台積電最新消息')
  await settle()
  expect(world.submitted).toEqual(['收集鴻海、台積電最新消息'])
  // 拆工指示走 $.session.append，測試環境沒有主對話接得到，實測時再確認
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^收集鴻海/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ 3 $/ })).toBeDefined()
  await ui.unmount()

  const big = await $.command.run({ command: 'dock', args: '50 收集消息', ...COMMAND })
  expect(big.text).toBe('請在 Agent Dock 確認 50 位的團隊，確認後再送出問題。')
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
  expect(bad.text).toBe('團隊人數是 1 到 100 的整數或 auto，例如 /dock 10、/dock auto 或 /dock 3 你的問題。')
  const big = await $.command.run({ command: 'dock', args: '50', ...COMMAND })
  expect(big.text).toBe('請在 Agent Dock 確認 50 位的團隊。')
})

// ---------- 自動人數（TypeSafe Jev） ----------

const jevTeam = (choice: string, confidence: number) =>
  JSON.stringify({ model: 'jev-1.13.0', answers: { team: { type: 'choice', choice, confidence, probabilities: {} } } })

/** Jev 的假回應：回傳 `answer()` 的結果；記下送出的 body */
function jevBeneath(on: On, answer: () => string | Error): string[] {
  const bodies: string[] = []
  on('http.fetch', (_$, e) => {
    bodies.push(e.init?.body ?? '')
    const a = answer()
    if (a instanceof Error) throw a
    return { value: { status: 200, ok: true, headers: {}, text: a } }
  })
  return bodies
}

test('9. 自動：/dock auto 的參數', () => {
  expect(parseAuto('auto')).toEqual({ ask: '' })
  expect(parseAuto(' AUTO 比較三家財報 ')).toEqual({ ask: '比較三家財報' })
  expect(parseAuto('自動')).toEqual({ ask: '' })
  expect(parseAuto('3')).toBeNull()
  expect(parseAuto('automatic')).toBeNull()
})

test('9b. 自動：信心 ≥ 0.8 照 Jev（1 人不拆、2 或 3 人剛好 N 份），不夠才最多 3 份', () => {
  expect(autoPlan({ size: 1, confidence: 0.98 })).toEqual({ size: 1, isUpTo: false, note: 'Jev 判 1 人（0.98），不拆' })
  expect(autoPlan({ size: 1, confidence: 0.8 }).isUpTo).toBe(false)
  expect(autoPlan({ size: 2, confidence: 0.99 })).toEqual({ size: 2, isUpTo: false, note: 'Jev 判 2 人（0.99），拆成 2 份' })
  expect(autoPlan({ size: 3, confidence: 0.8 })).toMatchObject({ size: 3, isUpTo: false })
  expect(autoPlan({ size: 1, confidence: 0.79 })).toMatchObject({ size: 3, isUpTo: true })
  expect(autoPlan({ size: 3, confidence: 0.7 })).toEqual({ size: 3, isUpTo: true, note: 'Jev 判 3 人（0.70），最多拆 3 份' })
  expect(autoPlan(undefined)).toEqual({ size: 3, isUpTo: true, note: 'Jev 沒有回答，最多拆 3 份' })
})

test('9e. 自動：每種判斷附上的指示', () => {
  expect(autoInstruction(autoPlan({ size: 1, confidence: 0.9 }))).toBeUndefined()
  expect(autoInstruction(autoPlan({ size: 2, confidence: 0.9 }))).toBe(instruction(2))
  expect(autoInstruction(autoPlan({ size: 3, confidence: 0.91 }))).toBe(instruction(3))
  expect(autoInstruction(autoPlan({ size: 3, confidence: 0.43 }))).toBe(upToInstruction(3))
})

test('9c. 自動：Jev 的請求與回應', () => {
  const body = JSON.parse(buildTeamRequest('比較三家財報'))
  expect(body.model).toBe('jev-latest')
  expect(JSON.parse(body.state)).toEqual({ request: '比較三家財報' })
  expect(Object.keys(body.questions.team.criteria)).toEqual(['1', '2', '3'])
  expect(parseTeamVerdict(jevTeam('2', 0.86))).toEqual({ size: 2, confidence: 0.86 })
  expect(parseTeamVerdict(jevTeam('5', 0.9))).toBeUndefined()
  expect(parseTeamVerdict('{"detail":{"error_type":"authentication_error"}}')).toBeUndefined()
  expect(parseTeamVerdict('not json')).toBeUndefined()
})

test('9d. 自動：指示是「最多 N 份」，手動仍是「剛好 N 份」', () => {
  expect(upToInstruction(3)).toMatch(/at most 3 pieces/)
  expect(upToInstruction(3)).toMatch(/do it yourself without helpers/)
  expect(upToInstruction(3)).not.toMatch(/exactly/)
  expect(instruction(3)).toMatch(/exactly 3 independent pieces/)
  expect(badge(null, 3, true)).toBe('◆ Dock 待命 · 團隊 自動')
  expect(badge(null, 3)).toBe('◆ Dock 待命 · 團隊 3 人')
  expect(newDockJob('j', '問題', 3, 0, true).isUpTo).toBe(true)
  expect(newDockJob('j', '問題', 3, 0).isUpTo).toBe(false)
})

test('10. 自動：Jev 判 1 人（0.98）就不加任何指示', async ($, on) => {
  const world = engineBeneath(on, { 'dock.isAuto': true }, { TYPESAFE_API_KEY: 'k' })
  const bodies = jevBeneath(on, () => jevTeam('1', 0.98))
  await boot($)
  await ask($, '模型路由器不考慮 sonnet 嗎')
  expect(bodies).toHaveLength(1)
  expect(JSON.parse(JSON.parse(bodies[0] ?? '{}').state)).toEqual({ request: '模型路由器不考慮 sonnet 嗎' })
  expect(world.contexts.at(-1)).toBeUndefined()
})

test('10b. 自動：Jev 判 3 人但信心不夠就帶「最多 3 份」的指示，第 4 位被擋', async ($, on) => {
  const world = engineBeneath(on, { 'dock.isAuto': true }, { TYPESAFE_API_KEY: 'k' })
  jevBeneath(on, () => jevTeam('3', 0.7))
  await boot($)
  await ask($, '比較鴻海、台積電、聯發科最近一季財報')
  expect(world.contexts.at(-1)).toEqual([upToInstruction(3)])
  for (const name of ['鴻海', '台積電', '聯發科']) await agent($, name)
  const fourth = await agent($, '多的')
  expect(fourth.deny).toBe('Team Size is 3: this request already has 3 helpers. Finish with the helpers you have.')
})

test('10c. 自動：判 1 人但信心不夠、沒有 key、連不上，都是最多 3 份', async ($, on) => {
  const world = engineBeneath(on, { 'dock.isAuto': true }, { TYPESAFE_API_KEY: 'k' })
  let reply: string | Error = jevTeam('1', 0.6)
  jevBeneath(on, () => reply)
  await boot($)
  await ask($, '幫我看看這個')
  expect(world.contexts.at(-1)).toEqual([upToInstruction(3)])
  reply = new Error('offline')
  await ask($, '再看一次')
  expect(world.contexts.at(-1)).toEqual([upToInstruction(3)])
})

test('10d. 自動：沒有 TYPESAFE_API_KEY 一律最多 3 份', async ($, on) => {
  const world = engineBeneath(on, { 'dock.isAuto': true })
  const bodies = jevBeneath(on, () => jevTeam('1', 1))
  await boot($)
  await ask($, '模型路由器不考慮 sonnet 嗎')
  expect(bodies).toHaveLength(0)
  expect(world.contexts.at(-1)).toEqual([upToInstruction(3)])
})

test('10e. 自動：最多 3 份只派 1 位，不補送「還有人沒派」的提醒', async ($, on) => {
  const world = engineBeneath(on, { 'dock.isAuto': true }, { TYPESAFE_API_KEY: 'k' })
  jevBeneath(on, () => jevTeam('2', 0.6))
  await boot($)
  await ask($, '整理前端和後端的 README')
  await agent($, '前端 README')
  await $.turn.complete({ answer: '派出去了', durationMs: 1000, isAborted: false, turnId: 'm1', reason: 'answer' })
  await settle()
  expect(world.submitted).toEqual([])
})

test('10f. /dock auto 存起來；/dock 3 切回手動並恢復強制拆', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 3 }, { TYPESAFE_API_KEY: 'k' })
  jevBeneath(on, () => jevTeam('1', 0.99))
  await boot($)
  const ran = await $.command.run({ command: 'dock', args: 'auto', ...COMMAND })
  expect(ran.text).toBe('團隊人數設為自動：由 Jev 判斷要不要拆，最多 3 位。')
  await settle()
  // 重開 session 讀回存檔：還是自動
  await boot($)
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^ 自動 $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '自動團隊待命中' })).toBeDefined()
  await ui.unmount()
  await ask($, '模型路由器不考慮 sonnet 嗎')
  expect(world.contexts.at(-1)).toBeUndefined()

  await $.command.run({ command: 'dock', args: '3', ...COMMAND })
  await settle()
  await boot($)
  await ask($, '模型路由器不考慮 sonnet 嗎')
  expect(world.contexts.at(-1)).toEqual([instruction(3)])
})

test('10g. /dock auto 問題：先問 Jev，判 1 人就不附拆工指示', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 1 }, { TYPESAFE_API_KEY: 'k' })
  const bodies = jevBeneath(on, () => jevTeam('1', 0.95))
  await boot($)
  const ran = await $.command.run({ command: 'dock', args: 'auto 我現在能用 model router 了嗎', ...COMMAND })
  expect(ran.text).toBe('團隊人數設為自動，送出：我現在能用 model router 了嗎')
  await settle()
  expect(bodies).toHaveLength(1)
  expect(world.submitted).toEqual(['我現在能用 model router 了嗎'])
  expect(world.appended).toEqual([])
})

test('10h. 自動：Jev 判 3 人且信心 0.91 就「剛好 3 份」強制拆', async ($, on) => {
  const world = engineBeneath(on, { 'dock.isAuto': true }, { TYPESAFE_API_KEY: 'k' })
  jevBeneath(on, () => jevTeam('3', 0.91))
  await boot($)
  await ask($, '分別讀三個 mod 的 register 檔，各寫兩句說明')
  expect(world.contexts.at(-1)).toEqual([instruction(3)])
})

test('10i. 自動：判 2 人強制拆，只派 1 位會補送一次提醒', async ($, on) => {
  const world = engineBeneath(on, { 'dock.isAuto': true }, { TYPESAFE_API_KEY: 'k' })
  jevBeneath(on, () => jevTeam('2', 0.86))
  await boot($)
  await ask($, '把前端和後端的 README 都改成繁體中文')
  expect(world.contexts.at(-1)).toEqual([instruction(2)])
  await agent($, '前端 README')
  await $.turn.complete({ answer: '派出去了', durationMs: 1000, isAborted: false, turnId: 'm1', reason: 'answer' })
  await settle()
  expect(world.submitted).toEqual([
    'You used 1 of 2 helpers. Split the remaining work across the other 1, one helper per piece, all in parallel.',
  ])
})

test('10j. /dock auto 問題：判 3 人有把握就附「剛好 3 份」', async ($, on) => {
  const world = engineBeneath(on, { 'dock.teamSize': 1 }, { TYPESAFE_API_KEY: 'k' })
  jevBeneath(on, () => jevTeam('3', 0.9))
  await boot($)
  await $.command.run({ command: 'dock', args: 'auto 比較鴻海、台積電、聯發科財報', ...COMMAND })
  await settle()
  expect(world.submitted).toEqual(['比較鴻海、台積電、聯發科財報'])
  expect(world.appended).toEqual([instruction(3)])
})
