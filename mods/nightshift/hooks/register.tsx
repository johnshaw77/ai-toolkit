import type { EngineInterface, Register } from 'claude-code'

import { moodOf } from './mood'
import type { Track } from './mood'
import { toCells } from './pix'
import { render } from './scenes'
import type { SceneName } from './scenes'

const FRAME_MS = 100

const PANES = {
  studio: { id: 'studio', key: 'studio', title: '深夜工作室', columns: 60 },
  camp: { id: 'camp', key: 'camp', title: '山頂露營', columns: 60 },
} as const

type Size = { w: number; h: number }

/** 開或關一個 pane，回傳給指令的文字 */
async function toggle($: EngineInterface, name: SceneName): Promise<{ text: string }> {
  const pane = PANES[name]
  const isOpen = (await $.ui.panes()).some(p => p.id === pane.id)
  if (isOpen) {
    await $.ui.close({ id: pane.id })
    return { text: `${pane.title}收起來了。` }
  }
  await $.ui.open({ id: pane.id, title: pane.title, columns: pane.columns })
  return { text: `${pane.title}打開了。` }
}

// 填滿整個 pane：寬度用 bodyColumns、高度用 pane 可見的列數
const fit = (bodyColumns: number, bodyRows: number) => {
  const w = Math.max(32, Math.min(200, bodyColumns))
  const rows = Math.max(14, Math.min(100, bodyRows))
  return { w, rows, height: rows * 2 }
}

export const register: Register = on => {
  // 目前畫上去的尺寸；blit 必須跟掛載時一樣大
  const sizes: Partial<Record<SceneName, Size>> = {}
  let track: Track = { isWorking: false, workAt: 0 }

  const frameOf = (name: SceneName, size: Size, ms: number) => toCells(render(name, size.w, size.h, moodOf(track, ms), ms))

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'studio', description: '開關深夜工作室 pane' })
    await $.command.register({ name: 'camp', description: '開關山頂露營 pane' })
    $.clock.every(FRAME_MS, () => {
      void $.clock.now().then(ms => {
        for (const name of ['studio', 'camp'] as const) {
          const size = sizes[name]
          if (size === undefined) continue
          const pane = PANES[name]
          void $.ui.blit({ requestId: pane.id, key: pane.key, cells: frameOf(name, size, ms), columns: size.w, rows: size.h / 2 })
        }
      })
    })
    return next(e)
  })

  on('command.run', { command: 'studio' }, $ => toggle($, 'studio'))
  on('command.run', { command: 'camp' }, $ => toggle($, 'camp'))

  // 跟著 Claude：回合進行中＝工作，出錯＝下雨冒煙，答完＝慶祝
  on('turn.start', async ($, e, next) => {
    track = { ...track, isWorking: true, workAt: await $.clock.now(), doneAt: undefined }
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      track = { ...track, isWorking: false, doneAt: e.reason === 'answer' ? now : undefined, errorAt: e.reason === 'error' || e.reason === 'refusal' ? now : track.errorAt }
    }
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && (ran.deny !== undefined || ran.isError === true)) track = { ...track, errorAt: await $.clock.now() }
    return ran
  })

  for (const name of ['studio', 'camp'] as const) {
    on('ui.render', { component: 'Pane', requestId: name }, async ($, e) => {
      const ui = $.ui.resolve(e)
      if (e.surface !== 'terminal' || !('Raster' in ui)) return <ui.Text dimColor>{PANES[name].title}只在終端機顯示</ui.Text>
      const { w, rows, height } = fit(e.props.bodyColumns, e.props.scroll.bodyRows)
      sizes[name] = { w, h: height }
      const ms = await $.clock.now()
      return <ui.Raster key={PANES[name].key} columns={w} rows={rows} cells={frameOf(name, { w, h: height }, ms)} />
    })
  }
}
