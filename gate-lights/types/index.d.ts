export type Light = 'idle' | 'pass' | 'fail' | 'stale'

export type Gate = {
  test: Light
  typecheck: Light
  verify: Light
  needsVerify: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'gate-lights': { gate: Gate; isHidden: boolean }
  }
}
