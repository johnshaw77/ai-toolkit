import { test, expect } from 'claude-code/testing'

import { classify, initial, isReady, reduce } from '../hooks/gate'

test('classify 認得測試、型別檢查、截圖、編輯', () => {
  expect(classify('Bash', { command: 'npm test' })).toEqual({ kind: 'test' })
  expect(classify('Bash', { command: 'npx vitest run' })).toEqual({ kind: 'test' })
  expect(classify('Bash', { command: 'npx tsc --noEmit' })).toEqual({ kind: 'typecheck' })
  expect(classify('Bash', { command: 'ls' })).toBeNull()
  expect(classify('mcp__claude-in-chrome__computer', {})).toEqual({ kind: 'verify' })
  expect(classify('Edit', { file_path: 'a/b.tsx' })).toEqual({ kind: 'edit', isFrontend: true })
  expect(classify('Write', { file_path: 'a/b.ts' })).toEqual({ kind: 'edit', isFrontend: false })
})

test('測試過了才可回報；失敗是紅燈', () => {
  let g = reduce(initial, { kind: 'test' }, false)
  expect(isReady(g)).toBe(true)
  g = reduce(g, { kind: 'typecheck' }, true)
  expect(g.typecheck).toBe('fail')
  expect(isReady(g)).toBe(false)
})

test('改檔讓已跑過的燈變 stale，沒跑過的維持 idle', () => {
  let g = reduce(initial, { kind: 'test' }, false)
  g = reduce(g, { kind: 'edit', isFrontend: false }, false)
  expect(g.test).toBe('stale')
  expect(g.typecheck).toBe('idle')
  expect(g.needsVerify).toBe(false)
  expect(isReady(g)).toBe(false)
})

test('動前端檔後必須再截圖驗證', () => {
  let g = reduce(initial, { kind: 'test' }, false)
  g = reduce(g, { kind: 'edit', isFrontend: true }, false)
  g = reduce(g, { kind: 'test' }, false)
  expect(isReady(g)).toBe(false)
  g = reduce(g, { kind: 'verify' }, false)
  expect(isReady(g)).toBe(true)
})
