// /mods：掃 ~/.claude/mods 與 CLAUDE_CODE_PLUGIN_DIRS，列出每個 mod 的名稱、指令與載入狀態

export type ModInfo = { name: string; description: string; commands: string[]; isLoaded: boolean }

// 用 python3 讀 plugin.json 與原始碼（沙箱裡沒有 Node／檔案系統，只能叫主機做）
const PY = String.raw`
import glob, json, os, re
home = os.path.expanduser('~')
loaded = [os.path.realpath(os.path.expanduser(d)) for d in re.split(r'[:;]', os.environ.get('CLAUDE_CODE_PLUGIN_DIRS', '')) if d]
dirs = loaded + sorted(glob.glob(home + '/.claude/mods/*'))
seen, out = set(), []
for d in dirs:
    d = os.path.realpath(d)
    p = os.path.join(d, '.claude-plugin', 'plugin.json')
    if d in seen or not os.path.isfile(p):
        continue
    seen.add(d)
    try:
        j = json.load(open(p))
    except Exception:
        continue
    cmds = set()
    for f in glob.glob(os.path.join(d, 'hooks', '*.ts*')):
        try:
            cmds.update(re.findall(r"command\.register\(\{\s*name:\s*'([^']+)'", open(f).read()))
        except Exception:
            pass
    out.append({'name': j.get('name', os.path.basename(d)), 'description': j.get('description', ''), 'commands': sorted(cmds), 'isLoaded': d in loaded})
print(json.dumps(out, ensure_ascii=False))
`
export const PROBE: readonly string[] = ['python3', '-c', PY]

/** 解析 PROBE 的輸出；格式不對就當作沒有 */
export function parseProbe(stdout: string): ModInfo[] {
  try {
    const raw: unknown = JSON.parse(stdout.trim())
    if (!Array.isArray(raw)) return []
    return raw.flatMap((x): ModInfo[] => {
      if (typeof x !== 'object' || x === null) return []
      const o = x as Record<string, unknown>
      if (typeof o['name'] !== 'string') return []
      return [
        {
          name: o['name'],
          description: typeof o['description'] === 'string' ? o['description'] : '',
          commands: Array.isArray(o['commands']) ? o['commands'].filter((c): c is string => typeof c === 'string') : [],
          isLoaded: o['isLoaded'] === true,
        },
      ]
    })
  } catch {
    return []
  }
}

/** Markdown 表格：第一欄 # 流水號靠右；載入中的排前面 */
export function formatTable(mods: readonly ModInfo[]): string {
  if (mods.length === 0) return '找不到任何 mod（~/.claude/mods 是空的，CLAUDE_CODE_PLUGIN_DIRS 也沒設）。'
  const sorted = [...mods].sort((a, b) => Number(b.isLoaded) - Number(a.isLoaded) || a.name.localeCompare(b.name))
  const rows = sorted.map((m, i) => {
    const cmds = m.commands.length > 0 ? m.commands.map(c => `\`/${c}\``).join('、') : '—'
    return `| ${i + 1} | \`${m.name}\` | ${cmds} | ${m.isLoaded ? '✓' : '未載入'} | ${m.description} |`
  })
  return ['| # | mod | 指令 | 載入 | 做什麼 |', '|---:|---|---|---|---|', ...rows].join('\n')
}
