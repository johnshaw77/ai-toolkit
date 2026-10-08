import { expect, test } from 'claude-code/testing'

import { brailleAt, dotAt, normalize, scrollOf, textDots } from '../hooks/led'
import { SPRITE_BG, colorOf, colsFor, DEMO_MS, DEMO_STEP_MS, demoMood, DEFAULT, draw, frameCells, GAP, H, labelOf, LED_COLORS, messageFor, MIN_LED_COLS, pickMood, pickScheme, pose, REACTION_MS, ROWS, SPRITE_W, TOOL_MS } from '../hooks/sprite'

const idle = { isWorking: false, lastToolAt: undefined, turnStartAt: 0, reaction: undefined }

test('每個姿勢都是 12 寬，放得進畫面', async () => {
  for (const mood of ['think', 'type', 'jump', 'down'] as const) {
    for (const t of [0, 250, 400, 1_200, 2_300]) {
      const { rows, dy } = pose(mood, t)
      expect(rows.every(r => r.length === 12)).toBe(true)
      expect(dy).toBeGreaterThanOrEqual(0)
      expect(dy + rows.length).toBeLessThanOrEqual(H)
      expect(draw(mood, t).length).toBe(SPRITE_W * H)
    }
  }
})

test('笑臉與哭臉左右對稱', async () => {
  for (const mood of ['jump', 'down'] as const) {
    const screen = pose(mood, 0).rows.slice(2, 7).map(r => r.slice(2, 10))
    expect(screen.every(r => r === [...r].reverse().join(''))).toBe(true)
  }
})

test('跳的時候離地；出錯螢幕泛紅；思考會眨眼', async () => {
  expect(pose('jump', 400).dy).toBeLessThan(pose('jump', 0).dy)
  expect(pose('down', 0).rows.join('')).toContain('S')
  expect(pose('think', 0).rows).not.toEqual(pose('think', 2_900).rows)
})

test('狀態挑選', async () => {
  expect(pickMood(idle, 1_000)).toBeUndefined()
  expect(pickMood({ ...idle, isWorking: true, turnStartAt: 100 }, 1_000)).toEqual({ mood: 'think', since: 900 })
  expect(pickMood({ ...idle, isWorking: true, lastToolAt: 900 }, 1_000)?.mood).toBe('type')
  expect(pickMood({ ...idle, isWorking: true, lastToolAt: 1_000 - TOOL_MS }, 1_000)?.mood).toBe('think')
  const r = { mood: 'jump' as const, at: 0 }
  expect(pickMood({ ...idle, reaction: r }, REACTION_MS - 1)?.mood).toBe('jump')
  expect(pickMood({ ...idle, reaction: r }, REACTION_MS)).toBeUndefined()
})

test('跑馬燈文字', async () => {
  expect(messageFor('think', undefined)).toBe('THINKING...')
  expect(messageFor('type', 'Edit a.ts')).toBe('Edit a.ts')
  expect(messageFor('jump', 'x')).toContain('DONE')
  expect(normalize('edit 中文.ts')).toBe('EDIT ??.TS')
  expect(labelOf('Edit', { file_path: '/a/b/register.tsx' })).toBe('Edit register.tsx')
  expect(labelOf('Bash', { command: ' npm test --watch' })).toBe('$ npm test')
})

test('LED 點陣：A 的頂端、點與點之間留空', async () => {
  // A 第一列 0x0e = .###. → 第 1～3 個點位亮，換成 braille 點座標是 x = 2, 4, 6
  expect(dotAt('A', 0, 0, 0, 0)).toBe(false)
  expect(dotAt('A', 2, 0, 0, 0)).toBe(true)
  expect(dotAt('A', 3, 0, 0, 0)).toBe(false) // 間隔
  expect(dotAt('A', 2, 1, 0, 0)).toBe(false) // 列間隔
  expect(brailleAt(' ', 0, 0, 0, 0)).toBeUndefined()
  expect(brailleAt('A', 1, 0, 0, 0)?.code).toBeGreaterThan(0x2800)
  expect(brailleAt('AB', 7, 0, 0, 0)?.char).toBe(1) // 第 7 格是 B 的第一個點位
})

test('放得下就不捲；放不下先停再捲，會繞回來', async () => {
  expect(scrollOf('HI', 80, 99_999)).toBe(0)
  const long = 'THIS IS A VERY LONG MESSAGE'
  expect(scrollOf(long, 80, 500)).toBe(0)
  expect(scrollOf(long, 80, 2_000)).toBeGreaterThan(0)
  expect(scrollOf(long, 80, 1e9)).toBeLessThan(textDots(long) + 24)
})

test('LED 撐滿欄寬，但至少留 MIN_LED_COLS', async () => {
  expect(colsFor(150)).toBe(150)
  expect(colsFor(10)).toBe(SPRITE_W + GAP + MIN_LED_COLS)
  for (const cols of [colsFor(10), 80, 150]) {
    const b64 = frameCells('think', 0, 'THINKING...', 0, cols, { offset: 0 })
    expect(b64.length).toBe(Math.ceil((cols * ROWS * 3 * 4) / 3) * 4)
  }
  expect(draw('think', 0)[0]).toBe(SPRITE_BG) // 遊戲機區塗黑，不透出終端機背景
})

test('逐字變色：相鄰的字不同色，時間一到整串往後流動', async () => {
  const sch = pickScheme(0)
  expect(colorOf(sch, 0, 0)).not.toBe(colorOf(sch, 1, 0))
  expect(colorOf(sch, 0, 350)).toBe(colorOf(sch, 1, 0))
  expect(colorOf(pickScheme(0.999), 0, 0)).toBe(LED_COLORS[LED_COLORS.length - 1])
})

test('demo 輪播：四個狀態各 3 秒，播完收起', async () => {
  expect(demoMood(undefined, 0)).toBeUndefined()
  expect(demoMood(1_000, 1_000)?.mood).toBe('think')
  expect(demoMood(0, DEMO_STEP_MS)).toEqual({ mood: 'type', since: 0, label: 'Edit register.tsx' })
  expect(demoMood(0, DEMO_STEP_MS * 2 + 10)?.mood).toBe('jump')
  expect(demoMood(0, DEMO_MS - 1)?.mood).toBe('down')
  expect(demoMood(0, DEMO_MS)).toBeUndefined()
})

test('遊戲機左右都留黑邊', async () => {
  const px = draw('think', 0)
  const col = (x: number) => Array.from({ length: H }, (_, y) => px[y * SPRITE_W + x])
  for (const x of [0, 1, SPRITE_W - 2, SPRITE_W - 1]) expect(col(x).every(c => c === SPRITE_BG)).toBe(true)
  expect(col(2).some(c => c !== SPRITE_BG)).toBe(true)
})
