import { expect, test } from 'claude-code/testing'

import { fileX, H, hasArrived, labelOf, render, walker } from '../hooks/scene'

test('檔名標籤', async () => {
  expect(labelOf('Edit', { file_path: '/a/b/effects.ts' })).toBe('effects.ts')
  expect(labelOf('Bash', { command: '  npm test --watch' })).toBe('$ npm')
  expect(labelOf('Grep', { pattern: 'TODO' })).toBe('/TODO/')
  expect(labelOf('WebSearch', {})).toBe('WebSearch')
})

test('方塊走到檔案就算送達', async () => {
  const b = { born: 0, lane: 0, color: 0 }
  expect(hasArrived(b, 0, 100)).toBe(false)
  expect(hasArrived(b, 10_000, 100)).toBe(true)
  expect(fileX(100)).toBe(80)
})

test('畫面尺寸與檔名疊字', async () => {
  const r = render(80, { now: 0, frame: 0, blocks: [], label: 'a.ts' })
  expect(r.px.length).toBe(80 * H)
  expect([...r.overlay.values()].map(o => o.ch).join('')).toBe('a.ts')
})

test('來回走：到盡頭轉身', async () => {
  const out = walker(100, 1_000)
  expect(out.dir).toBe(1)
  // 一趟 = (fileX - 2 - 12 - 7) / 0.01 ms
  const span = fileX(100) - 2 - 12 - 7
  const back = walker(100, (span / 0.01) * 1.5)
  expect(back.dir).toBe(-1)
  expect(back.x).toBeLessThan(span)
})
