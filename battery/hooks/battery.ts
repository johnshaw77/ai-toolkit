// 把 $.session.usage() 的數字變成電池：純函式，方便測試

import type { Meter, Reading } from '../types'

export const LOW = 0.2
const MID = 0.5

export const COLOR = { high: '#4ade80', mid: '#facc15', low: '#f87171' } as const

type ContextLike = { tokens?: number; window: number; percent?: number }
type LimitLike = { kind: string; percentUsed: number; resetsAt?: string }
type UsageLike = { context: ContextLike; rateLimits: readonly LimitLike[]; cost?: { usd: number } }

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

function contextLeft(c: ContextLike): number | null {
  if (c.percent !== undefined) return clamp01(1 - c.percent / 100)
  if (c.tokens !== undefined && c.window > 0) return clamp01(1 - c.tokens / c.window)
  return null
}

function limit(limits: readonly LimitLike[], kind: string, label: string): Meter | undefined {
  const l = limits.find(x => x.kind === kind)
  if (l === undefined) return undefined
  const resetsAt = l.resetsAt === undefined ? NaN : Date.parse(l.resetsAt)
  const meter: Meter = { label, left: clamp01(1 - l.percentUsed / 100) }
  return Number.isNaN(resetsAt) ? meter : { ...meter, resetsAt }
}

export function toReading(u: UsageLike): Reading {
  const meters: Meter[] = [{ label: 'context', left: contextLeft(u.context) }]
  const five = limit(u.rateLimits, 'five_hour', '5h')
  const seven = limit(u.rateLimits, 'seven_day', '7d')
  if (five !== undefined) meters.push(five)
  if (seven !== undefined) meters.push(seven)
  return u.cost === undefined ? { meters } : { meters, usd: u.cost.usd }
}

export const colorOf = (left: number): string => (left >= MID ? COLOR.high : left >= LOW ? COLOR.mid : COLOR.low)

export function countdown(ms: number): string {
  if (ms <= 0) return '即將重置'
  const min = Math.ceil(ms / 60_000)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h${String(min % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

// ── 像素電池 ───────────────────────────────────────────────
//
//  .#####################..     外框 23 寬、6 高，四角挖掉成圓角
//  #.....................#..    內部 x 2..20，每 4 格留 1 條縫 → 5 格電量
//  #.███.███.███.███.███.###    右邊正極凸點 2 寬
//  #.███.███.███.███.███.###
//  #.....................#..
//  .#####################..

export const BAT_W = 25
export const BAT_H = 6 // 像素；Raster 一格放上下兩個像素 → 3 行
const BODY_W = 23
const IN_X = 2
const IN_W = 19
const SEGMENTS = 15 // 19 欄扣掉 4 條縫

const DEFAULT = 0x01000000 // 透出終端機背景
const RIM = 0x9ca3af
const SHELL = 0x111827
const EMPTY = 0x273142
const GAP = 0x0b0f14
const RGB = { high: 0x4ade80, mid: 0xfacc15, low: 0xf87171 } as const

const rgbOf = (left: number): number => (left >= MID ? RGB.high : left >= LOW ? RGB.mid : RGB.low)

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/** 亮了幾格（0–15）；有電就至少亮 1 格 */
export function litCount(left: number): number {
  return left > 0 ? Math.max(1, Math.round(left * SEGMENTS)) : 0
}

/** 畫一顆電池的像素（BAT_W × BAT_H，列優先） */
export function drawBattery(left: number | null, frame: number, isCharging: boolean): number[] {
  const px = new Array<number>(BAT_W * BAT_H).fill(DEFAULT)
  const set = (x: number, y: number, c: number) => {
    px[y * BAT_W + x] = c
  }

  // 外殼與外框
  for (let y = 0; y < BAT_H; y++) {
    for (let x = 0; x < BODY_W; x++) {
      const isCorner = (x === 0 || x === BODY_W - 1) && (y === 0 || y === BAT_H - 1)
      if (isCorner) continue
      const isRim = x === 0 || x === BODY_W - 1 || y === 0 || y === BAT_H - 1
      set(x, y, isRim ? RIM : SHELL)
    }
  }
  for (let y = 2; y <= 3; y++) for (let x = BODY_W; x < BAT_W; x++) set(x, y, RIM)

  // 電量格
  const lit = left === null ? 0 : litCount(left)
  const base = left === null ? EMPTY : rgbOf(left)
  const isBlinkOff = left !== null && left < LOW && frame % 2 === 1
  const spark = isCharging && lit > 0 ? frame % (lit + 4) : -1
  let seg = 0
  for (let i = 0; i < IN_W; i++) {
    const x = IN_X + i
    const isGap = i % 4 === 3
    let c = GAP
    if (!isGap) {
      if (seg < lit) {
        c = isBlinkOff ? mix(base, EMPTY, 0.65) : base
        // 充電：一道亮光由左往右掃過已充的部分
        if (seg === spark) c = mix(base, 0xffffff, 0.7)
        else if (seg === spark - 1) c = mix(base, 0xffffff, 0.35)
      } else {
        c = EMPTY
      }
      seg++
    }
    for (let y = 1; y < BAT_H - 1; y++) set(x, y, c)
  }
  return px
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

/** 每格用 ▀ 放上下兩個像素，打包成 Raster 的 cells */
export function toCells(px: readonly number[], w: number, h: number): string {
  const rows = h / 2
  const words = new Uint32Array(w * rows * 3)
  let k = 0
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < w; x++) {
      words[k++] = 0x2580
      words[k++] = px[2 * r * w + x] ?? DEFAULT
      words[k++] = px[(2 * r + 1) * w + x] ?? DEFAULT
    }
  }
  return base64(new Uint8Array(words.buffer))
}

/** 一顆電池加旁邊的字大約占幾欄，用來決定窄螢幕時要收掉哪幾顆 */
export const METER_WIDTH = BAT_W + 1 + 12

export function fitMeters(meters: readonly Meter[], columns: number): Meter[] {
  const n = Math.max(1, Math.floor((columns + 3) / (METER_WIDTH + 3)))
  return meters.slice(0, n)
}
