import { test, expect } from 'claude-code/testing'

import { fallback, parseLabel, parseProbe, withLabel } from '../hooks/badge'

test('有設定檔就用設定的名稱與顏色', () => {
  expect(parseProbe('{"label":"MINI 1","color":"cyan"}\n---host---\nJohndeMac-mini\n')).toEqual({ label: 'MINI 1', color: 'cyan' })
})

test('沒設定檔或格式壞掉，退回機器名稱與固定色', () => {
  const a = parseProbe('\n---host---\nJohndeMac-mini\n')
  expect(a.label).toBe('JOHNDEMAC-MINI')
  expect(parseProbe('{壞掉\n---host---\nJohndeMac-mini\n')).toEqual(a)
  expect(fallback('JohndeMac-mini')).toEqual(a)
})

test('設定檔只給名稱，顏色退回固定色', () => {
  const b = parseProbe('{"label":"4090"}\n---host---\nkw60user-MS-7E25')
  expect(b.label).toBe('4090')
  expect(b.color).toBe(fallback('kw60user-MS-7E25').color)
})

test('/badge 只改名稱，保留原本的顏色與其他欄位', () => {
  expect(JSON.parse(withLabel('{ "label": "MBP", "color": "magenta" }', 'MacBook'))).toEqual({ label: 'MacBook', color: 'magenta' })
  expect(JSON.parse(withLabel('', 'MINI'))).toEqual({ label: 'MINI' })
  expect(JSON.parse(withLabel('{壞掉', 'MINI'))).toEqual({ label: 'MINI' })
  expect(parseLabel('  工作機 ')).toBe('工作機')
  expect(parseLabel('   ')).toBe('')
})
