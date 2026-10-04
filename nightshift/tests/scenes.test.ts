import { expect, test } from 'claude-code/testing'

import { DEV_H, DEV_W, devRows } from '../hooks/dev'
import { DONE_MS, ERROR_MS, moodOf } from '../hooks/mood'
import { DEFAULT, toCells } from '../hooks/pix'
import { layout, render } from '../hooks/scenes'

const MOODS = ['idle', 'work', 'error', 'done'] as const

test('主角每一列都是 30 寬、共 22 列', async () => {
  for (const mood of MOODS) {
    for (const since of [0, 180, 2_900]) {
      const rows = devRows({ mood, since })
      expect(rows.length).toBe(DEV_H)
      expect(rows.every(r => r.length === DEV_W)).toBe(true)
    }
  }
})

test('完成時舉手、出錯冒汗、工作時檯燈亮', async () => {
  expect(devRows({ mood: 'done', since: 0 })[5]?.[13]).toBe('A')
  expect(devRows({ mood: 'error', since: 0 })[4]?.[22]).toBe('S')
  expect(devRows({ mood: 'idle', since: 0 })[7]?.slice(6, 8)).toBe('YY')
})

test('兩個場景、各種尺寸與狀態都畫得出來、塞滿畫面', async () => {
  for (const name of ['studio', 'camp'] as const) {
    for (const [w, h] of [[32, 28], [60, 40], [120, 90], [200, 200]] as const) {
      for (const mood of MOODS) {
        const c = render(name, w, h, { mood, since: 500 }, 123_456)
        expect(c.px.length).toBe(w * h)
        expect(c.px.every(p => p !== DEFAULT)).toBe(true)
        expect(toCells(c).length).toBe(Math.ceil((w * (h / 2) * 12) / 3) * 4)
      }
    }
  }
})

test('主角放在畫面內；夠大時放大兩倍', async () => {
  const small = layout(40, 30)
  expect(small.scale).toBe(1)
  expect(small.oy).toBeGreaterThanOrEqual(0)
  const big = layout(120, 90)
  expect(big.scale).toBe(2)
  expect(big.ox + DEV_W * 2).toBeLessThanOrEqual(120)
})

test('狀態：出錯優先，其次工作中，再來慶祝，最後閒著', async () => {
  const t = { isWorking: false, workAt: 0 }
  expect(moodOf(t, 1_000).mood).toBe('idle')
  expect(moodOf({ ...t, isWorking: true }, 1_000).mood).toBe('work')
  expect(moodOf({ ...t, doneAt: 0 }, DONE_MS - 1).mood).toBe('done')
  expect(moodOf({ ...t, doneAt: 0 }, DONE_MS).mood).toBe('idle')
  expect(moodOf({ ...t, isWorking: true, errorAt: 0 }, ERROR_MS - 1).mood).toBe('error')
})
