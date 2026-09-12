import { describe, expect, it } from 'vitest'

import { MENU, filterMenu } from '../menu'

describe('選單', () => {
  it('一般使用者看不到只有管理員能進的項目', () => {
    const keys = filterMenu(MENU, false).map((node) => node.key)
    expect(keys).not.toContain('users')
  })

  it('管理員看得到全部', () => {
    expect(filterMenu(MENU, true)).toHaveLength(MENU.length)
  })
})
