export type Status = 'pending' | 'in_progress' | 'completed'

export type Item = {
  id: string
  text: string
  active: string
  status: Status
  startedAt?: number
  doneAt?: number
  /** 使用者在面板上按的，只是告知 Claude，不改 Claude 自己的狀態 */
  mark?: 'done' | 'skip'
}

export type Mark = { text: string; mark: 'done' | 'skip' }

declare module 'claude-code' {
  interface PluginState {
    'todo-panel': { items: Item[]; marks: Mark[] }
  }
}
