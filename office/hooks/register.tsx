import type { EngineInterface, Register } from 'claude-code'

import { makeScene, render, toCells } from './scene'
import type { Scene } from './scene'
import { renderSea } from './sea'
import type { SeaMode } from './sea'
import { EMPTY_GATE, EMPTY_TODOS, reduceGate, reduceTodos, todoList } from './hud'
import type { SeaData } from './hud'

const FRAME_MS = 100
const STORM_MS = 8_000 // 出錯後暴風雨持續多久
const USAGE_MS = 30_000 // 額度與 context 多久重抓一次

const OFFICE = { id: 'office', key: 'room', title: '辦公室', columns: 60 }
const SEA = { id: 'sea', key: 'sea', title: '海上冒險', columns: 60 }

type Size = { w: number; h: number }
type Pane = typeof OFFICE

/** 開或關一個 pane，回傳給指令的文字 */
async function toggle($: EngineInterface, pane: Pane): Promise<{ text: string }> {
  const isOpen = (await $.ui.panes()).some(p => p.id === pane.id)
  if (isOpen) {
    await $.ui.close({ id: pane.id })
    return { text: `${pane.title}收起來了。` }
  }
  await $.ui.open({ id: pane.id, title: pane.title, columns: pane.columns })
  return { text: `${pane.title}打開了。` }
}


type Meters = Pick<SeaData, 'ctx' | 'usage' | 'weekly'>

/** context 與 5 小時、7 天額度的百分比 */
async function readMeters($: EngineInterface): Promise<Meters> {
  const u = await $.session.usage()
  const pct = (kind: string) => u.rateLimits.find(r => r.kind === kind)?.percentUsed ?? null
  return { ctx: u.context.percent ?? null, usage: pct('five_hour'), weekly: pct('seven_day') }
}

export const register: Register = on => {
  // 目前畫上去的尺寸；blit 必須跟掛載時一樣大
  let office: Scene | undefined
  let sea: Size | undefined
  let isWorking = false
  let stormUntil = 0

  const seaMode = (ms: number): SeaMode => (ms < stormUntil ? 'storm' : isWorking ? 'sail' : 'dock')

  // 海上 HUD 的資料：context／額度來自 $.session.usage()，燈號與待辦自己從工具呼叫算
  let meters: Meters = { ctx: null, usage: null, weekly: null }
  let gate = EMPTY_GATE
  let todos = EMPTY_TODOS
  const seaData = (): SeaData => ({ ...meters, gate, todos: todoList(todos) })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'office', description: '開關像素辦公室 pane' })
    await $.command.register({ name: 'sea', description: '開關海上冒險 pane' })
    void $.ui.open({ id: OFFICE.id, title: OFFICE.title, columns: OFFICE.columns })
    void $.ui.open({ id: SEA.id, title: SEA.title, columns: SEA.columns })

    $.clock.every(FRAME_MS, () => {
      void $.clock.now().then(ms => {
        const o = office
        if (o !== undefined) {
          void $.ui.blit({ requestId: OFFICE.id, key: OFFICE.key, cells: toCells(render(o, ms, isWorking), o.w, o.h), columns: o.w, rows: o.h / 2 })
        }
        const s = sea
        if (s !== undefined) {
          void $.ui.blit({ requestId: SEA.id, key: SEA.key, cells: toCells(renderSea(s.w, s.h, ms, seaMode(ms), seaData()), s.w, s.h), columns: s.w, rows: s.h / 2 })
        }
      })
    })
    meters = await readMeters($)
    $.clock.every(USAGE_MS, async () => {
      meters = await readMeters($)
    })
    return next(e)
  })

  on('command.run', { command: 'office' }, $ => toggle($, OFFICE))
  on('command.run', { command: 'sea' }, $ => toggle($, SEA))

  // 跟著 Claude：回合進行中＝工作／航行，出錯＝暴風雨
  on('turn.start', ($, e, next) => {
    isWorking = true
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      if (e.reason === 'error') stormUntil = (await $.clock.now()) + STORM_MS
    }
    meters = await readMeters($)
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const failed = ran.deny !== undefined || ran.isError === true
    if (failed) stormUntil = (await $.clock.now()) + STORM_MS
    if (ran.deny === undefined) {
      const input = e as unknown as Record<string, unknown>
      gate = reduceGate(gate, e.tool, input, failed)
      if (!failed) todos = reduceTodos(todos, e.tool, input, ran.result)
    }
    meters = await readMeters($)
    return ran
  })

  // 填滿整個 pane：寬度用 bodyColumns、高度用 pane 可見的列數
  const fit = (bodyColumns: number, bodyRows: number) => {
    const w = Math.max(24, Math.min(200, bodyColumns))
    const rows = Math.max(12, Math.min(100, bodyRows))
    return { w, rows, height: rows * 2 }
  }

  on('ui.render', { component: 'Pane', requestId: 'office' }, async ($, e) => {
    const ui = $.ui.resolve(e)
    if (e.surface !== 'terminal' || !('Raster' in ui)) return <ui.Text dimColor>辦公室只在終端機顯示</ui.Text>
    const { w, rows, height } = fit(e.props.bodyColumns, e.props.scroll.bodyRows)
    if (office === undefined || office.w !== w || office.h !== height) office = makeScene(w, height)
    const ms = await $.clock.now()
    return <ui.Raster key={OFFICE.key} columns={w} rows={rows} cells={toCells(render(office, ms, isWorking), w, height)} />
  })

  on('ui.render', { component: 'Pane', requestId: 'sea' }, async ($, e) => {
    const ui = $.ui.resolve(e)
    if (e.surface !== 'terminal' || !('Raster' in ui)) return <ui.Text dimColor>海上冒險只在終端機顯示</ui.Text>
    const { w, rows, height } = fit(e.props.bodyColumns, e.props.scroll.bodyRows)
    sea = { w, h: height }
    const ms = await $.clock.now()
    return <ui.Raster key={SEA.key} columns={w} rows={rows} cells={toCells(renderSea(w, height, ms, seaMode(ms), seaData()), w, height)} />
  })
}
