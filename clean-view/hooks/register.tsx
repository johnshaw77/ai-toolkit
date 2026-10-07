import type { Register } from 'claude-code'

import { registerCleanView } from './clean-view'

// 每個 mod 一行；之後要加新的 mod，就在這裡多呼叫一個 register 函式。
export const register: Register = on => {
  registerCleanView(on)
}
