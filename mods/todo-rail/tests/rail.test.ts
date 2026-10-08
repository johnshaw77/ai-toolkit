import { expect, test } from 'claude-code/testing'

import { clip, isAllDone, MAX_CELLS, railOf } from '../hooks/rail'

const t = (status: 'pending' | 'in_progress' | 'completed', activeForm = '做事中') => ({ content: '做事', status, activeForm })

test('進度條：完成數、總數、進行中的說法', async () => {
  const r = railOf([t('completed'), t('in_progress', '寫測試中'), t('pending')])
  expect(r.cells).toEqual(['completed', 'in_progress', 'pending'])
  expect(r.done).toBe(1)
  expect(r.total).toBe(3)
  expect(r.current).toBe('寫測試中')
})

test('沒有進行中就沒有說法；activeForm 空的退回 content', async () => {
  expect(railOf([t('pending')]).current).toBeUndefined()
  expect(railOf([{ content: '做事', status: 'in_progress', activeForm: '' }]).current).toBe('做事')
})

test('格子數有上限，總數照實', async () => {
  const many = Array.from({ length: MAX_CELLS + 5 }, () => t('pending'))
  const r = railOf(many)
  expect(r.cells.length).toBe(MAX_CELLS)
  expect(r.total).toBe(MAX_CELLS + 5)
})

test('全部完成才算收尾；空清單不算', async () => {
  expect(isAllDone([])).toBe(false)
  expect(isAllDone([t('completed'), t('pending')])).toBe(false)
  expect(isAllDone([t('completed'), t('completed')])).toBe(true)
})

test('截斷', async () => {
  expect(clip('abc', 5)).toBe('abc')
  expect(clip('abcdef', 4)).toBe('abc…')
})

import { addTask, DEMO, patchTask, syncTasks } from '../hooks/rail'

test('新版待辦：建立、更新、刪除', async () => {
  let list = addTask([], '1', '寫測試', '寫測試中')
  list = addTask(list, '2', '部署')
  expect(list.map(x => x.status)).toEqual(['pending', 'pending'])
  list = patchTask(list, { taskId: '1', status: 'in_progress' })
  expect(railOf(list).current).toBe('寫測試中')
  list = patchTask(list, { taskId: '1', status: 'completed' })
  list = patchTask(list, { taskId: '2', status: 'deleted' })
  expect(list.length).toBe(1)
  expect(isAllDone(list)).toBe(true)
})

test('同一個 id 重建不會重複；更新不存在的 id 不動', async () => {
  const list = addTask(addTask([], '1', 'a'), '1', 'b')
  expect(list.length).toBe(1)
  expect(list[0]?.content).toBe('b')
  expect(patchTask(list, { taskId: '9', status: 'completed' })).toEqual(list)
})

test('TaskList 照它的順序，保留 activeForm', async () => {
  const list = addTask([], '1', 'a', '做 a 中')
  const out = syncTasks(list, [
    { id: '2', subject: 'b', status: 'pending' },
    { id: '1', subject: 'a', status: 'in_progress' },
  ])
  expect(out.map(x => x.id)).toEqual(['2', '1'])
  expect(railOf(out).current).toBe('做 a 中')
})

test('demo 資料：2 完成、1 進行中', async () => {
  const r = railOf(DEMO)
  expect(r.done).toBe(2)
  expect(r.total).toBe(5)
  expect(r.current).toBe('補測試中')
})

import { createdId, isUpdated, listedTasks } from '../hooks/rail'

test('工具結果防禦式取值', async () => {
  expect(createdId({ task: { id: '7', subject: 'x' } })).toBe('7')
  expect(createdId(null)).toBeUndefined()
  expect(createdId({ task: { id: 7 } })).toBeUndefined()
  expect(isUpdated({ success: true, taskId: '1' })).toBe(true)
  expect(isUpdated({ success: false })).toBe(false)
  expect(isUpdated(undefined)).toBe(false)
  expect(listedTasks({ tasks: [{ id: '1', subject: 'a', status: 'completed' }, { id: '2', subject: 'b', status: 'weird' }] }))
    .toEqual([{ id: '1', subject: 'a', status: 'completed' }])
  expect(listedTasks({})).toBeUndefined()
})
