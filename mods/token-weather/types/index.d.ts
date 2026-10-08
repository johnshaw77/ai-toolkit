/** 上下文窗口目前的讀數。 */
export type Reading = { tokens: number; window: number; percent: number }

/** 一輪對話（一次送出提示詞）結束時的飽和度，0 到 100。 */
export type Sample = { turn: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'token-weather': {
      reading: Reading | null
      history: Sample[]
      turn: number
    }
  }
}
