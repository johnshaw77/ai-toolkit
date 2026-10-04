import { expect, test } from 'claude-code/testing'

import { toggled } from '../hooks/toggle'

test('開關指令：空的切換、on／off 指定、其他看不懂', async () => {
  expect(toggled(true, '')).toBe(false)
  expect(toggled(false, '  ')).toBe(true)
  expect(toggled(false, 'ON')).toBe(true)
  expect(toggled(true, 'off')).toBe(false)
  expect(toggled(true, 'maybe')).toBeUndefined()
})
