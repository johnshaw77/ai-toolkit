export type CleanViewTaskStatus = 'done' | 'active' | 'upcoming'

export type CleanViewTask = {
  id: string
  name: string
  status: CleanViewTaskStatus
  percent: number
  hasReported: boolean
}

export type CleanViewPhase =
  | 'idle'
  | 'working'
  | 'needs-you'
  | 'stuck'
  | 'stopped'
  | 'done'

export type CleanViewChecklist = {
  jobId: string
  title: string
  phase: CleanViewPhase
  tasks: CleanViewTask[]
  needsYouReason: string | null
  stuckReason: string | null
  startedAt: number | null
  finishedAt: number | null
  isCollapsed: boolean
  hasPlan: boolean
}

// ---------- Agent Dock ----------

export type DockCardStatus = 'queued' | 'working' | 'done' | 'stuck' | 'stopped'

export type DockCard = {
  /** Agent 呼叫的 tool_use_id */
  id: string
  name: string
  agentId: string | null
  status: DockCardStatus
  percent: number
  hasReported: boolean
  startedAt: number | null
  finishedAt: number | null
}

export type DockJobPhase = 'live' | 'done' | 'stopped'

export type DockJob = {
  id: string
  name: string
  /** 這個請求開始時的團隊人數 */
  size: number
  phase: DockJobPhase
  startedAt: number
  finishedAt: number | null
  /** 已放行的 Agent 呼叫數（上限的依據） */
  launched: number
  hasNudged: boolean
  /** 主對話這一輪已結束、也沒有等著補送的提醒 */
  isMainIdle: boolean
  cards: DockCard[]
}

export type DockHelperModel = 'fast' | 'same'

export type DockState = {
  teamSize: number
  /** 超過 20 人、等你按確認的人數 */
  pendingSize: number | null
  isCustomOpen: boolean
  helperModel: DockHelperModel
  /** 一次能同時跑幾位（兩個引擎上限取小的） */
  atATime: number
  job: DockJob | null
}

declare module 'claude-code' {
  interface PluginState {
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: CleanViewChecklist
      tick: number
      dock: DockState
      dockTick: number
    }
  }
}
