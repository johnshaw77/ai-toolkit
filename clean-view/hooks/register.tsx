import type { Register } from 'claude-code'

import { registerCleanView } from './clean-view'
import { registerDock } from './dock'

// 每個 mod 一行。Dock 要先註冊：helper 的 report_progress 要先被 Dock 接住，再輪到 Clean View。
export const register: Register = on => {
  registerDock(on)
  registerCleanView(on)
}
