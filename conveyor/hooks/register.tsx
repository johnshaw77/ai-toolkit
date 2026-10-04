import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { H, hasArrived, labelOf, LANES, render, TOKEN_COLORS, toCells } from './scene'
import type { Block } from './scene'

const frame = atom({ plugin: 'conveyor', key: 'frame' } as const, 0)

const FRAME_MS = 100
const CHARS_PER_BLOCK = 6 // 模型每輸出這麼多字，送出一個方塊
const MAX_BLOCKS = 160

export const register: Register = on => {
  let now = 0
  let blocks: Block[] = []
  let pending = 0 // 還沒湊滿一個方塊的字數
  let spawned = 0
  let label = 'thinking…'
  let cartAt: number | undefined
  let glowAt: number | undefined
  let isWorking = false
  let width = 120 // 上次畫的寬度；方塊到不到得了檔案要看它

  const spawn = () => {
    if (blocks.length >= MAX_BLOCKS) return
    // 同一排錯開一點，看起來才是一顆顆的
    blocks.push({
      born: now + (spawned % 3) * 25,
      lane: spawned % LANES.length,
      color: TOKEN_COLORS[(spawned * 7) % TOKEN_COLORS.length] ?? TOKEN_COLORS[0],
    })
    spawned++
  }

  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    $.clock.every(FRAME_MS, () => {
      if (!isWorking && blocks.length === 0) return
      void $.clock.now().then(ms => {
        now = ms
        const before = blocks.length
        blocks = blocks.filter(b => !hasArrived(b, ms, width))
        if (blocks.length < before) glowAt = ms
        void update($, frame, f => f + 1)
      })
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    label = 'thinking…'
    return next(e)
  })
  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      blocks = []
      cartAt = undefined
    }
    return next(e)
  })

  // 模型吐字時送方塊：只數字數，串流原樣往下傳
  on('turn.step', async function* ($, e, next) {
    for await (const chunk of next(e)) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking') {
        pending += chunk.text.length
        while (pending >= CHARS_PER_BLOCK) {
          pending -= CHARS_PER_BLOCK
          spawn()
        }
      }
      yield chunk
    }
  })

  // 每次工具呼叫：檔案換成這次的目標，推車跑一趟
  on('tool.call', ($, e, next) => {
    label = labelOf(e.tool, e as unknown as Readonly<Record<string, unknown>>)
    cartAt = now
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !e.props.isWorking) return next(e)
    const ui = $.ui.resolve(e)
    if (e.surface !== 'terminal' || !('Raster' in ui)) return next(e)

    const w = Math.max(40, Math.min(220, e.props.bodyColumns))
    width = w
    const f = await read($, frame)
    const visible = blocks.filter(b => !hasArrived(b, now, w))
    const { px, overlay } = render(w, { now, frame: f, blocks: visible, label, cartAt, glowAt })
    return <ui.Raster key="conveyor" columns={w} rows={H / 2} cells={toCells(px, w, overlay)} />
  })
}
