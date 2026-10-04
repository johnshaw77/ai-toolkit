import { test, expect } from 'claude-code/testing'

import { crates, EMPTY_GATE, EMPTY_TODOS, moonLit, reduceGate, reduceTodos, sinkPx, sunPos, todoList } from '../hooks/hud'
import { renderSea } from '../hooks/sea'

test('吃水與貨箱跟著 context', () => {
  expect(sinkPx(null, 10)).toBe(0)
  expect(sinkPx(40, 10)).toBe(0)
  expect(sinkPx(100, 10)).toBe(5)
  expect(crates(0)).toBe(0)
  expect(crates(50)).toBe(3)
  expect(crates(100)).toBe(6)
})

test('太陽從日出走到日落，月亮越用越缺', () => {
  const dawn = sunPos(0, 100, 40)
  const noon = sunPos(50, 100, 40)
  const dusk = sunPos(100, 100, 40)
  expect(dawn.x).toBeLessThan(noon.x)
  expect(noon.x).toBeLessThan(dusk.x)
  expect(noon.y).toBeLessThan(dawn.y)
  expect(dawn.dusk).toBe(0)
  expect(dusk.dusk).toBe(1)
  expect(moonLit(0)).toBe(1)
  expect(moonLit(100)).toBe(0)
})

test('信號旗：測試、改檔過期、截圖', () => {
  let g = reduceGate(EMPTY_GATE, 'Bash', { command: 'npm test' }, false)
  expect(g.test).toBe('pass')
  g = reduceGate(g, 'Edit', { file_path: 'a.tsx' }, false)
  expect(g).toEqual({ test: 'stale', typecheck: 'idle', verify: 'idle' })
  g = reduceGate(g, 'Bash', { command: 'npx tsc' }, true)
  expect(g.typecheck).toBe('fail')
})

test('航海圖：TodoWrite 整份覆蓋，Task 逐筆', () => {
  let b = reduceTodos(EMPTY_TODOS, 'TodoWrite', { todos: [{ status: 'completed' }, { status: 'in_progress' }] }, undefined)
  b = reduceTodos(b, 'TaskCreate', {}, { task: { id: '7', subject: 'x' } })
  b = reduceTodos(b, 'TaskUpdate', { taskId: '7', status: 'completed' }, undefined)
  expect(todoList(b)).toEqual(['completed', 'in_progress', 'completed'])
  b = reduceTodos(b, 'TaskUpdate', { taskId: '7', status: 'deleted' }, undefined)
  expect(todoList(b).length).toBe(2)
})

test('renderSea 不帶資料時與原本一致，帶資料不會丟例外', () => {
  const a = renderSea(60, 40, 1234, 'sail')
  const b = renderSea(60, 40, 1234, 'sail', undefined)
  expect(a).toEqual(b)
  const data = { ctx: 90, usage: 70, weekly: 40, gate: { test: 'pass', typecheck: 'fail', verify: 'stale' }, todos: ['completed', 'in_progress', 'pending'] } as const
  for (const mode of ['sail', 'dock', 'storm'] as const) {
    const px = renderSea(60, 40, 1234, mode, { ...data, todos: [...data.todos] })
    expect(px.length).toBe(60 * 40)
    expect(px.every(c => Number.isInteger(c) && c >= 0 && c <= 0xffffff)).toBe(true)
  }
})
