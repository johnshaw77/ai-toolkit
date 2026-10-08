import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cleanName, displayWidth } from '../hooks/checklist'

const PLUGIN = 'clean-view'
const SURFACES = ['terminal', 'desktop'] as const
const PLAN = 'mcp__clean-view__plan_steps'
const PROGRESS = 'mcp__clean-view__report_progress'

function band(bodyColumns = 80) {
  return {
    plugin: PLUGIN,
    component: 'AbovePrompt' as const,
    props: {
      hasSurvey: false,
      isWorking: true,
      maxRows: 20,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 19 },
      view: {},
    },
  }
}

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

/** 引擎底層：時鐘、store、一輪的開始結束、一般工具、Haiku 都在記憶體裡回答。 */
function engineBeneath(on: On, stored: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, stored)
  mock.env(on, { HOME: '/tmp/clean-view-test-home' })
  on('session.id', () => ({ value: 'session-1' }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('fs.write', () => ({ value: undefined }))
  const toasts: string[] = []
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}))
  on('tool.call', () => ({ result: 'ok' }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.toast', (_$, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  on('model.complete', () => ({ value: { isAnswered: true as const, text: '「建立登陸頁」', usage: USAGE } }))
  return { clock, toasts }
}

const COMMAND = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }

describe('1. 名稱清理', () => {
  test('拿掉 backtick 程式碼', () => {
    expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
    expect(cleanName('建立價格區塊於 `src/Pricing.tsx`')).toBe('建立價格區塊於')
  })

  test('句子中間的路徑和檔名會消失', () => {
    expect(cleanName('Update the header in src/components/Header and the footer')).toBe(
      'Update the header in and the footer',
    )
    expect(cleanName('修正src/app/main.ts的版面')).toBe('修正的版面')
    expect(cleanName('fix layout in Pricing.tsx now')).toBe('Fix layout in now')
  })

  test('80 個字元的名稱截到 40 格以內', () => {
    const long = 'Write a friendly welcome message for new visitors and explain every pricing plan'
    expect(long.length).toBe(80)
    const cleaned = cleanName(long)
    expect(cleaned.length).toBeLessThanOrEqual(40)
    expect(displayWidth(cleaned)).toBeLessThanOrEqual(40)
    expect(cleaned).toEndWith('…')
    expect(cleaned).toBe('Write a friendly welcome message for…')
    const chinese = cleanName('替新來的訪客寫一段親切的歡迎詞並且把每一種價格方案都解釋清楚')
    expect(displayWidth(chinese)).toBeLessThanOrEqual(40)
    expect(chinese).toEndWith('…')
  })

  test('什麼都不剩就用「處理中」', () => {
    expect(cleanName('`npm run build`')).toBe('處理中')
  })
})

test('2. 待辦清單加上 60% 回報：✓ / ▶ 60% / 下一步 / 稍後（終端機與桌面版）', async ($, on) => {
  engineBeneath(on)
  await $.turn.start({ text: '幫我做一個登陸頁', turnId: 't2' })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: '讀你的品牌筆記', status: 'completed', activeForm: '讀品牌筆記中' },
      { content: '建立價格區塊', status: 'in_progress', activeForm: '建立價格區塊中' },
      { content: '加上聯絡表單', status: 'pending', activeForm: '加上聯絡表單中' },
      { content: '修飾頁尾', status: 'pending', activeForm: '修飾頁尾中' },
    ],
  })
  await $.tool.call({ tool: PROGRESS, task: '建立價格區塊', percent: 60 })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...band(), surface })
    expect(await ui.find({ type: 'Text', text: /^✓ $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /讀你的品牌筆記/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▶ $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /██████░░░░/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^60%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^下一步$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^稍後$/ })).toBeDefined()
    expect(await ui.find({ key: 'clean-view-toggle' })).toBeDefined()
    await ui.unmount()
  }
})

test('2b. 很窄的終端機也不會換行', async ($, on) => {
  engineBeneath(on)
  await $.turn.start({ text: '幫我做一個登陸頁', turnId: 't2b' })
  await $.tool.call({ tool: PLAN, steps: ['建立一個非常非常長而且說明很多細節的價格區塊', '加上聯絡表單'] })
  const ui = await $.ui.mount({ ...band(30), surface: 'terminal' })
  const name = await ui.find({ type: 'Text', text: /^建立/ })
  expect(name).toBeDefined()
  expect(displayWidth(name?.text ?? '')).toBe(30 - 20)
  await ui.unmount()
})

test('3. 權限提示會顯示「需要你」', async ($, on) => {
  engineBeneath(on)
  await $.turn.start({ text: '幫我整理檔案', turnId: 't3' })
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...band(), surface })
    expect(await ui.find({ type: 'Text', text: /需要你/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /需要你同意才能繼續/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^‖ $/ })).toBeDefined()
    await ui.unmount()
  }
  // 下一個工具一跑，「需要你」就清掉
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: '整理檔案', status: 'in_progress', activeForm: '整理中' }] })
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /需要你/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^▶ $/ })).toBeDefined()
  await ui.unmount()
})

test('4. /simple off 收起清單，只留下按鈕；技術列也會回來', async ($, on) => {
  const { toasts } = engineBeneath(on)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  await $.turn.start({ text: '幫我做一個登陸頁', turnId: 't4' })

  const toolProps = {
    tool_use_id: 'tu1', tool: 'Bash', input: { command: 'ls' },
    isRunning: false, isErrored: false, isInterrupted: false,
  }
  const hiddenRow = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolUse', props: toolProps })
  expect(await hiddenRow.find({ type: 'Text', text: 'engine row' })).toBeUndefined()
  await hiddenRow.unmount()

  const ran = await $.command.run({ command: 'simple', args: 'off', ...COMMAND })
  expect(ran.text).toMatch(/關/)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...band(), surface })
    expect(await ui.find({ type: 'Text', text: /理解你的需求/ })).toBeUndefined()
    const button = await ui.find({ key: 'clean-view-toggle' })
    expect(button?.props.label).toBe('○ 簡潔檢視：關')
    await ui.unmount()
  }
  const shownRow = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolUse', props: toolProps })
  expect(await shownRow.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  await shownRow.unmount()

  // 按鈕再按一次就打開，設定存進 store
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await ui.press({ key: 'clean-view-toggle' })
  expect((await ui.find({ key: 'clean-view-toggle' }))?.props.label).toBe('● 簡潔檢視：開')
  expect(toasts.at(-1)).toMatch(/已開啟/)
  await ui.unmount()
})

test('4b. 設定存在 store，重開後還記得', async ($, on) => {
  engineBeneath(on, { cleanViewEnabled: false })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  expect((await ui.find({ key: 'clean-view-toggle' }))?.props.label).toBe('○ 簡潔檢視：關')
  await ui.unmount()
})

test('5. plan_steps 後回報 100：第一步勾掉，第二步開始', async ($, on) => {
  engineBeneath(on)
  await $.turn.start({ text: '幫我做一個登陸頁', turnId: 't5' })
  const planned = await $.tool.call({ tool: PLAN, steps: ['讀品牌筆記', '建立價格區塊', '加上聯絡表單'] })
  expect(planned.result).toBe('Planned 3 steps. The first one has started.')
  const reported = await $.tool.call({ tool: PROGRESS, task: '讀品牌筆記', percent: 140 })
  expect(reported.result).toBe('Progress noted: 100%.')
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toMatch(/"✓ ".*讀品牌筆記.*"完成".*"▶ ".*建立價格區塊.*"進行中".*"○ ".*加上聯絡表單.*"下一步"/)
  await ui.unmount()
})

test('6. 還沒有計畫前，其他工具一律擋下；有計畫後放行', async ($, on) => {
  engineBeneath(on)
  await $.turn.start({ text: '幫我看一下這個檔案', turnId: 't6' })
  const denied = await $.tool.call({ tool: 'Read', file_path: '/tmp/a.txt' })
  expect(denied.deny ?? denied.text).toMatch(/plan_steps/)
  expect(denied.result).toBeUndefined()
  const search = await $.tool.call({ tool: 'ToolSearch', query: 'select:x', max_results: 1 })
  expect(search.isError).toBeUndefined()
  await $.tool.call({ tool: PLAN, steps: ['看你的檔案', '整理重點'] })
  const allowed = await $.tool.call({ tool: 'Read', file_path: '/tmp/a.txt' })
  expect(allowed.isError).toBeUndefined()
  expect(allowed.result).toBe('ok')
})

test('7. 完成後顯示「全部完成」，5 秒後縮成一行', async ($, on) => {
  const { clock } = engineBeneath(on)
  await $.turn.start({ text: '幫我做一個登陸頁', turnId: 't7' })
  await $.tool.call({ tool: PLAN, steps: ['讀品牌筆記', '建立價格區塊'] })
  await $.tool.call({ tool: PROGRESS, task: '建立價格區塊', percent: 100 })
  await clock.advance(134_000)
  await $.turn.complete({ answer: '好了', durationMs: 134_000, isAborted: false, turnId: 't7', reason: 'answer' })

  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^✓ 全部完成 · 建立登陸頁 · 花了 2分14秒$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^完成$/ })).toBeDefined()
  await clock.advance(5000)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /^完成$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /全部完成/ })).toBeDefined()
  await ui.unmount()
})

test('8. 按 Esc 顯示「已停止」，API 錯誤變成一句白話', async ($, on) => {
  engineBeneath(on)
  await $.turn.start({ text: '幫我做一個登陸頁', turnId: 't8' })
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: true, turnId: 't8', reason: 'aborted' })
  let ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^■ 已停止 · .* · 你按了 Esc$/ })).toBeDefined()
  await ui.unmount()

  await $.turn.start({ text: '再試一次', turnId: 't8b' })
  await $.turn.complete({
    answer: 'API Error: 429 rate_limit_error', durationMs: 1000, isAborted: false, turnId: 't8b', reason: 'error',
  })
  ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '⚠ 卡住了：你已達到使用上限，請稍後再試' })).toBeDefined()
  await ui.unmount()
})
