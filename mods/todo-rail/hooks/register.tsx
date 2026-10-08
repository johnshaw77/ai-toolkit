import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Todo } from '../types'
import { toggled } from './toggle'
import { addTask, clip, COLOR, createdId, DEMO, GLYPH, isAllDone, isUpdated, listedTasks, patchTask, railOf, syncTasks } from './rail'

const todos = atom({ plugin: 'todo-rail', key: 'todos' } as const, [])

export const register: Register = on => {
  let isOn = true

  on('session.start', async ($, e, next) => {
    await update($, todos, () => [])
    isOn = (await $.store.get('isOn')) !== false
    await $.command.register({ name: 'rail', description: '待辦進度條：/rail on｜off 開關，/rail demo 放假資料看畫面，/rail clear 清掉' })
    return next(e)
  })

  on('command.run', { command: 'rail' }, async ($, e) => {
    const a = e.args.trim()
    if (a === 'demo') {
      await update($, todos, () => DEMO.map(t => ({ ...t })))
      return { text: 'todo-rail：放了 5 項假待辦（2 完成、1 進行中、2 待做），看輸入框上方。/rail clear 清掉。' }
    }
    const flip = a === '' || a === 'on' || a === 'off' ? toggled(isOn, a) : undefined
    if (flip !== undefined) {
      isOn = flip
      await $.store.set('isOn', isOn)
      return { text: `待辦進度條：${isOn ? '開' : '關'}` }
    }
    if (a === 'clear') {
      await update($, todos, () => [])
      return { text: 'todo-rail：清掉了。' }
    }
    return { text: '用法：/rail on｜off｜demo｜clear（不給就切換）' }
  })

  // 上一輪全部做完的清單，新的一輪開始就收掉
  on('turn.start', async ($, e, next) => {
    if (isAllDone(await read($, todos))) await update($, todos, () => [])
    return next(e)
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    if (e.agentId === undefined) await update($, todos, () => e.todos.map((t): Todo => ({ ...t })))
    return next(e)
  })

  // 新版待辦：建立後才知道 id，所以先跑完再記
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const id = createdId(ran.result)
    if (e.agentId === undefined && id !== undefined) await update($, todos, list => addTask(list, id, e.subject, e.activeForm))
    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && isUpdated(ran.result)) {
      await update($, todos, list => patchTask(list, { taskId: e.taskId, subject: e.subject, activeForm: e.activeForm, status: e.status }))
    }
    return ran
  })

  on('tool.call', { tool: 'TaskList' }, async ($, e, next) => {
    const ran = await next(e)
    const tasks = listedTasks(ran.result)
    if (e.agentId === undefined && tasks !== undefined) await update($, todos, list => syncTasks(list, tasks))
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, todos)
    if (e.props.hasSurvey || !isOn || list.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const rail = railOf(list)
    const tail = rail.current === undefined ? '' : ` ${clip(rail.current, Math.max(10, e.props.bodyColumns - rail.cells.length - 12))}`
    // 這一格只畫得出一棵樹：把下層 mod 的畫面接在下面，不要蓋掉
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box>
          {rail.cells.map(s => (
            <Text color={COLOR[s]} bold={s === 'in_progress'}>
              {GLYPH[s]}
            </Text>
          ))}
          <Text dimColor>{` ${rail.done}/${rail.total}${tail}`}</Text>
        </Box>
        {below}
      </Box>
    )
  })
}
