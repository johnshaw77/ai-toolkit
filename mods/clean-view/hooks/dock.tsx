// Agent Dock：把每個請求拆給固定人數的 helper 平行處理，面板上每位 helper 一張卡片。
// 所有 `$` 呼叫都在這個檔案；純邏輯在 dock-logic.ts。

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement, Timer } from 'claude-code'

import type { DockCard, DockJob, DockState } from '../types'
import { clampPercent, displayWidth, fitCells } from './checklist'
import {
  BIG_TEAM,
  COLORS,
  DOCK_COLUMNS,
  DOCK_PANE,
  DOCK_TITLE,
  HELPER_PLAN_ANSWER,
  SEAT_LIMIT,
  SIZE_PRESETS,
  STOPPED_BEFORE_START,
  TOO_NARROW,
  addQueuedCards,
  atATime,
  attachAgent,
  badge,
  badgeColor,
  capMessage,
  cardLayout,
  cardMeter,
  chunk,
  clock,
  counts,
  dropCard,
  finishByAgent,
  finishCard,
  gradient,
  helperProgress,
  infoLine,
  initials,
  instruction,
  modelLabel,
  newDockJob,
  nudgeText,
  overallPercent,
  parseDockArgs,
  parseSize,
  restoreSize,
  settleJob,
  startCard,
  stopJob,
  summary,
} from './dock-logic'

type Engine = EngineInterface

const INITIAL: DockState = {
  teamSize: 1,
  pendingSize: null,
  isCustomOpen: false,
  helperModel: 'fast',
  atATime: 10,
  job: null,
}

const dock = atom({ plugin: 'clean-view', key: 'dock' } as const, INITIAL)
const dockTick = atom({ plugin: 'clean-view', key: 'dockTick' } as const, 0)

const STORE_SIZE = 'dock.teamSize'
const STORE_MODEL = 'panel.helperModel'
const PROGRESS_TOOL = 'mcp__clean-view__report_progress'
const PLAN_TOOL = 'mcp__clean-view__plan_steps'
const FRAME_MS = 500

// 只活在這一次載入：hot reload 時 session.start 會重新設定
let ticker: Timer | null = null
let agentsFile: string | null = null
let lastWritten = ''
let lastStatus: string | undefined = undefined

// ---------- 共用 ----------

async function isDockOpen($: Engine): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === DOCK_PANE)
}

/** 收起時在狀態列放徽章；把即時人數寫給狀態列讀。 */
async function syncOutside($: Engine, s: DockState): Promise<void> {
  const text = (await isDockOpen($)) ? undefined : badge(s.job, s.teamSize)
  if (text !== lastStatus) {
    lastStatus = text
    $.ui.status(text)
  }
  if (agentsFile === null) return
  const c = counts(s.job)
  const live = s.job?.phase === 'live'
  const body = JSON.stringify({
    agents: live ? c.working : 0,
    working: live ? c.working : 0,
    queued: live ? c.queued : 0,
    done: c.done,
    stuck: c.stuck,
    teamSize: s.teamSize,
  })
  if (body === lastWritten) return
  lastWritten = body
  await $.fs.write(agentsFile, `${body.slice(0, -1)},"updatedAt":${Date.now()}}\n`)
}

async function change($: Engine, fn: (s: DockState) => DockState): Promise<DockState> {
  const s = await update($, dock, fn)
  const isLive = s.job?.phase === 'live'
  if (isLive && ticker === null) {
    ticker = $.clock.every(FRAME_MS, () => void update($, dockTick, n => n + 1))
  } else if (!isLive && ticker !== null) {
    ticker.cancel()
    ticker = null
  }
  await syncOutside($, s)
  return s
}

async function changeJob($: Engine, fn: (job: DockJob) => DockJob): Promise<DockState> {
  const now = await $.clock.now()
  return change($, s => (s.job === null ? s : { ...s, job: settleJob(fn(s.job), now) }))
}

async function setSize($: Engine, n: number): Promise<void> {
  await change($, s => ({ ...s, teamSize: n, pendingSize: null, isCustomOpen: false }))
  await $.store.set(STORE_SIZE, n)
}

/** 由指令或按鈕觸發才開，這樣窄視窗也放得下。 */
function openDock($: Engine): void {
  void (async () => {
    try {
      const opened = await $.ui.open({ id: DOCK_PANE, title: DOCK_TITLE, columns: DOCK_COLUMNS })
      if (!opened.isPlaced) $.ui.toast(TOO_NARROW)
      await syncOutside($, await read($, dock))
    } catch {
      $.ui.toast(TOO_NARROW)
    }
  })()
}

function chooseSize($: Engine, n: number): Promise<void> {
  return n > BIG_TEAM
    ? change($, s => ({ ...s, pendingSize: n, isCustomOpen: false })).then(() => undefined)
    : setSize($, n)
}

type Block = { type?: unknown; id?: unknown; name?: unknown; input?: { description?: unknown } }

function agentCalls(content: unknown): { id: string; description: unknown }[] {
  if (!Array.isArray(content)) return []
  return (content as Block[])
    .filter(b => b.type === 'tool_use' && b.name === 'Agent' && typeof b.id === 'string')
    .map(b => ({ id: String(b.id), description: b.input?.description }))
}

export function registerDock(on: On): void {
  on('session.start', { cwd: /^/ }, async ($, e, next) => {
    const saved = await $.store.get(STORE_SIZE)
    const size = restoreSize(saved)
    if (saved !== size && saved !== undefined) await $.store.set(STORE_SIZE, size)
    const model = (await $.store.get(STORE_MODEL)) === 'same' ? 'same' : 'fast'
    const perWave = atATime(
      await $.env.get('CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS'),
      await $.env.get('CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY'),
    )
    const home = await $.env.get('HOME')
    const sessionId = await $.session.id()
    agentsFile = home ? `${home}/.claude/ai-employee-kit-data/agents-now/${sessionId}.json` : null
    lastWritten = ''
    lastStatus = undefined

    await $.command.register({
      name: 'dock',
      description: 'Agent Dock：/dock 開關面板，/dock 10 設定團隊人數',
      argumentHint: '[1-100]',
    })
    await change($, s => ({ ...s, teamSize: s.job?.phase === 'live' ? s.teamSize : size, helperModel: model, atATime: perWave }))
    return next(e)
  })

  // ---------- /dock ----------

  on('command.run', { command: 'dock' }, ($, e) => {
    try {
      const arg = e.args.trim()
      if (arg === '') {
        void (async () => {
          try {
            if (await isDockOpen($)) {
              await $.ui.close({ id: DOCK_PANE })
              await syncOutside($, await read($, dock))
            } else {
              openDock($)
            }
          } catch {
            $.ui.toast(TOO_NARROW)
          }
        })()
        return { text: '切換 Agent Dock。' }
      }
      const { size: n, ask } = parseDockArgs(arg)
      if (n === null) return { text: '團隊人數是 1 到 100 的整數，例如 /dock 10 或 /dock 3 你的問題。' }
      const willAsk = ask !== '' && n <= BIG_TEAM
      void (async () => {
        try {
          await chooseSize($, n)
        } finally {
          openDock($)
        }
        if (willAsk) {
          // 外掛自己送出的 prompt 不經過自己的 prompt.submit hook，也不能帶 context：
          // 工作在這裡開好，拆工指示先插成一列只有模型看得到的 user 列，再把問題當成你的話送出
          const now = await $.clock.now()
          await change($, st => ({ ...st, job: newDockJob(`job-${now}`, ask, n, now) }))
          if (n > 1) {
            try {
              await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: instruction(n) }] } })
            } catch {
              $.ui.toast('沒能附上拆工指示，這次由 Claude 自己決定要不要拆')
            }
          }
          await $.prompt.submit({ text: ask, asUser: true })
        }
      })()
      if (n > BIG_TEAM) {
        return { text: `請在 Agent Dock 確認 ${n} 位的團隊${ask === '' ? '' : '，確認後再送出問題'}。` }
      }
      return { text: willAsk ? `團隊人數設為 ${n}，送出：${ask}` : `團隊人數設為 ${n}。` }
    } catch {
      return { text: 'Agent Dock 暫時出了點問題，請再試一次。' }
    }
  })

  on('ui.close', { id: 'agent-dock' }, async ($, e, next) => {
    const closed = await next(e)
    lastStatus = undefined
    await syncOutside($, await read($, dock))
    return closed
  })

  // ---------- 請求進來：開一份新工作，告訴 Claude 拆成 N 份 ----------

  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    const kind = e.origin.kind
    const isPerson = kind !== 'plugin' && kind !== 'task-notification'
    if (!isPerson || text === '' || text.startsWith('/') || text.startsWith('<')) return next(e)
    const s = await read($, dock)
    if (e.turnId !== undefined && s.job?.phase === 'live') return next(e)
    const now = await $.clock.now()
    await change($, st => ({ ...st, job: newDockJob(`job-${now}`, text, st.teamSize, now) }))
    if (s.teamSize <= 1) return next(e)
    return next({ ...e, context: [...(e.context ?? []), instruction(s.teamSize)] })
  })

  // Claude 一寫出 Agent 呼叫，卡片就先排隊出現
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.door === 'response' && e.agentId === undefined) {
      const calls = agentCalls(e.message.content)
      if (calls.length > 0) await changeJob($, job => (job.phase === 'live' ? addQueuedCards(job, calls) : job))
    }
    return stored
  })

  // ---------- Agent 呼叫：上限、排隊、模型、卡片狀態 ----------

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const id = e.tool_use_id
    const first = await read($, dock)
    if (first.job === null || first.job.phase !== 'live') return next(e)

    let admitted = false
    let capped = 0
    await change($, s => {
      const job = s.job
      if (job === null || job.phase !== 'live') return s
      admitted = job.size <= 1 || job.launched < job.size
      capped = job.size
      return admitted ? { ...s, job: { ...job, launched: job.launched + 1 } } : { ...s, job: dropCard(job, id) }
    })
    if (!admitted) return { deny: capMessage(capped) }
    // session.append 沒接到的話，這裡也會補上一張排隊卡片
    await changeJob($, job => addQueuedCards(job, [{ id, description: e.description }]))

    // 超過引擎同時上限的呼叫，由 Dock 自己排隊等空位
    for (;;) {
      let claimed = false
      let isOver = false
      const now = await $.clock.now()
      await change($, s => {
        const job = s.job
        if (job === null || job.phase !== 'live') {
          isOver = true
          return s
        }
        claimed = counts(job).working < s.atATime
        if (!claimed) return s
        return { ...s, job: startCard(job, id, e.description, now) }
      })
      if (claimed) break
      if (isOver || next.signal.aborted) {
        const stoppedAt = await $.clock.now()
        await changeJob($, job => finishCard(addQueuedCards(job, [{ id, description: e.description }]), id, 'stopped', stoppedAt))
        return { deny: STOPPED_BEFORE_START }
      }
      await $.process.run(['/bin/sleep', '1'])
    }

    const s = await read($, dock)
    const useHaiku = s.helperModel === 'fast' && (s.job?.size ?? 1) > 1 && e.model === undefined
    const ran = await next(useHaiku ? { ...e, model: 'haiku' as const } : e)
    const now = await $.clock.now()

    if (ran.deny !== undefined) {
      // 別的閘門擋下（例如 Clean View 要先列計畫）：這張卡不算
      await changeJob($, job => ({ ...dropCard(job, id), launched: Math.max(0, job.launched - 1) }))
    } else if (ran.isError === true) {
      await changeJob($, job => finishCard(job, id, 'stuck', now))
    } else {
      const result = ran.result as { status?: unknown; agentId?: unknown } | undefined
      const agentId = typeof result?.agentId === 'string' ? result.agentId : null
      await changeJob($, job => {
        const linked = agentId === null ? job : attachAgent(job, id, agentId)
        return result?.status === 'completed' ? finishCard(linked, id, 'done', now) : linked
      })
    }
    return ran
  })

  // ---------- helper 回報進度 ----------

  on('tool.call', { tool: PROGRESS_TOOL, agentId: /./ }, async ($, e) => {
    const input = e as Record<string, unknown>
    const percent = clampPercent(input.percent)
    const agentId = e.agentId ?? ''
    await changeJob($, job => helperProgress(job, agentId, input.task, percent))
    return { result: `Progress noted: ${percent}%.` }
  })

  on('tool.call', { tool: PLAN_TOOL, agentId: /./ }, () => ({ result: HELPER_PLAN_ANSWER }))

  // ---------- 一輪結束：helper 完成、補送提醒、Esc ----------

  on('turn.complete', { reason: /^/ }, async ($, e, next) => {
    const now = await $.clock.now()
    const helperId = e.agentId
    if (helperId !== undefined) {
      const status = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'stuck'
      await changeJob($, job => finishByAgent(job, helperId, status, now))
      return next(e)
    }
    const job = (await read($, dock)).job
    if (job !== null && job.phase === 'live') {
      if (e.reason === 'aborted') {
        await changeJob($, j => stopJob(j, now))
      } else if (job.size > 1 && job.launched > 0 && job.launched < job.size && !job.hasNudged && e.reason === 'answer') {
        // 一位都沒派代表這個請求本來就不適合拆（問答、commit），不提醒
        await changeJob($, j => ({ ...j, hasNudged: true, isMainIdle: false }))
        void $.prompt.submit({ text: nudgeText(job.launched, job.size) })
      } else if (job.cards.length === 0) {
        await change($, s => ({ ...s, job: null }))
      } else {
        await changeJob($, j => ({ ...j, isMainIdle: true }))
      }
    }
    return next(e)
  })

  // ---------- 面板 ----------

  on('ui.render', { component: 'Pane', requestId: 'agent-dock' }, async ($, e) => {
    const s = await read($, dock)
    const tick = await read($, dockTick)
    const now = await $.clock.now()
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Input = 'Input' in table ? table.Input : undefined
    const width = Math.max(30, e.props.bodyColumns)
    const job = s.job
    const live = job?.phase === 'live'

    // 標題：字標由珊瑚漸層到金
    const mark = '◆  A G E N T   D O C K'
    const markColors = gradient(COLORS.coral, COLORS.gold, [...mark].length)
    const statusMark = live
      ? <Text color={tick % 4 < 2 ? COLORS.live : '#1F7A55'} bold>● 進 行 中</Text>
      : job?.phase === 'done'
        ? <Text color={COLORS.gold} bold>完 成</Text>
        : job?.phase === 'stopped'
          ? <Text color={COLORS.muted}>已 停 止</Text>
          : <Text color={COLORS.muted}>待 命</Text>
    const masthead = (
      <Box flexDirection="row" justifyContent="space-between" width={width}>
        <Text bold>{[...mark].map((ch, i) => <Text color={markColors[i]}>{ch}</Text>)}</Text>
        {statusMark}
      </Box>
    )
    const rule = <Text color={COLORS.hairline}>{'─'.repeat(width)}</Text>

    // 團隊人數：分段選擇
    const chip = (label: string) => (
      <Text color={COLORS.coral} inverse bold>{` ${label} `}</Text>
    )
    const sizeRow = (
      <Box flexDirection="row" flexWrap="wrap">
        <Text color={COLORS.muted}>團 隊 人 數   ╭</Text>
        {SIZE_PRESETS.map(n =>
          n === s.teamSize && s.pendingSize === null ? (
            chip(String(n))
          ) : (
            <Button key={`size-${n}`} plain label={` ${n} `} onPress={() => void chooseSize($, n)} />
          ),
        )}
        <Text color={COLORS.muted}>│</Text>
        {SIZE_PRESETS.includes(s.teamSize as (typeof SIZE_PRESETS)[number]) ? (
          <Button
            key="size-custom"
            plain
            label=" 自訂 "
            onPress={() => void change($, st => ({ ...st, isCustomOpen: !st.isCustomOpen }))}
          />
        ) : (
          chip(`自訂 ${s.teamSize}`)
        )}
        <Text color={COLORS.muted}>╮</Text>
      </Box>
    )

    const customBox =
      s.isCustomOpen && Input !== undefined ? (
        <Box flexDirection="row" borderStyle="round" borderColor={COLORS.hairline} paddingX={1} gap={1}>
          <Text>要幾位助手？</Text>
          <Input
            key="custom-size"
            placeholder="1–100"
            autoFocus
            onSubmit={value => {
              const n = parseSize(value)
              if (n === null) {
                $.ui.toast('請輸入 1 到 100 的整數')
                return
              }
              void chooseSize($, n)
            }}
          />
          <Button key="custom-cancel" plain label="取消" onPress={() => void change($, st => ({ ...st, isCustomOpen: false }))} />
        </Box>
      ) : null

    const pending = s.pendingSize
    const bigTeamBox =
      pending !== null ? (
        <Box flexDirection="column" borderStyle="round" borderColor={COLORS.gold} paddingX={1}>
          <Text color={COLORS.gold}>大團隊：這會很快用掉你的方案額度。要繼續嗎？</Text>
          <Box flexDirection="row" gap={2}>
            <Button key="big-continue" variant="primary" label={`以 ${pending} 位繼續`} onPress={() => void setSize($, pending)} />
            <Button key="big-cancel" label="取消" onPress={() => void change($, st => ({ ...st, pendingSize: null }))} />
          </Box>
        </Box>
      ) : null

    const info = <Text color={COLORS.muted}>{infoLine(s.teamSize, s.atATime, s.helperModel)}</Text>
    const modelRow = (
      <Box flexDirection="row">
        <Text color={COLORS.muted}>助手模型  </Text>
        {(['fast', 'same'] as const).map(m =>
          m === s.helperModel ? (
            chip(modelLabel(m))
          ) : (
            <Button
              key={`model-${m}`}
              plain
              label={` ${modelLabel(m)} `}
              onPress={async () => {
                await change($, st => ({ ...st, helperModel: m }))
                await $.store.set(STORE_MODEL, m)
              }}
            />
          ),
        )}
      </Box>
    )

    const controls: RenderElement[] = [masthead, rule, sizeRow]
    if (customBox) controls.push(customBox)
    if (bigTeamBox) controls.push(bigTeamBox)
    controls.push(info, modelRow, <Text> </Text>)

    // 待命：一排座位
    const hasMission = job !== null && (job.cards.length > 0 || job.size > 1)
    if (!hasMission) {
      const seats = Math.min(SEAT_LIMIT, s.teamSize)
      return (
        <Box flexDirection="column" width={width}>
          {controls}
          <Text>
            {Array.from({ length: seats }, (_, i) => (
              <Text color={badgeColor(i)} dimColor={i % 3 === 1}>{'● '}</Text>
            ))}
          </Text>
          <Text bold>{`你的 ${s.teamSize} 人團隊待命中`}</Text>
          <Text color={COLORS.muted}>
            {s.teamSize === 1 ? '送出請求，由 Claude 決定要不要找助手。' : `送出請求，就會拆給 ${s.teamSize} 位助手。`}
          </Text>
        </Box>
      )
    }

    // 任務列
    const c = counts(job)
    const pct = overallPercent(job)
    const elapsed = clock((job.finishedAt ?? now) - job.startedAt)
    const right = `${pct}%   ${elapsed}`
    const nameCells = Math.max(4, width - displayWidth('任 務   ') - displayWidth(right) - 2)
    const mission = (
      <Box flexDirection="row" justifyContent="space-between" width={width}>
        <Text>
          <Text color={COLORS.muted}>任 務   </Text>
          <Text bold>{fitCells(job.name, nameCells)}</Text>
        </Text>
        <Text>{right}</Text>
      </Box>
    )
    const expected = Math.max(job.size > 1 ? job.size : 0, job.cards.length, 1)
    const finished = c.done + c.stuck + c.stopped
    const doneCells = Math.min(width, Math.round((finished / expected) * width))
    const workCells = Math.min(width - doneCells, Math.round((c.working / expected) * width))
    const sweep = gradient(COLORS.coral, COLORS.gold, doneCells)
    const bar = (
      <Text>
        {sweep.map(color => <Text color={color}>━</Text>)}
        {Array.from({ length: workCells }, (_, i) => (
          <Text color={(i + tick) % 6 < 3 ? COLORS.live : '#2BB57C'}>━</Text>
        ))}
        <Text color={COLORS.hairline}>{'─'.repeat(width - doneCells - workCells)}</Text>
      </Text>
    )
    const countLine = (
      <Text>
        <Text color={COLORS.live}>● {c.working} 工作中</Text>
        <Text color={COLORS.muted}>{`    ○ ${c.queued} 排隊    `}</Text>
        <Text color={COLORS.gold}>✓ {c.done} 完成</Text>
        <Text color={c.stuck > 0 ? COLORS.stuck : COLORS.muted}>{`    ✕ ${c.stuck} 卡住`}</Text>
      </Text>
    )
    const doneLine =
      job.phase === 'done' ? (
        <Box borderStyle="round" borderColor={COLORS.live} paddingX={1} width={width}>
          <Text color={COLORS.live}>✓ {summary(job)}</Text>
        </Box>
      ) : null

    // 卡片
    const layout = cardLayout(width, job.cards.length)
    const cardOf = (card: DockCard, index: number) => {
      const isQueued = card.status === 'queued' || card.status === 'stopped'
      const border = card.status === 'stuck' ? COLORS.stuck : COLORS.hairline
      const inner = layout.cellWidth - 2
      const timer = card.startedAt === null ? '' : clock((card.finishedAt ?? now) - card.startedAt)
      const label =
        card.status === 'done' ? '100%' : card.status === 'stuck' ? '卡住' : card.status === 'stopped' ? '停止'
          : card.status === 'queued' ? '排隊' : card.hasReported ? `${card.percent}%` : '進行中'
      const isTile = layout.mode === 'tiles'
      const badgeText = isTile ? initials(card.name, index) : ` ${initials(card.name, index)} `
      const badgeCells = displayWidth(badgeText)
      const nameCells = Math.max(2, inner - badgeCells - 1 - (isTile ? 0 : displayWidth(timer) + 1))
      const meterCells = Math.max(2, inner - (isTile ? 0 : badgeCells + 1) - displayWidth(label) - 1)
      const meterView = cardMeter(card, tick, meterCells).map(seg => (
        <Text color={seg.kind === 'rest' ? COLORS.hairline : seg.kind === 'fill' ? COLORS.gold : COLORS.live}>{seg.text}</Text>
      ))
      return (
        <Box
          key={`card-${card.id}`}
          flexDirection="column"
          borderStyle="round"
          borderColor={border}
          hover={{ borderColor: COLORS.coral }}
          width={layout.cellWidth}
        >
          <Text dimColor={isQueued}>
            <Text color={badgeColor(index)} inverse bold>{badgeText}</Text>
            <Text> {fitCells(card.name, nameCells)}</Text>
            {isTile ? null : <Text color={COLORS.muted}> {timer}</Text>}
          </Text>
          <Text dimColor={isQueued}>
            {isTile ? null : ' '.repeat(badgeCells + 1)}
            {meterView}
            <Text color={card.status === 'stuck' ? COLORS.stuck : undefined}> {label}</Text>
          </Text>
        </Box>
      )
    }
    const rows = chunk(job.cards.map((card, i) => cardOf(card, i)), layout.perRow).map(row => (
      <Box flexDirection="row" gap={1}>{row}</Box>
    ))

    return (
      <Box flexDirection="column" width={width}>
        {controls}
        {mission}
        {bar}
        {countLine}
        {doneLine}
        <Text> </Text>
        {rows}
      </Box>
    )
  })
}
