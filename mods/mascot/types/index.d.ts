/** 影格計數：動畫進行中每 150 ms 加一，畫面跟著重畫 */
export type Frame = number

declare module 'claude-code' {
  interface PluginState {
    mascot: { frame: Frame }
  }
}
