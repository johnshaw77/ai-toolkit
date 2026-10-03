import { expect, test } from 'claude-code/testing'

import { BAT_H, BAT_W, countdown, drawBattery, fitMeters, litCount, toReading } from '../hooks/battery'

test('usage 轉成剩餘電量', async () => {
  const r = toReading({
    context: { tokens: 56_000, window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 69 }],
    cost: { usd: 1.5 },
  })
  expect(r.meters.map(m => m.left)).toEqual([0.72, 0.31])
  expect(r.usd).toBe(1.5)
})

test('電量格數與像素尺寸', async () => {
  expect(litCount(1)).toBe(15)
  expect(litCount(0.01)).toBe(1)
  expect(litCount(0)).toBe(0)
  expect(drawBattery(0.5, 0, false).length).toBe(BAT_W * BAT_H)
})

test('倒數與窄螢幕', async () => {
  expect(countdown(134 * 60_000)).toBe('2h14m')
  const meters = [{ label: 'a', left: 1 }, { label: 'b', left: 1 }, { label: 'c', left: 1 }]
  expect(fitMeters(meters, 130).length).toBe(3)
  expect(fitMeters(meters, 30).length).toBe(1)
})
