// 主角現在該是哪個狀態

import type { State } from './dev'

export const DONE_MS = 4_000
export const ERROR_MS = 8_000

export type Track = { isWorking: boolean; workAt: number; doneAt?: number | undefined; errorAt?: number | undefined }

export function moodOf(t: Track, now: number): State {
  if (t.errorAt !== undefined && now - t.errorAt < ERROR_MS) return { mood: 'error', since: now - t.errorAt }
  if (t.isWorking) return { mood: 'work', since: now - t.workAt }
  if (t.doneAt !== undefined && now - t.doneAt < DONE_MS) return { mood: 'done', since: now - t.doneAt }
  return { mood: 'idle', since: now }
}
