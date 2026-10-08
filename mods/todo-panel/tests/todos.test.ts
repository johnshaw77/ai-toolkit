import { test, expect } from 'claude-code/testing'

import { bar, current, fmtElapsed, fromTodoWrite, markItem, marksNote, progress, taskCreate, taskUpdate } from '../hooks/todos'

const T = (content: string, status: 'pending' | 'in_progress' | 'completed') => ({ content, status, activeForm: `正在${content}` })

test('TodoWrite 依內容對回舊項目，保留開始時間', () => {
  let l = fromTodoWrite([], [T('寫測試', 'in_progress'), T('實作', 'pending')], 1000)
  expect(l[0].startedAt).toBe(1000)
  l = fromTodoWrite(l, [T('寫測試', 'completed'), T('實作', 'in_progress')], 5000)
  expect(l[0]).toMatchObject({ startedAt: 1000, doneAt: 5000, status: 'completed' })
  expect(l[1].startedAt).toBe(5000)
  expect(current(l)?.active).toBe('正在實作')
})

test('Task 系列：建立、改狀態、刪除', () => {
  let l = taskCreate([], '1', '讀模組', undefined)
  l = taskCreate(l, '1', '讀模組', undefined)
  expect(l.length).toBe(1)
  l = taskUpdate(l, { taskId: '1', status: 'in_progress' }, 200)
  expect(l[0].startedAt).toBe(200)
  l = taskUpdate(l, { taskId: '1', status: 'deleted' }, 300)
  expect(l.length).toBe(0)
})

test('使用者標記算進進度，並轉成給 Claude 的說明', () => {
  let l = fromTodoWrite([], [T('A', 'completed'), T('B', 'pending'), T('C', 'pending')], 0)
  l = markItem(l, l[2].id, 'skip')
  expect(progress(l)).toEqual({ done: 2, total: 3 })
  expect(marksNote([])).toBeNull()
  expect(marksNote([{ text: 'C', mark: 'skip' }])).toContain('「C」→ 跳過')
})

test('進度條與經過時間', () => {
  expect(bar(3, 5, 10)).toBe('▓▓▓▓▓▓░░░░')
  expect(bar(0, 0, 4)).toBe('░░░░')
  expect(fmtElapsed(42_000)).toBe('42s')
  expect(fmtElapsed(125_000)).toBe('2m05s')
  expect(fmtElapsed(3_725_000)).toBe('1h02m')
})
