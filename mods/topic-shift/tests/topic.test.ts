import { expect, test } from 'claude-code/testing'

import { buildRequest, growth, isFollowup, parseVerdict, recentTurns, reminder, shouldRemind, toggled } from '../hooks/topic'

const body = (choice: string, confidence: number) => JSON.stringify({ answers: { relation: { choice, confidence } } })

test('簡短接續不問；有疑問語氣的短句要問', async () => {
  expect(isFollowup('好，繼續')).toBe(true)
  expect(isFollowup('照你推薦的做')).toBe(true)
  expect(isFollowup('為什麼？')).toBe(false)
  expect(isFollowup('幫我寫一個 Python 函式去除重複')).toBe(false)
})

test('toggled：不給參數切換，看不懂回 undefined', async () => {
  expect(toggled(true, '')).toBe(false)
  expect(toggled(false, ' ON ')).toBe(true)
  expect(toggled(true, 'off')).toBe(false)
  expect(toggled(true, 'maybe')).toBeUndefined()
})

test('growth 以看過最小的非零長度當開場', async () => {
  expect(growth(0, 70_000)).toEqual({ growth: 0, baseline: 70_000 })
  expect(growth(70_000, undefined)).toEqual({ growth: 0, baseline: 70_000 })
  expect(growth(95_000, 70_000)).toEqual({ growth: 25_000, baseline: 70_000 })
  expect(growth(60_000, 70_000)).toEqual({ growth: 0, baseline: 60_000 })
})

test('recentTurns 略過沒文字的訊息、只取最近 6 則、每則截短', async () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? ('assistant' as const) : ('user' as const), text: i === 5 ? '' : `m${i}` }))
  const r = recentTurns(msgs)
  expect(r).toHaveLength(6)
  expect(r.map(t => t.text)).toEqual(['m3', 'm4', 'm6', 'm7', 'm8', 'm9'])
  expect(recentTurns([{ role: 'user', text: 'x'.repeat(1000) }])[0]?.text.length).toBe(301)
})

test('parseVerdict：讀得懂的才回，格式不對回 undefined', async () => {
  expect(parseVerdict(body('unrelated', 0.93))).toEqual({ related: false, confidence: 0.93 })
  expect(parseVerdict(body('related', 0.9))).toEqual({ related: true, confidence: 0.9 })
  expect(parseVerdict(body('maybe', 0.9))).toBeUndefined()
  expect(parseVerdict('not json')).toBeUndefined()
  expect(parseVerdict('{"answers":{}}')).toBeUndefined()
})

test('shouldRemind：只有「無關」且信心 ≥ 0.8 才提醒', async () => {
  expect(shouldRemind({ related: false, confidence: 0.8 })).toBe(true)
  expect(shouldRemind({ related: false, confidence: 0.79 })).toBe(false)
  expect(shouldRemind({ related: true, confidence: 0.99 })).toBe(false)
})

test('buildRequest 帶最近對話與新請求，提醒文字顯示 k tokens', async () => {
  const req = JSON.parse(buildRequest('新題目', [{ role: 'user', text: '舊題目' }]))
  expect(JSON.parse(req.state)).toEqual({ recent_conversation: [{ role: 'user', text: '舊題目' }], new_request: '新題目' })
  expect(Object.keys(req.questions)).toEqual(['relation'])
  expect(reminder(25_400)).toContain('25k')
  expect(reminder(25_400)).toContain('/clear')
})
