import { describe, expect, test } from 'claude-code/testing'
import type { On, RenderElement, SessionContextUsage } from 'claude-code'

import { sparkline, weatherOf } from './register'

const SURFACES = ['terminal', 'desktop'] as const
const BAND = {
  plugin: 'token-weather',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// 測試裡的 hook 站在 plugin 底下，代替引擎本身
const engine = (on: On) => {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return h(Text, { key: 'engine' }, 'engine') as RenderElement
  })
}

const submit = { wait: false, origin: { kind: 'composer' } } as const

const context = (tokens: number, window = 200_000): SessionContextUsage => ({
  tokens,
  window,
  percent: Math.round((tokens / window) * 100),
})

describe('weatherOf', () => {
  test('每個門檻落在對的天氣', async () => {
    expect(weatherOf(0).en).toBe('Clear')
    expect(weatherOf(39).en).toBe('Clear')
    expect(weatherOf(40).en).toBe('Cloudy')
    expect(weatherOf(60).en).toBe('Showers')
    expect(weatherOf(75).en).toBe('Storm')
    expect(weatherOf(85).en).toBe('Compact soon')
    expect(weatherOf(100).en).toBe('Compact soon')
  })

  test('微型圖表用 0–100 的絕對刻度', async () => {
    expect(sparkline([{ turn: 1, percent: 0 }, { turn: 2, percent: 50 }, { turn: 3, percent: 100 }])).toBe('▁▅█')
  })
})

test('沒有讀數時不畫，讓下一層接手', async ($, on) => {
  engine(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    expect(await ui.find({ text: /Clear/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('量測後顯示天氣、百分比、token 數與圖表', async ($, on) => {
  engine(on)
  await $.prompt.submit({ ...submit, text: 'hi' })
  await $.session.measure({ context: context(46_120), rateLimits: [], changed: ['context'] })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /晴朗 Clear/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '23%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /46,120 \/ 200,000 tokens/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /近 1 輪/ })).toBeDefined()
    await ui.unmount()
  }
})

test('同一輪多次量測只留一筆，最多保留 12 輪', async ($, on) => {
  engine(on)
  for (let i = 1; i <= 15; i++) {
    await $.prompt.submit({ ...submit, text: `turn ${i}` })
    await $.session.measure({ context: context(i * 1_000), rateLimits: [], changed: ['context'] })
    await $.session.measure({ context: context(i * 11_000), rateLimits: [], changed: ['context'] })

    if (i === 3) {
      const early = await $.ui.mount({ ...BAND, surface: 'terminal' })
      expect(await early.find({ type: 'Text', text: /近 3 輪/ })).toBeDefined()
      await early.unmount()
    }
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /近 12 輪/ })).toBeDefined()
  // 15 × 11,000 = 165,000 → 83%：暴風雨
  expect(await ui.find({ type: 'Text', text: /暴風雨 Storm/ })).toBeDefined()
  await ui.unmount()
})

test('飽和度高時提示盡快壓縮', async ($, on) => {
  engine(on)
  await $.prompt.submit({ ...submit, text: 'big' })
  await $.session.measure({ context: context(180_000), rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /建議盡快壓縮 Compact soon/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '90%' })).toBeDefined()
  await ui.unmount()
})
