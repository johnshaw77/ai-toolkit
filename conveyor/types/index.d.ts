/** 影格計數：每 100 ms 加一，畫面跟著重畫 */
export type Frame = number

declare module 'claude-code' {
  interface PluginState {
    conveyor: { frame: Frame }
  }
}
