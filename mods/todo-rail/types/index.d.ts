/** id 只有 TaskCreate 建的才有；TodoWrite 每次整份重寫，不需要 */
export type Todo = { id?: string; content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }

declare module 'claude-code' {
  interface PluginState {
    'todo-rail': { todos: Todo[] }
  }
}
