// 開關指令共用：`/x` 切換、`/x on`、`/x off`；看不懂回傳 undefined

export function toggled(isOn: boolean, args: string): boolean | undefined {
  const a = args.trim().toLowerCase()
  if (a === '') return !isOn
  if (a === 'on') return true
  if (a === 'off') return false
  return undefined
}
