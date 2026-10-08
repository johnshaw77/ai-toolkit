import { expect, test } from 'claude-code/testing'

import { formatTable, parseProbe } from '../hooks/list'

test('解析：格式不對就當作沒有', async () => {
  expect(parseProbe('')).toEqual([])
  expect(parseProbe('not json')).toEqual([])
  expect(parseProbe('{"a":1}')).toEqual([])
  expect(parseProbe('[1, null, {"x":1}]')).toEqual([])
})

test('解析：欄位補預設值', async () => {
  expect(parseProbe('[{"name":"a"}]')).toEqual([{ name: 'a', description: '', commands: [], isLoaded: false }])
})

test('表格：載入中的排前面、# 從 1 開始、沒有指令寫破折號', async () => {
  const out = formatTable([
    { name: 'zeta', description: 'Z', commands: [], isLoaded: false },
    { name: 'beta', description: 'B', commands: ['b', 'bb'], isLoaded: true },
  ])
  const lines = out.split('\n')
  expect(lines[1]).toBe('|---:|---|---|---|---|')
  expect(lines[2]).toBe('| 1 | `beta` | `/b`、`/bb` | ✓ | B |')
  expect(lines[3]).toBe('| 2 | `zeta` | — | 未載入 | Z |')
})

test('表格：空清單給說明', async () => {
  expect(formatTable([])).toContain('找不到')
})
