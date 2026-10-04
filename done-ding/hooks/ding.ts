// 長任務結束時響一聲：只管主迴圈、夠久、沒被中斷的 turn

export const DEFAULT_MIN_SECONDS = 30

export type Config = { isOn: boolean; minSeconds: number }

export type Finish = { reason: 'answer' | 'aborted' | 'refusal' | 'error'; durationMs: number; agentId?: string | undefined }

export function shouldDing(f: Finish, c: Config): boolean {
  return c.isOn && f.agentId === undefined && f.reason !== 'aborted' && f.durationMs >= c.minSeconds * 1000
}

export const soundFor = (reason: Finish['reason']): string =>
  `/System/Library/Sounds/${reason === 'answer' ? 'Glass' : 'Basso'}.aiff`

export function messageFor(f: Finish): string {
  const s = Math.round(f.durationMs / 1000)
  return f.reason === 'answer' ? `做完了（${s} 秒）` : `出問題了（${s} 秒）`
}

export type Parsed =
  | { kind: 'status' }
  | { kind: 'toggle'; isOn: boolean }
  | { kind: 'seconds'; seconds: number }
  | { kind: 'invalid' }

/** `/ding`、`/ding on`、`/ding off`、`/ding 60` */
export function parseArgs(args: string): Parsed {
  const a = args.trim().toLowerCase()
  if (a === '') return { kind: 'status' }
  if (a === 'on') return { kind: 'toggle', isOn: true }
  if (a === 'off') return { kind: 'toggle', isOn: false }
  if (/^\d+$/.test(a)) {
    const seconds = Number(a)
    if (seconds >= 1 && seconds <= 86_400) return { kind: 'seconds', seconds }
  }
  return { kind: 'invalid' }
}

export const describe = (c: Config): string =>
  `done-ding：${c.isOn ? '開' : '關'}，門檻 ${c.minSeconds} 秒（/ding on｜off｜<秒>）`
