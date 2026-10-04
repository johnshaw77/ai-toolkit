export type Badge = { label: string; color: string }

declare module 'claude-code' {
  interface PluginState {
    'host-badge': { badge: Badge | null }
  }
}
