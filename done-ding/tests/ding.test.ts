import { expect, test } from 'claude-code/testing'

import { messageFor, parseArgs, shouldDing, soundFor } from '../hooks/ding'

const on = { isOn: true, minSeconds: 30 }

test('夠久的主迴圈 turn 才響', async () => {
  expect(shouldDing({ reason: 'answer', durationMs: 29_999 }, on)).toBe(false)
  expect(shouldDing({ reason: 'answer', durationMs: 30_000 }, on)).toBe(true)
})

test('被中斷、子 agent、關掉的都不響', async () => {
  expect(shouldDing({ reason: 'aborted', durationMs: 99_000 }, on)).toBe(false)
  expect(shouldDing({ reason: 'answer', durationMs: 99_000, agentId: 'sub' }, on)).toBe(false)
  expect(shouldDing({ reason: 'answer', durationMs: 99_000 }, { ...on, isOn: false })).toBe(false)
})

test('出錯與拒絕也要響，聲音不同', async () => {
  expect(shouldDing({ reason: 'error', durationMs: 40_000 }, on)).toBe(true)
  expect(soundFor('answer')).toContain('Glass')
  expect(soundFor('error')).toContain('Basso')
  expect(messageFor({ reason: 'answer', durationMs: 61_400 })).toBe('做完了（61 秒）')
})

test('指令解析', async () => {
  expect(parseArgs('')).toEqual({ kind: 'status' })
  expect(parseArgs(' OFF ')).toEqual({ kind: 'toggle', isOn: false })
  expect(parseArgs('60')).toEqual({ kind: 'seconds', seconds: 60 })
  expect(parseArgs('0')).toEqual({ kind: 'invalid' })
  expect(parseArgs('abc')).toEqual({ kind: 'invalid' })
})
