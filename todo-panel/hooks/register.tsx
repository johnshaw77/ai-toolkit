import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { bar, current, fmtElapsed, fromTodoWrite, isClosed, markItem, marksNote, progress, taskCreate, taskUpdate } from './todos'
import type { Item } from '../types'

const PANE = 'todo-panel'
const items = atom({ plugin: 'todo-panel', key: 'items' } as const, [])
const marks = atom({ plugin: 'todo-panel', key: 'marks' } as const, [])

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Todos' })
}

async function mark($: EngineInterface, item: Item, kind: 'done' | 'skip') {
  await update($, items, list => markItem(list, item.id, kind))
  await update($, marks, list => [...list, { text: item.text, mark: kind }])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'todos', description: '打開 todo 面板' })
    return next(e)
  })

  on('command.run', { command: 'todos' }, async $ => {
    await openPane($)
    return { text: 'Todo 面板已打開。' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const input = e as unknown as Record<string, unknown>
    const now = await $.clock.now()
    const before = (await read($, items)).length

    if (e.tool === 'TodoWrite') {
      const todos = (input.todos ?? []) as Parameters<typeof fromTodoWrite>[1]
      await update($, items, list => fromTodoWrite(list, todos, now))
    } else if (e.tool === 'TaskCreate') {
      const task = (ran.result as { task?: { id: string; subject: string } } | undefined)?.task
      if (task) await update($, items, list => taskCreate(list, task.id, task.subject, input.activeForm as string | undefined))
    } else if (e.tool === 'TaskUpdate') {
      await update($, items, list => taskUpdate(list, input as unknown as Parameters<typeof taskUpdate>[1], now))
    } else {
      return ran
    }

    // 第一次有清單時自動開面板（寬螢幕才會停靠，窄的等 /todos）
    if (before === 0 && (await read($, items)).length > 0) void openPane($)
    return ran
  })

  // 使用者按的完成／跳過，在下一次送出時告訴 Claude
  on('prompt.submit', async ($, e, next) => {
    const note = marksNote(await read($, marks))
    if (note === null) return next(e)
    await update($, marks, () => [])
    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, items)
    const now = await $.clock.now()
    const { done, total } = progress(list)

    if (total === 0) return <Text dimColor>還沒有 todo。Claude 用 TodoWrite 或 TaskCreate 後會出現在這裡。</Text>

    return (
      <Box flexDirection="column">
        <Text>
          <Text color="green">{bar(done, total)}</Text> {done}/{total}
        </Text>
        {list.map(i => {
          const closed = isClosed(i)
          const glyph = i.mark === 'skip' ? '⤼' : closed ? '✓' : i.status === 'in_progress' ? '▶' : '○'
          const color = i.mark === 'skip' ? 'gray' : closed ? 'green' : i.status === 'in_progress' ? 'yellow' : undefined
          const took = i.startedAt === undefined ? '' : ` ${fmtElapsed((i.doneAt ?? now) - i.startedAt)}`
          return (
            <Box key={i.id} flexDirection="row">
              <Text color={color}>{glyph} </Text>
              <Text dimColor={closed} strikethrough={i.mark === 'skip'}>
                {i.text}
              </Text>
              <Text dimColor>{took} </Text>
              {!closed && <Button key={`done-${i.id}`} label="完成" onPress={() => mark($, i, 'done')} />}
              {!closed && <Button key={`skip-${i.id}`} label="跳過" onPress={() => mark($, i, 'skip')} />}
            </Box>
          )
        })}
      </Box>
    )
  })

  // 輸入框上方一行摘要；疊在其他 mod 上面，不蓋掉它們
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, items)
    const { done, total } = progress(list)
    if (e.props.hasSurvey || total === 0 || done === total) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = current(list)
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Text>
          <Text color="yellow">{now ? '▶ ' : '○ '}</Text>
          <Text>{now ? now.active : '等待下一項'}</Text>
          <Text dimColor> ({done}/{total}) · /todos</Text>
        </Text>
        {below}
      </Box>
    )
  })
}
