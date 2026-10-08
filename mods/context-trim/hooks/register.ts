import type { Register } from 'claude-code'

import { COMPACT_KEEP, KEEP_FULL, trim } from './trim'

type Saved = { lines: number; chars: number }

export const register: Register = on => {
  // 指令帶 # keep-full 的呼叫不修剪；只在模組內記，reload 後歸零也無妨
  const keepFull = new Set<string>()

  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    if (e.tool_use_id !== undefined && e.command.includes(KEEP_FULL)) keepFull.add(e.tool_use_id)
    return next(e)
  })

  // 結果存進對話的那一刻修剪：畫面上的 tool 輸出照舊完整，只有模型讀到的變短
  on('session.append', { door: 'tool-result' }, async ($, e, next) => {
    if (e.origin.kind !== 'tool' || e.origin.tool !== 'Bash') return next(e)

    const saved: Saved = { lines: 0, chars: 0 }
    const shorten = (text: string): string => {
      const t = trim(text)
      if (t === undefined) return text
      saved.lines += t.droppedLines
      saved.chars += text.length - t.text.length
      return t.text
    }

    const content = e.message.content.map(block => {
      if (block.type !== 'tool_result') return block
      if (typeof block.tool_use_id === 'string' && keepFull.has(block.tool_use_id)) return block
      const inner = block.content
      if (typeof inner === 'string') return { ...block, content: shorten(inner) }
      if (Array.isArray(inner)) {
        return {
          ...block,
          content: inner.map(b => (b.type === 'text' ? { ...b, text: shorten(b.text) } : b)),
        }
      }
      return block
    })

    if (saved.chars <= 0) return next(e)
    const what = saved.lines > 0 ? `${saved.lines.toLocaleString('en-US')} 行` : `${saved.chars.toLocaleString('en-US')} 字`
    $.ui.toast(`context-trim：Bash 輸出省略 ${what}`)
    return next({ ...e, message: { ...e.message, content } })
  })

  // 每次壓縮（/compact、自動、外掛觸發）都附上保留清單，接在使用者自己的指示後面
  on('session.compact', ($, e, next) => {
    const instructions = e.instructions ? `${e.instructions}\n\n${COMPACT_KEEP}` : COMPACT_KEEP
    return next({ ...e, instructions })
  })
}
