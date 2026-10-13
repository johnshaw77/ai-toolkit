import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { MODELS } from '../hooks/classify'

const COMMAND = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
const SESSION_MODEL = MODELS.opus

type World = { tokens: number; jev?: { status: number; text: string }; steps: { model: string; effort?: unknown }[]; statuses: (string | undefined)[]; toasts: string[]; requests: { url: string; body?: string }[] }

/** 引擎底下的假回應：Jev 回 `jev`（undefined＝連線失敗），對話長度 `tokens` */
function engineBeneath(on: On, opts: { jev?: { status: number; text: string }; key?: string; tokens?: number; stored?: Record<string, unknown> } = {}): World {
  const world: World = { tokens: opts.tokens ?? 1000, jev: opts.jev, steps: [], statuses: [], toasts: [], requests: [] }
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, opts.stored ?? {})
  mock.env(on, opts.key === undefined ? {} : { TYPESAFE_API_KEY: opts.key })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.status', (_$, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    world.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: world.tokens, window: 1_000_000 }, rateLimits: {} } as never }))
  on('http.fetch', (_$, e) => {
    world.requests.push({ url: e.url, body: e.init?.body })
    const jev = world.jev
    if (jev === undefined) throw new Error('offline')
    return { value: { status: jev.status, ok: jev.status < 300, headers: {}, text: jev.text } }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) {
    world.steps.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  return world
}

const jevSays = (choice: string, confidence = 0.98) => ({
  status: 200,
  text: JSON.stringify({ model: 'jev-1.13.0', answers: { tier: { type: 'choice', choice, confidence, probabilities: {} } } }),
})

async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: '/tmp/router-test', surface: 'terminal', isInteractive: true })
}

async function ask($: Engine, text: string, turnId: string, steps = 1): Promise<void> {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
  for (let index = 0; index < steps; index++) {
    const s = $.turn.step({ turnId, index, model: SESSION_MODEL, effort: 'medium', messageCount: 1 })
    for await (const _ of s) void _
  }
}

test('預設關：不問 Jev、不換模型', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('haiku'), key: 'k' })
  await start($)
  await ask($, '把這句翻成英文：你好', 't1')
  expect(w.requests).toHaveLength(0)
  expect(w.steps[0]?.model).toBe(SESSION_MODEL)
})

test('/router on 之後依 Jev 換模型，同一個 turn 只問一次', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('haiku'), key: 'k' })
  await start($)
  const ran = await $.command.run({ command: 'router', args: 'on', ...COMMAND })
  expect(JSON.stringify(ran)).toContain('開')
  expect(w.statuses.at(-1)).toBe('🧭 自動分配')
  await ask($, '把這句翻成英文：你好', 't1', 3)
  expect(w.requests).toHaveLength(1)
  expect(w.requests[0]?.url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(w.steps.map(s => s.model)).toEqual([MODELS.haiku, MODELS.haiku, MODELS.haiku])
  expect(w.steps[0]?.effort).toBeUndefined()
  expect(w.statuses.at(-1)).toContain('haiku')
})

test('開關狀態跨 session 保留', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('sonnet'), key: 'k', stored: { isOn: true } })
  await start($)
  await ask($, '幫我寫一個 Python 函式，去除 list 重複元素並保留順序', 't1')
  expect(w.steps[0]).toEqual({ model: MODELS.sonnet, effort: 'medium' })
})

test('~opus 強制指定，不問 Jev', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('haiku'), key: 'k', stored: { isOn: true } })
  await start($)
  await ask($, '~opus 你好', 't1')
  expect(w.requests).toHaveLength(0)
  expect(w.steps[0]?.model).toBe(MODELS.opus)
})

test('簡短接續沿用上一輪的判斷，不再問 Jev', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('sonnet'), key: 'k', stored: { isOn: true } })
  await start($)
  await ask($, '幫我在登入表單加上 email 格式驗證', 't1')
  await ask($, '好，繼續', 't2')
  expect(w.requests).toHaveLength(1)
  expect(w.steps.map(s => s.model)).toEqual([MODELS.sonnet, MODELS.sonnet])
})

test('沒有 key、連不上、回錯誤碼：都不換模型，並提示', async ($, on) => {
  const w = engineBeneath(on, { jev: { status: 401, text: '{"detail":{}}' }, key: 'bad', stored: { isOn: true } })
  await start($)
  await ask($, '把這句翻成英文：你好', 't1')
  expect(w.steps[0]?.model).toBe(SESSION_MODEL)
  expect(w.toasts.join()).toContain('401')
})

test('沒有 key 只提示一次', async ($, on) => {
  const w = engineBeneath(on, { stored: { isOn: true } })
  await start($)
  await ask($, '把這句翻成英文：你好', 't1')
  await ask($, '幫我解釋這段程式在做什麼？', 't2')
  expect(w.steps.map(s => s.model)).toEqual([SESSION_MODEL, SESSION_MODEL])
  expect(w.toasts.filter(t => t.includes('TYPESAFE_API_KEY'))).toHaveLength(1)
})

test('連不上 Jev：不換模型', async ($, on) => {
  const w = engineBeneath(on, { key: 'k', stored: { isOn: true } })
  await start($)
  await ask($, '把這句翻成英文：你好', 't1')
  expect(w.steps[0]?.model).toBe(SESSION_MODEL)
  expect(w.toasts.join()).toContain('Jev')
})

test('開場就很長（system prompt 70k）仍然可以降級', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('haiku'), key: 'k', stored: { isOn: true }, tokens: 70_000 })
  await start($)
  await ask($, '把這句翻成英文：今天天氣很好', 't1')
  await ask($, '把這句翻成日文：謝謝你的幫忙', 't2')
  expect(w.steps.map(s => s.model)).toEqual([MODELS.haiku, MODELS.haiku])
})

test('比開場多出 40,000 tokens 後只升不降', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('sonnet'), key: 'k', stored: { isOn: true }, tokens: 70_000 })
  await start($)
  await ask($, '幫我寫一個 TypeScript 的 debounce 函式', 't1')
  w.tokens = 115_000
  w.jev = jevSays('haiku')
  await ask($, '把這句翻成英文：今天天氣很好', 't2')
  expect(w.steps.map(s => s.model)).toEqual([MODELS.sonnet, MODELS.sonnet])
  expect(w.statuses.at(-1)).toContain('對話太長不降級')
  w.jev = jevSays('opus')
  await ask($, '設計多租戶 SaaS 的資料庫隔離架構', 't3')
  expect(w.steps.at(-1)?.model).toBe(MODELS.opus)
})

test('不確定時不降級', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('haiku', 0.3), key: 'k', stored: { isOn: true } })
  await start($)
  await ask($, '這段程式的時間複雜度是多少？', 't1')
  expect(w.steps[0]?.model).toBe(SESSION_MODEL)
  expect(w.statuses.at(-1)).toContain('不確定不降級')
})

test('問 Jev 時附上目前用的模型', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('sonnet'), key: 'k', stored: { isOn: true } })
  await start($)
  await ask($, '幫我寫一個 TypeScript 的 debounce 函式', 't1')
  await ask($, '幫既有的 React 登入表單加上 email 驗證', 't2')
  expect(JSON.parse(JSON.parse(w.requests[1]?.body ?? '{}').state)).toEqual({ request: '幫既有的 React 登入表單加上 email 驗證', current_model: MODELS.sonnet })
})

test('執行中先打好、排隊的 prompt 也會判斷，輪到它時才套用', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('haiku'), key: 'k', stored: { isOn: true } })
  await start($)
  await ask($, '把這句翻成英文：你好', 't1')
  // t1 還在跑時打下一則
  w.jev = jevSays('opus')
  await $.prompt.submit({ text: '設計多租戶 SaaS 的資料庫隔離架構', wait: false, origin: { kind: 'composer' }, turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: SESSION_MODEL, messageCount: 3 })) void _
  expect(w.steps.at(-1)?.model).toBe(MODELS.haiku)
  await $.turn.start({ text: '設計多租戶 SaaS 的資料庫隔離架構', turnId: 't2' })
  for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: SESSION_MODEL, messageCount: 5 })) void _
  expect(w.steps.at(-1)?.model).toBe(MODELS.opus)
})

test('子 agent 不插手', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('haiku'), key: 'k', stored: { isOn: true } })
  await start($)
  await $.prompt.submit({ text: '把這句翻成英文：你好', wait: false, origin: { kind: 'composer' } } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: SESSION_MODEL, messageCount: 1, agentId: 'a1' })) void _
  expect(w.steps[0]?.model).toBe(SESSION_MODEL)
})
