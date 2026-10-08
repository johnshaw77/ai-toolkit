import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { toggled } from './toggle'
import { colsFor, demoMood, frameCells, labelOf, messageFor, pickMood, pickScheme, ROWS } from './sprite'
import type { Reaction, Scheme } from './sprite'

const frame = atom({ plugin: 'mascot', key: 'frame' } as const, 0)

const FRAME_MS = 100

export const register: Register = on => {
  let now = 0
  let isWorking = false
  let turnStartAt = 0
  let lastToolAt: number | undefined
  let label: string | undefined
  let reaction: Reaction | undefined
  // 跑馬燈換字就從頭跑
  let message = ''
  let messageAt = 0
  let scheme: Scheme = { offset: 0 }

  let isOn = true
  let demoAt: number | undefined // /mascot demo 開始的時間

  const snap = () => ({ isWorking, lastToolAt, turnStartAt, reaction })
  // 真的在工作就以真實狀態為準，否則看有沒有在輪播
  const current = (ms: number) => {
    const real = pickMood(snap(), ms)
    if (isWorking) return { ...real!, label }
    const demo = demoMood(demoAt, ms)
    return demo ?? (real === undefined ? undefined : { ...real, label })
  }

  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    isOn = (await $.store.get('isOn')) !== false
    await $.command.register({ name: 'mascot', description: '開關遊戲機＋LED 跑馬燈：/mascot on｜off｜demo，不給就切換' })
    $.clock.every(FRAME_MS, () => {
      void $.clock.now().then(ms => {
        now = ms
        // 沒東西可畫就不重畫
        if (current(ms) !== undefined) void update($, frame, f => f + 1)
      })
    })
    return next(e)
  })

  on('command.run', { command: 'mascot' }, async ($, e) => {
    if (e.args.trim() === 'demo') {
      demoAt = await $.clock.now()
      isOn = true
      return { text: '遊戲機＋LED：輪播思考、呼叫工具、做完、出錯，各 3 秒。看輸入框上方。' }
    }
    const next = toggled(isOn, e.args)
    if (next === undefined) return { text: '用法：/mascot on｜off｜demo（不給就切換）' }
    isOn = next
    await $.store.set('isOn', isOn)
    return { text: `遊戲機＋LED：${isOn ? '開' : '關'}` }
  })

  on('turn.start', async ($, e, next) => {
    now = await $.clock.now()
    isWorking = true
    turnStartAt = now
    lastToolAt = undefined
    label = undefined
    reaction = undefined
    demoAt = undefined // 真的開工就停止輪播
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) {
      lastToolAt = await $.clock.now()
      label = labelOf(e.tool, e as unknown as Readonly<Record<string, unknown>>)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      const at = await $.clock.now()
      // 被中斷不演；答完開心跳，出錯或被拒低頭
      if (e.reason === 'answer') reaction = { mood: 'jump', at }
      else if (e.reason === 'error' || e.reason === 'refusal') reaction = { mood: 'down', at }
      else reaction = undefined
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !isOn) return next(e)
    const ui = $.ui.resolve(e)
    if (e.surface !== 'terminal' || !('Raster' in ui)) return next(e)
    await read($, frame) // 訂閱：frame 一變就重畫
    const picked = current(now)
    if (picked === undefined) return next(e)
    const text = messageFor(picked.mood, picked.label)
    if (text !== message) {
      message = text
      messageAt = now
      scheme = pickScheme(Math.random()) // 換一段字就換起始色
    }
    const cols = colsFor(e.props.bodyColumns)
    // 這一格只畫得出一棵樹：把下層 mod 的畫面接在下面，不要蓋掉
    const below = await next(e)
    return (
      <ui.Box flexDirection="column">
        <ui.Raster key="mascot" columns={cols} rows={ROWS} cells={frameCells(picked.mood, picked.since, message, now - messageAt, cols, scheme)} />
        {below}
      </ui.Box>
    )
  })
}
