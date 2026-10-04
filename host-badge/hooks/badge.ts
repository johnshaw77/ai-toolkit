import type { Badge } from '../types'

const PALETTE = ['magenta', 'cyan', 'green', 'red', 'yellow', 'blue'] as const

/** 讀設定檔與機器名稱的指令：設定檔內容、分隔線、機器名稱 */
export const PROBE = ['sh', '-c', 'cat ~/.claude/host-badge.json 2>/dev/null; echo; echo "---host---"; scutil --get LocalHostName 2>/dev/null || hostname']

const hash = (s: string): number => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** 沒設定檔時：機器名稱轉大寫，顏色依名稱固定 */
export const fallback = (host: string): Badge => {
  const name = host.trim() || 'UNKNOWN'
  return { label: name.toUpperCase(), color: PALETTE[hash(name) % PALETTE.length] ?? 'cyan' }
}

export const parseProbe = (stdout: string): Badge => {
  const [config = '', host = ''] = stdout.split('---host---')
  const fb = fallback(host)
  const text = config.trim()
  if (!text) return fb
  try {
    const j = JSON.parse(text) as Partial<Badge>
    return {
      label: typeof j.label === 'string' && j.label.trim() ? j.label.trim() : fb.label,
      color: typeof j.color === 'string' && j.color.trim() ? j.color.trim() : fb.color,
    }
  } catch {
    return fb
  }
}

/** /badge 的新名稱：去頭尾空白，空字串表示沒給 */
export const parseLabel = (args: string): string => args.trim()

/** 把新名稱寫進設定檔內容；其他欄位（color）照舊，原本壞掉或沒有就從空物件開始 */
export const withLabel = (configText: string, label: string): string => {
  let j: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(configText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) j = parsed as Record<string, unknown>
  } catch {}
  return JSON.stringify({ ...j, label }) + '\n'
}
