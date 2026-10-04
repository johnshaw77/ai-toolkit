// 吉祥物：BMO 風格的掌上遊戲機（12×14），螢幕當臉，右邊接撐滿剩下寬度的 LED 跑馬燈
// 遊戲機用 ▀ 一格放上下兩個像素；LED 用 braille 點字畫

import { brailleAt, normalize, scrollOf } from './led'

const BOX_W = 12
const BOX_H = 14
const PAD_X = 2 // 左右各留 2 欄黑底
export const SPRITE_W = BOX_W + PAD_X * 2
export const H = 16 // 像素高 → 8 列（14 列身體 + 2 列跳躍空間）
export const ROWS = H / 2
export const GAP = 1
export const MIN_LED_COLS = 20
export const DEFAULT = 0x01000000 // 透出終端機背景
export const SPRITE_BG = 0x000000 // 遊戲機區的底色

const LED_BG = 0x170c07
const LED_TOP = 1 // 面板占第 1～6 列
const LED_ROWS = 6
const LED_Y = 5 // 字在面板裡往下 5 個點，上下大致置中

export type Mood = 'think' | 'type' | 'jump' | 'down'

const PALETTE: Record<string, number> = {
  k: 0x1d4a3c, // 外框、臉、卡槽
  T: 0x5fbfa8, // 青綠身體
  s: 0xd4ede3, // 螢幕
  S: 0xf2c4c4, // 出錯時泛紅的螢幕
  y: 0xf5e02a, // 十字鍵
  b: 0x2f3fb0, // 藍按鈕
  c: 0x4fc3e8, // 青按鈕
  g: 0x6cc24a, // 綠按鈕
  r: 0xe0303a, // 紅按鈕
  o: 0x2a6b58, // 按鈕暗掉
}

/** 螢幕 8×5 → 整台；lit 決定右下三顆按鈕亮不亮 */
const BMO = (screen: readonly string[], lit = true): string[] => [
  '.kkkkkkkkkk.',
  'kTTTTTTTTTTk',
  ...screen.map(row => `kT${row}Tk`),
  'kTTTTTTTTTTk',
  'kTkkkkTTbTTk',
  'kTTTTTTTTTTk',
  'kTTyTTTTTTTk',
  lit ? 'kTyyyTTcTgTk' : 'kTyyyTToToTk',
  lit ? 'kTTyTTTTrTTk' : 'kTTyTTTToTTk',
  '.kkkkkkkkkk.',
]

const s5 = (eyes: number, mouth: string, bg = 's'): string[] => {
  const blank = bg.repeat(8)
  const eyeRow = `${bg}k${bg.repeat(4)}k${bg}`
  const rows = [blank, blank, blank, blank, blank]
  rows[eyes] = eyeRow
  const m = mouth.replace(/s/g, bg)
  if (mouth.includes('|')) {
    const [a, b] = m.split('|') as [string, string]
    rows[3] = a
    rows[4] = b
  } else {
    rows[3] = m
  }
  return rows
}

const LINE = 'ssskksss' // 平常的一字嘴
const OPEN = 'sskkkkss' // 張嘴（講話）
const SMILE = 'skssssks|sskkkkss' // 笑：嘴角上揚
const FROWN = 'sskkkkss|skssssks' // 哭：嘴角往下

/** 這個狀態、這一刻（毫秒）要畫哪張，頂端擺在第幾個像素 */
export function pose(mood: Mood, sinceMs: number): { rows: readonly string[]; dy: number } {
  const ground = H - BOX_H
  if (mood === 'think') {
    // 眼睛往上看，偶爾眨眼（眼睛那列空掉）
    const blink = sinceMs % 3_000 > 2_850
    return { rows: BMO(blink ? s5(4, LINE).map((r, i) => (i === 0 ? 'ssssssss' : r)) : s5(0, LINE)), dy: ground }
  }
  if (mood === 'type') {
    // 邊講話邊按按鈕：嘴巴開合、按鈕閃
    const t = Math.floor(sinceMs / 220) % 2 === 0
    return { rows: BMO(s5(1, t ? OPEN : LINE), t), dy: ground }
  }
  if (mood === 'down') return { rows: BMO(s5(1, FROWN, 'S'), false), dy: ground }
  // 跳兩下：落地時 0，最高 2 格
  const bounce = Math.round(2 * Math.abs(Math.sin((Math.PI * 2 * sinceMs) / 1_600)))
  return { rows: BMO(s5(1, SMILE)), dy: ground - bounce }
}

/** 遊戲機區的像素（SPRITE_W × H） */
export function draw(mood: Mood, sinceMs: number): number[] {
  const px = new Array<number>(SPRITE_W * H).fill(SPRITE_BG)
  const { rows, dy } = pose(mood, sinceMs)
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = PALETTE[row[x] ?? '.']
      const yy = dy + y
      if (c !== undefined && yy >= 0 && yy < H) px[yy * SPRITE_W + PAD_X + x] = c
    }
  })
  return px
}

/** 跑馬燈的配色：每個字不同色，顏色隨時間往後流動；起始色每段訊息隨機 */
export const LED_COLORS = [0xffa630, 0xff5c8a, 0x4ade80, 0x60a5fa, 0xfbbf24, 0xa78bfa, 0x2dd4bf, 0xf87171] as const
export type Scheme = { offset: number }
const FLOW_MS = 350 // 每隔多久往後換一色

export const pickScheme = (r: number): Scheme => ({ offset: Math.floor(r * LED_COLORS.length) % LED_COLORS.length })

export const colorOf = (s: Scheme, charIndex: number, ms: number): number =>
  LED_COLORS[(charIndex + s.offset + Math.floor(ms / FLOW_MS)) % LED_COLORS.length]!

/** 跑馬燈要寫什麼 */
export function messageFor(mood: Mood, label: string | undefined): string {
  if (mood === 'jump') return 'DONE! ♥'
  if (mood === 'down') return 'OOPS... ERROR'
  return label === undefined ? 'THINKING...' : label
}

export type Reaction = { mood: 'jump' | 'down'; at: number }
export const REACTION_MS = 4_000
export const TOOL_MS = 1_500

export type Snapshot = { isWorking: boolean; lastToolAt: number | undefined; turnStartAt: number; reaction: Reaction | undefined }

/** 現在該顯示哪個狀態；都不是就收起來（undefined） */
export function pickMood(s: Snapshot, now: number): { mood: Mood; since: number } | undefined {
  if (s.isWorking) {
    if (s.lastToolAt !== undefined && now - s.lastToolAt < TOOL_MS) return { mood: 'type', since: now - s.lastToolAt }
    return { mood: 'think', since: now - s.turnStartAt }
  }
  if (s.reaction !== undefined && now - s.reaction.at < REACTION_MS) return { mood: s.reaction.mood, since: now - s.reaction.at }
  return undefined
}

/** 整塊畫面寬幾欄：撐滿 band，但 LED 至少留 MIN_LED_COLS */
export const colsFor = (bodyColumns: number): number => Math.max(SPRITE_W + GAP + MIN_LED_COLS, Math.min(512, bodyColumns))

/** 整塊畫面（cols × ROWS 格）：左邊機器人、右邊 LED；msgMs 是這段文字出現多久了 */
export function frameCells(mood: Mood, sinceMs: number, message: string, msgMs: number, cols: number, scheme: Scheme): string {
  const COLS = cols
  const LED_COLS = cols - SPRITE_W - GAP
  const px = draw(mood, sinceMs)
  const text = normalize(message)
  const scroll = scrollOf(text, LED_COLS * 2, msgMs)
  const words = new Uint32Array(COLS * ROWS * 3)
  let k = 0
  for (let r = 0; r < ROWS; r++) {
    for (let x = 0; x < COLS; x++) {
      if (x < SPRITE_W) {
        words[k++] = 0x2580
        words[k++] = px[2 * r * SPRITE_W + x] ?? DEFAULT
        words[k++] = px[(2 * r + 1) * SPRITE_W + x] ?? DEFAULT
        continue
      }
      const lx = x - SPRITE_W - GAP
      const lr = r - LED_TOP
      if (lx < 0 || lr < 0 || lr >= LED_ROWS) {
        words[k++] = 0x20
        words[k++] = DEFAULT
        words[k++] = DEFAULT
        continue
      }
      const cell = brailleAt(text, lx, lr, scroll, LED_Y)
      words[k++] = cell?.code ?? 0x20
      words[k++] = cell === undefined ? LED_BG : colorOf(scheme, cell.char, msgMs)
      words[k++] = LED_BG
    }
  }
  return base64(new Uint8Array(words.buffer))
}

/** 工具呼叫寫在 LED 上的字：工具名 + 檔名／指令，英數以外會變 ? */
export function labelOf(tool: string, args: Readonly<Record<string, unknown>>): string {
  const path = args['file_path'] ?? args['notebook_path']
  if (typeof path === 'string') return `${tool} ${path.split('/').pop() ?? path}`
  if (tool === 'Bash' && typeof args['command'] === 'string') return `$ ${args['command'].trim().split(/\s+/).slice(0, 2).join(' ')}`
  if (typeof args['pattern'] === 'string') return `${tool} ${args['pattern']}`
  return tool
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

// /mascot demo：不用送 prompt，四個狀態各演 3 秒

export const DEMO_STEP_MS = 3_000
const DEMO: readonly { mood: Mood; label?: string }[] = [
  { mood: 'think' },
  { mood: 'type', label: 'Edit register.tsx' },
  { mood: 'jump' },
  { mood: 'down' },
]
export const DEMO_MS = DEMO_STEP_MS * DEMO.length

/** 輪播中的狀態；播完（或沒在播）回傳 undefined */
export function demoMood(demoAt: number | undefined, now: number): { mood: Mood; since: number; label?: string | undefined } | undefined {
  if (demoAt === undefined || now < demoAt || now - demoAt >= DEMO_MS) return undefined
  const step = DEMO[Math.floor((now - demoAt) / DEMO_STEP_MS)]!
  return { mood: step.mood, since: (now - demoAt) % DEMO_STEP_MS, label: step.label }
}
