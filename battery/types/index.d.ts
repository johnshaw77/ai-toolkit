/** 一顆電池：left 是剩餘比例 0–1，null＝還沒有讀數 */
export type Meter = { label: string; left: number | null; resetsAt?: number }

export type Reading = { meters: Meter[]; usd?: number }

declare module 'claude-code' {
  interface PluginState {
    battery: { reading: Reading | null; frame: number; isHidden: boolean }
  }
}
