import type { EngineInterface, Register } from 'claude-code'

import { makeScene, render, toCells } from './scene'
import type { Scene } from './scene'
import { renderSea } from './sea'
import type { SeaMode } from './sea'

const FRAME_MS = 100
const STORM_MS = 8_000 // 出錯後暴風雨持續多久

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


export const register: Register = on => {
  // 目前畫上去的尺寸；blit 必須跟掛載時一樣大
  let office: Scene | undefined
  let sea: Size | undefined
  let isWorking = false
  let stormUntil = 0

  const seaMode = (ms: number): SeaMode => (ms < stormUntil ? 'storm' : isWorking ? 'sail' : 'dock')

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
          void $.ui.blit({ requestId: SEA.id, key: SEA.key, cells: toCells(renderSea(s.w, s.h, ms, seaMode(ms)), s.w, s.h), columns: s.w, rows: s.h / 2 })
        }
      })
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
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) stormUntil = (await $.clock.now()) + STORM_MS
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
    return <ui.Raster key={SEA.key} columns={w} rows={rows} cells={toCells(renderSea(w, height, ms, seaMode(ms)), w, height)} />
  })
}
