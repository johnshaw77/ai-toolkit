// Clean View（簡潔檢視）：Claude 工作時隱藏工具細節，在輸入框上方顯示一張白話進度清單。

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, Timer } from 'claude-code'

import type { CleanViewChecklist, CleanViewTask } from '../types'
import {
  IDLE,
  METER_CELLS,
  REASONS,
  applyPlan,
  applyProgress,
  applyTaskCreate,
  applyTaskUpdate,
  applyTodos,
  apiErrorReason,
  cleanName,
  displayWidth,
  finishTurn,
  fitCells,
  formatDuration,
  isAnimating,
  isJobOpen,
  meter,
  newJob,
  notificationReason,
  truncateCells,
  FALLBACK_NAME,
} from './checklist'
import { DOCK_COLUMNS, DOCK_PANE, DOCK_TITLE, NUDGE_PREFIX, TOO_NARROW } from './dock-logic'

type Engine = EngineInterface

const enabled = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklist = atom({ plugin: 'clean-view', key: 'checklist' } as const, IDLE)
const tick = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)

const STORE_KEY = 'cleanViewEnabled'
const PLAN_TOOL = 'mcp__clean-view__plan_steps'
const PROGRESS_TOOL = 'mcp__clean-view__report_progress'
const ALWAYS_ALLOWED = new Set([
  'ToolSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion', PLAN_TOOL, PROGRESS_TOOL,
])
const REJECTED = /doesn't want to proceed|tool use was rejected|user rejected|denied by the user/i
const COLLAPSE_AFTER_MS = 5000
const FRAME_MS = 250

const GATE_MESSAGE =
  `Clean View: call ${PLAN_TOOL} first to lay out the steps of this job ` +
  '(2 to 8 short names in plain Traditional Chinese), then continue. ' +
  `If it is deferred, load it with ToolSearch (query "select:${PLAN_TOOL},${PROGRESS_TOOL}").`

const GUIDE = [
  '# Clean View progress checklist',
  'The person is using Clean View: tool calls, diffs and command output are hidden from them, and a checklist above the prompt shows your plan and progress instead. Keep it accurate.',
  `- For every request, even a quick question, call \`${PLAN_TOOL}\` first with 2 to 8 short steps in order. If it is deferred, load it with ToolSearch first (query "select:${PLAN_TOOL},${PROGRESS_TOOL}"). Other tools are refused until a plan exists.`,
  '- Write every step name in plain Traditional Chinese (Taiwan) that a non-technical person understands. Start it with a verb and keep it under 20 characters, like 「建立價格區塊」.',
  '- Never put file paths, file names, commands, code or tool names in a step name.',
  `- Call \`${PROGRESS_TOOL}\` with the step's exact name and a percent as real progress happens, and with 100 the moment a step finishes.`,
  '- If this session has TodoWrite or TaskCreate, you may use your to-do list as the plan instead; its items follow the same naming rules.',
].join('\n')

// 這些只活在這一次載入：hot reload 會清掉計時器，session.start 會再接回來。
let ticker: Timer | null = null
let collapseTimer: Timer | null = null
let failStreak = 0
let wasRejected = false
let apiError: { kind?: string; details?: string } | null = null

function syncTicker($: Engine, c: CleanViewChecklist): void {
  if (isAnimating(c) && ticker === null) {
    ticker = $.clock.every(FRAME_MS, () => void update($, tick, n => n + 1))
  } else if (!isAnimating(c) && ticker !== null) {
    ticker.cancel()
    ticker = null
  }
}

async function change($: Engine, fn: (c: CleanViewChecklist) => CleanViewChecklist): Promise<CleanViewChecklist> {
  const c = await update($, checklist, fn)
  syncTicker($, c)
  return c
}

async function setEnabled($: Engine, value: boolean): Promise<void> {
  await update($, enabled, () => value)
  await $.store.set(STORE_KEY, value)
}

async function nameJob($: Engine, jobId: string, request: string): Promise<void> {
  const reply = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 60,
    prompt:
      '替下面這個請求取一個工作名稱：4 到 12 個繁體中文字（台灣用語），以動詞開頭，' +
      '不要包含檔名、路徑、指令或程式碼。只回覆名稱本身，不要標點符號或引號。\n\n請求：\n' +
      request.slice(0, 2000),
  })
  if (!reply.isAnswered) return
  const line = reply.text.split('\n').find(l => l.trim() !== '') ?? ''
  const title = cleanName(line.replace(/^["'「『]+|["'」』。.]+$/g, ''))
  if (title === FALLBACK_NAME) return
  // 比較新的工作開始了，就不理這個答案
  await update($, checklist, c => (c.jobId === jobId ? { ...c, title } : c))
}

function inputOf(e: unknown): Record<string, unknown> {
  return e as Record<string, unknown>
}

function taskIdFrom(result: unknown, text: string | undefined): string | undefined {
  const r = result as { task?: { id?: unknown } } | undefined
  const id = r?.task?.id
  if (typeof id === 'string' || typeof id === 'number') return String(id)
  return text?.match(/#(\d+)/)?.[1]
}

export function registerCleanView(on: On): void {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get(STORE_KEY)
    if (typeof stored === 'boolean') await update($, enabled, () => stored)

    await $.tool.register({
      name: 'plan_steps',
      description:
        'Lay out every step of the current job up front, 2 to 8 short names in order. ' +
        'Each name is plain Traditional Chinese a non-technical person understands, starts with a verb, ' +
        'and holds no file paths, file names, commands, code or tool names. The first step starts right away.',
      inputSchema: {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 },
        },
        required: ['steps'],
      },
    })
    await $.tool.register({
      name: 'report_progress',
      description:
        'Report progress on the current step by its exact name. Reporting a planned step checks off every step before it; ' +
        'percent 100 checks it off and starts the next one. A name not in the plan becomes a new step.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          percent: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['task', 'percent'],
      },
    })
    await $.command.register({
      name: 'simple',
      description: '簡潔檢視：/simple on 開啟、/simple off 關閉，不加參數就切換',
      argumentHint: 'on|off',
    })

    syncTicker($, await read($, checklist))
    return next(e)
  })

  // ---------- 開關 ----------

  on('command.run', { command: 'simple' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const current = await read($, enabled)
    const wanted = arg === 'on' ? true : arg === 'off' ? false : arg === '' ? !current : null
    if (wanted === null) return { text: '用法：/simple on、/simple off，或只輸入 /simple 切換' }
    await setEnabled($, wanted)
    return {
      text: wanted
        ? '簡潔檢視：開。工具細節會隱藏，進度清單顯示在輸入框上方。'
        : '簡潔檢視：關。所有細節都會顯示。',
    }
  })

  // ---------- 系統提示 ----------

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, enabled))) return composed
    return {
      ...composed,
      sections: [...composed.sections, { id: 'clean-view:checklist', text: GUIDE, scope: 'session' as const }],
    }
  })

  // ---------- 一輪的開始與結束 ----------

  on('turn.start', async ($, e, next) => {
    const text = e.text.trim()
    // 斜線指令、helper 完成通知（<task-notification>）和 Agent Dock 補送的提醒都不算新工作
    const isRealPrompt =
      text !== '' && !text.startsWith('/') && !text.startsWith('<') && !text.includes('<command-name>') &&
      !text.startsWith(NUDGE_PREFIX)
    if (isRealPrompt && (await read($, enabled))) {
      const c = await read($, checklist)
      wasRejected = false
      apiError = null
      failStreak = 0
      if (c.phase === 'needs-you' && c.hasPlan) {
        // Claude 在等你回覆，你回了：同一份工作繼續
        await change($, cur => ({ ...cur, phase: 'working', needsYouReason: null }))
      } else if (c.phase !== 'working') {
        collapseTimer?.cancel()
        collapseTimer = null
        const now = await $.clock.now()
        const jobId = e.turnId
        await change($, () => newJob(jobId, now))
        // 取名失敗就沿用預設標題，不影響清單
        $.clock.after(0, () => void nameJob($, jobId, text).catch(() => undefined))
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    const c = await change($, cur =>
      finishTurn(cur, { reason: e.reason, answer: e.answer, wasRejected, apiError, now }),
    )
    if (c.phase === 'done') {
      collapseTimer?.cancel()
      const jobId = c.jobId
      collapseTimer = $.clock.after(COLLAPSE_AFTER_MS, () =>
        void update($, checklist, cur =>
          cur.jobId === jobId && cur.phase === 'done' ? { ...cur, isCollapsed: true } : cur,
        ),
      )
    }
    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    // 跟 turn.complete 誰先到不一定：先到就先顯示，後到就補上更準的原因
    const error = { kind: e.error, details: e.error_details }
    apiError = error
    const now = await $.clock.now()
    await change($, c =>
      isJobOpen(c)
        ? {
            ...c,
            phase: 'stuck',
            stuckReason: apiErrorReason(error.kind, error.details),
            needsYouReason: null,
            finishedAt: c.finishedAt ?? now,
          }
        : c,
    )
    return next(e)
  })

  // ---------- 需要你 ----------

  on('classic.Notification', async ($, e, next) => {
    const reason = notificationReason(e.notification_type, e.message)
    if (reason !== null) {
      await change($, c =>
        c.phase === 'working' || c.phase === 'stuck' ? { ...c, phase: 'needs-you', needsYouReason: reason } : c,
      )
    }
    return next(e)
  })

  // ---------- 工具：計畫閘門與追蹤 ----------

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const tool = String(e.tool)
    const before = await read($, checklist)

    if (isJobOpen(before) && !before.hasPlan && !ALWAYS_ALLOWED.has(tool) && (await read($, enabled))) {
      return { deny: GATE_MESSAGE }
    }

    if (before.phase === 'needs-you') {
      await change($, c => (c.phase === 'needs-you' ? { ...c, phase: 'working', needsYouReason: null } : c))
    }
    if (tool === 'AskUserQuestion' && isJobOpen(before)) {
      await change($, c => ({ ...c, phase: 'needs-you', needsYouReason: REASONS.question }))
    }

    const ran = await next(e)

    if (ran.deny !== undefined) return ran
    if (ran.isError === true) {
      if (REJECTED.test(ran.text ?? '')) {
        wasRejected = true
        failStreak = 0
        await change($, c => (isJobOpen(c) ? { ...c, phase: 'stuck', stuckReason: REASONS.rejected } : c))
      } else {
        failStreak += 1
        if (failStreak >= 3) {
          await change($, c => (isJobOpen(c) ? { ...c, phase: 'stuck', stuckReason: REASONS.failing } : c))
        }
      }
      return ran
    }

    failStreak = 0
    await change($, c =>
      c.phase === 'stuck' || c.phase === 'needs-you'
        ? { ...c, phase: 'working', stuckReason: null, needsYouReason: null }
        : c,
    )

    if (isJobOpen(before) || before.phase === 'working') {
      const input = inputOf(e)
      if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
        const todos = input.todos as { content?: unknown; status?: unknown }[]
        await change($, c => applyTodos(c, todos))
      } else if (tool === 'TaskCreate') {
        const id = taskIdFrom(ran.result, ran.text)
        if (id !== undefined) await change($, c => applyTaskCreate(c, id, input.subject))
      } else if (tool === 'TaskUpdate' && input.taskId !== undefined) {
        const id = String(input.taskId)
        await change($, c => applyTaskUpdate(c, id, { subject: input.subject, status: input.status }))
      }
    }
    return ran
  })

  on('tool.call', { tool: PLAN_TOOL }, async ($, e) => {
    const raw = inputOf(e).steps
    const steps = Array.isArray(raw) ? raw.filter(s => typeof s === 'string') : []
    if (steps.length === 0) return { result: 'Please list 2 to 8 short steps.' }
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await change($, c => applyPlan(isJobOpen(c) ? c : newJob(e.tool_use_id ?? `job-${now}`, now), steps))
    }
    const count = Math.min(steps.length, 8)
    return { result: `Planned ${count} steps. The first one has started.` }
  })

  on('tool.call', { tool: PROGRESS_TOOL }, async ($, e) => {
    const input = inputOf(e)
    const percent = Math.min(100, Math.max(0, Math.round(Number(input.percent)) || 0))
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await change($, c =>
        applyProgress(isJobOpen(c) ? c : newJob(e.tool_use_id ?? `job-${now}`, now), input.task, percent),
      )
    }
    return { result: `Progress noted: ${percent}%.` }
  })

  // ---------- 隱藏技術列 ----------

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, enabled))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await read($, enabled))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, enabled))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!(await read($, enabled))) return next(e)
    return next({ ...e, props: { ...e.props, hint: '' } })
  })

  // ---------- 輸入框上方的清單 ----------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const isOn = await read($, enabled)
    const c = await read($, checklist)
    const frame = await read($, tick)
    const now = await $.clock.now()
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns)

    const label = isOn ? '● 簡潔檢視：開' : '○ 簡潔檢視：關'
    const toggle = (
      <Button
        key="clean-view-toggle"
        label={label}
        onPress={async () => {
          const value = !(await read($, enabled))
          await setEnabled($, value)
          $.ui.toast(value ? '簡潔檢視已開啟，技術細節會隱藏' : '簡潔檢視已關閉，所有細節都會顯示')
        }}
      />
    )
    // 沒有 Tools 選單，Agent Dock 的入口放在這一列：按下去才開，窄視窗也放得下
    const dockButton = (
      <Button
        key="agent-dock-open"
        label="◆ Dock"
        onPress={async () => {
          const opened = await $.ui.open({ id: DOCK_PANE, title: DOCK_TITLE, columns: DOCK_COLUMNS })
          if (!opened.isPlaced) $.ui.toast(TOO_NARROW)
        }}
      />
    )
    const buttons = (
      <Box flexDirection="row" gap={1}>
        {dockButton}
        {toggle}
      </Box>
    )
    const room = Math.max(4, width - (displayWidth(label) + 4) - (displayWidth('◆ Dock') + 4) - 2)

    if (!isOn || c.phase === 'idle') {
      return (
        <Box flexDirection="row" justifyContent="flex-end" width={width}>
          {buttons}
        </Box>
      )
    }

    const title = c.title || '處理你的請求'
    const elapsed = formatDuration((c.finishedAt ?? now) - (c.startedAt ?? now))
    const headerRow = (left: RenderElement) => (
      <Box flexDirection="row" justifyContent="space-between" width={width}>
        <Box flexShrink={1}>{left}</Box>
        {buttons}
      </Box>
    )

    let header: RenderElement
    if (c.phase === 'needs-you') {
      const reason = truncateCells(c.needsYouReason ?? REASONS.waitingReply, Math.max(2, room - 9))
      header = (
        <Text>
          <Text backgroundColor="warning" color="inverseText" bold>
            {' 需要你 '}
          </Text>
          <Text> {reason}</Text>
        </Text>
      )
    } else if (c.phase === 'stuck') {
      header = <Text color="warning">{truncateCells(`⚠ 卡住了：${c.stuckReason ?? ''}`, room)}</Text>
    } else if (c.phase === 'stopped') {
      header = <Text>{truncateCells(`■ 已停止 · ${title} · 你按了 Esc`, room)}</Text>
    } else if (c.phase === 'done') {
      header = <Text color="success">{truncateCells(`✓ 全部完成 · ${title} · 花了 ${elapsed}`, room)}</Text>
    } else {
      header = (
        <Text>
          <Text bold>{truncateCells(title, Math.max(2, room - displayWidth(elapsed) - 3))}</Text>
          <Text dimColor> · {elapsed}</Text>
        </Text>
      )
    }

    if (c.phase === 'done' && c.isCollapsed) return headerRow(header)

    const nameCells = Math.max(4, width - 2 - 1 - METER_CELLS - 1 - 6)
    const firstUpcoming = c.tasks.findIndex(t => t.status === 'upcoming')
    const row = (task: CleanViewTask, i: number) => {
      const name = fitCells(task.name, nameCells)
      const bar = meter(task, frame)
      if (task.status === 'done') {
        return (
          <Box flexDirection="row" key={task.id}>
            <Text color="success">✓ </Text>
            <Text dimColor>{name}</Text>
            <Text color="success"> {bar} </Text>
            <Text dimColor>完成</Text>
          </Box>
        )
      }
      if (task.status === 'active') {
        const glyph = c.phase === 'needs-you' ? '‖ ' : '▶ '
        const status = task.hasReported ? `${task.percent}%` : '進行中'
        return (
          <Box flexDirection="row" key={task.id}>
            <Text color="claude">{glyph}</Text>
            <Text bold>{name}</Text>
            <Text color="claude"> {bar} </Text>
            <Text>{status}</Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="row" key={task.id}>
          <Text dimColor>○ </Text>
          <Text dimColor>{name}</Text>
          <Text dimColor> {bar} </Text>
          <Text dimColor>{i === firstUpcoming ? '下一步' : '稍後'}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width={width}>
        {headerRow(header)}
        {c.tasks.map(row)}
      </Box>
    )
  })
}
