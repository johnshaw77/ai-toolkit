import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const COMMAND = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }

type World = { tokens: number; jev?: { status: number; text: string }; toasts: string[]; requests: string[]; messages: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[] }

/** 引擎底下的假回應：Jev 回 `jev`（undefined＝連線失敗），對話長度 `tokens` */
function engineBeneath(on: On, opts: { jev?: { status: number; text: string }; key?: string; tokens?: number; stored?: Record<string, unknown>; history?: boolean } = {}): World {
  const history = opts.history ?? true
  const world: World = {
    tokens: opts.tokens ?? 70_000,
    jev: opts.jev,
    toasts: [],
    requests: [],
    messages: history
      ? [
          { role: 'user', text: '幫我在登入表單加 email 驗證', toolUses: [] },
          { role: 'assistant', text: '好，已加上驗證', toolUses: [] },
        ]
      : [],
  }
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, opts.stored ?? {})
  mock.env(on, opts.key === undefined ? {} : { TYPESAFE_API_KEY: opts.key })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.toast', (_$, e) => {
    world.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: world.tokens, window: 1_000_000 }, rateLimits: {} } as never }))
  on('session.messages', () => ({ value: world.messages as never }))
  on('http.fetch', (_$, e) => {
    world.requests.push(e.init?.body ?? '')
    const jev = world.jev
    if (jev === undefined) throw new Error('offline')
    return { value: { status: jev.status, ok: jev.status < 300, headers: {}, text: jev.text } }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }) as never)
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  return world
}

const jevSays = (choice: string, confidence = 0.95) => ({ status: 200, text: JSON.stringify({ answers: { relation: { choice, confidence } } }) })

async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: '/tmp/topic-test', surface: 'terminal', isInteractive: true })
}

/** 先跑一個 step 讓 mod 記下開場長度，再把對話長度加上 grown，送出 text */
async function ask($: Engine, w: World, text: string, grown = 20_000): Promise<void> {
  const s = $.turn.step({ turnId: 't0', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 })
  for await (const _ of s) void _
  w.tokens += grown
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
}

test('無關且有把握：提醒 /clear，prompt 照送', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated'), key: 'k' })
  await start($)
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單')
  expect(w.requests).toHaveLength(1)
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toContain('/clear')
  expect(w.toasts[0]).toContain('20k')
})

test('有關、或信心不夠：不提醒', async ($, on) => {
  const w1 = engineBeneath(on, { jev: jevSays('related'), key: 'k' })
  await start($)
  await ask($, w1, '再加上電話號碼的驗證')
  expect(w1.toasts).toHaveLength(0)
})

test('信心不夠不提醒', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated', 0.6), key: 'k' })
  await start($)
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單')
  expect(w.requests).toHaveLength(1)
  expect(w.toasts).toHaveLength(0)
})

test('對話才長一點點（不到 10k）：不問 Jev', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated'), key: 'k' })
  await start($)
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單', 3_000)
  expect(w.requests).toHaveLength(0)
  expect(w.toasts).toHaveLength(0)
})

test('簡短接續、斜線指令、非真人 prompt：不問 Jev', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated'), key: 'k' })
  await start($)
  await ask($, w, '好，繼續')
  await $.prompt.submit({ text: '/compact', wait: false, origin: { kind: 'composer' } } as never)
  expect(w.requests).toHaveLength(0)
})

test('沒有任何前文：不問 Jev', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated'), key: 'k', history: false })
  await start($)
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單')
  expect(w.requests).toHaveLength(0)
  expect(w.toasts).toHaveLength(0)
})

test('提醒過後冷卻 3 則 prompt，第 4 則才再問', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated'), key: 'k' })
  await start($)
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單')
  for (const t of ['查一下 Docker 怎麼清 volume', '把這句翻成英文：今天天氣很好，我們去公園散步', '幫我寫一個 regex 抓 email']) {
    await $.prompt.submit({ text: t, wait: false, origin: { kind: 'composer' } } as never)
  }
  expect(w.requests).toHaveLength(1)
  await $.prompt.submit({ text: '請解釋一下 CAP 定理在分散式資料庫的意思', wait: false, origin: { kind: 'composer' } } as never)
  expect(w.requests).toHaveLength(2)
  expect(w.toasts).toHaveLength(2)
})

test('/topic off 之後不問；開關狀態跨 session 保留', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated'), key: 'k' })
  await start($)
  const ran = await $.command.run({ command: 'topic', args: 'off', ...COMMAND })
  expect(JSON.stringify(ran)).toContain('關')
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單')
  expect(w.requests).toHaveLength(0)
})

test('預設存成關的人，重開 session 還是關', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated'), key: 'k', stored: { isOn: false } })
  await start($)
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單')
  expect(w.requests).toHaveLength(0)
})

test('沒有 key：只提示一次；Jev 出錯：提示但不提醒 /clear', async ($, on) => {
  const w = engineBeneath(on, { jev: jevSays('unrelated'), key: undefined })
  await start($)
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單')
  await ask($, w, '查一下 Docker 怎麼清 volume')
  expect(w.requests).toHaveLength(0)
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toContain('TYPESAFE_API_KEY')
})

test('Jev 回錯誤碼：提示一則，不提醒 /clear', async ($, on) => {
  const w = engineBeneath(on, { jev: { status: 401, text: '{}' }, key: 'bad' })
  await start($)
  await ask($, w, '幫我整理這週的會議紀錄成待辦清單')
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toContain('401')
  expect(w.toasts[0]).not.toContain('/clear')
})
