// 兩個背景：深夜工作室與山頂露營；主角擺在下方中間，pane 夠大就放大兩倍

import { DEV_H, DEV_W, drawDev, LAPTOP, MUG } from './dev'
import type { State } from './dev'
import { canvas, disc, hash, mix, rect, set } from './pix'
import type { Canvas } from './pix'

export type SceneName = 'studio' | 'camp'

const scaleFor = (w: number, h: number): number => (w >= DEV_W * 2 + 20 && h >= DEV_H * 2 + 24 ? 2 : 1)

/** 主角左上角與放大倍數；地板（桌腳底）在 floorY */
export function layout(w: number, h: number): { ox: number; oy: number; scale: number; floorY: number } {
  const scale = scaleFor(w, h)
  const floorY = h - Math.max(3, Math.round(h * 0.12))
  const ox = Math.round(w / 2 - (DEV_W * scale) / 2)
  const oy = floorY - DEV_H * scale
  return { ox, oy, scale, floorY }
}

// 主角後面的粒子：工作中從筆電冒出的程式碼方塊、出錯時的煙（被人擋住才不會蓋到臉）
function behind(c: Canvas, s: State, ms: number, ox: number, oy: number, scale: number): void {
  const lx = ox + LAPTOP.x * scale
  const ly = oy + LAPTOP.y * scale
  if (s.mood === 'work') {
    const colors = [0x4ade80, 0x60a5fa, 0xf472b6, 0xfbbf24, 0xa78bfa]
    for (let i = 0; i < 10; i++) {
      const life = ((ms / 1_600 + i / 10) % 1)
      const x = lx + (hash(i, 7) - 0.5) * 16 * scale + Math.sin(ms / 400 + i) * 2
      const y = ly - life * 14 * scale
      if (life < 0.9) set(c, x, y, mix(colors[i % colors.length]!, 0x252a42, life * 0.7))
    }
  }
  if (s.mood === 'error') {
    for (let i = 0; i < 6; i++) {
      const life = (ms / 1_200 + i / 6) % 1
      disc(c, lx + Math.sin(ms / 300 + i) * 2 * scale, ly - 2 * scale - life * 8 * scale, scale, mix(0x9ca3af, 0x252a42, life))
    }
  }
}

// 主角前面的粒子：杯子的熱氣、完成時的彩帶
function front(c: Canvas, s: State, ms: number, ox: number, oy: number, scale: number): void {
  // 熱氣
  for (let i = 0; i < 3; i++) {
    const life = (ms / 1_400 + i / 3) % 1
    set(c, ox + (MUG.x + Math.round(Math.sin(ms / 350 + i * 2))) * scale, oy + (MUG.y - life * 5) * scale, mix(0xe6edf5, 0x252a42, life))
  }
  if (s.mood === 'done') {
    const colors = [0xff5c8a, 0xfbbf24, 0x4ade80, 0x60a5fa, 0xffffff]
    for (let i = 0; i < 40; i++) {
      const x = hash(i, 3) * c.w + Math.sin(s.since / 300 + i) * 2
      const y = ((s.since / 1_000) * (6 + hash(i, 5) * 10) + hash(i, 9) * -c.h * 0.6) % c.h
      if (y >= 0) set(c, x, y, colors[i % colors.length]!)
    }
  }
}

// ── 深夜工作室 ────────────────────────────────────────────

const WALL = 0x252a42

export function studio(w: number, h: number, s: State, ms: number): Canvas {
  const c = canvas(w, h, WALL)
  const { ox, oy, scale, floorY } = layout(w, h)

  // 牆上的直條紋
  for (let x = 0; x < w; x += 6) for (let y = 0; y < floorY; y++) set(c, x, y, 0x232740)

  // 窗戶：夜空、月亮、城市
  const wx = Math.max(1, Math.round(w * 0.06))
  const wy = Math.max(1, Math.round(h * 0.1))
  const ww = Math.max(10, Math.round(w * 0.32))
  const wh = Math.max(8, Math.round(h * 0.36))
  rect(c, wx - 1, wy - 1, ww + 2, wh + 2, 0x5a6a8a)
  const flash = s.mood === 'error' && hash(Math.floor(ms / 120)) > 0.93
  rect(c, wx, wy, ww, wh, flash ? 0x8090c0 : 0x141833)
  for (let i = 0; i < ww * wh * 0.03; i++) {
    const tw = hash(i, Math.floor(ms / 500)) > 0.8
    set(c, wx + hash(i, 1) * ww, wy + hash(i, 2) * wh * 0.6, tw ? 0x5b6170 : 0xe5e7eb)
  }
  if (s.mood !== 'error') disc(c, wx + ww * 0.75, wy + wh * 0.25, Math.max(1, Math.round(wh * 0.1)), 0xf3e7b3)
  let bx = wx
  let b = 0
  while (bx < wx + ww) {
    const bw = 2 + Math.floor(hash(b, 11) * 4)
    const bh = Math.round(wh * (0.25 + hash(b, 12) * 0.45))
    for (let x = bx; x < Math.min(bx + bw, wx + ww); x++) {
      for (let y = wy + wh - bh; y < wy + wh; y++) {
        const isWin = (x - bx) % 2 === 1 && (y - (wy + wh - bh)) % 2 === 1
        const on = isWin && hash(x, y, Math.floor(ms / 2_000)) > (s.mood === 'work' ? 0.45 : 0.7)
        set(c, x, y, on ? 0xf5c46b : 0x1d2140)
      }
    }
    bx += bw
    b++
  }
  if (s.mood === 'error') {
    for (let i = 0; i < ww * 0.8; i++) {
      const x = wx + hash(i, 21) * ww
      const y = wy + ((ms / 8 + hash(i, 22) * wh * 4) % wh)
      set(c, x, y, 0x6c7cb0)
      set(c, x, y + 1, 0x6c7cb0)
    }
  }
  rect(c, wx + Math.floor(ww / 2), wy, 1, wh, 0x5a6a8a) // 窗框中線

  // 串燈
  for (let x = 1; x < w - 1; x += 4) {
    const y = 1 + Math.round(Math.sin(x / 6) * 1 + 1)
    set(c, x, y - 1, 0x3d4a6b)
    const lit = s.mood !== 'idle' || hash(x, Math.floor(ms / 700)) > 0.5
    const colors = [0xfbbf24, 0xff5c8a, 0x4ade80, 0x60a5fa]
    set(c, x, y, lit ? colors[(x / 4) % colors.length]! : 0x3d4a6b)
  }

  // 時鐘：一分鐘轉一圈
  const cx = Math.round(w * 0.8)
  const cy = Math.round(h * 0.18)
  const r = Math.max(3, Math.round(Math.min(w, h) * 0.07))
  disc(c, cx, cy, r + 1, 0x5a6a8a)
  disc(c, cx, cy, r, 0xe6edf5)
  const sec = (ms / 1_000) % 60
  const a = (sec / 60) * Math.PI * 2
  for (let i = 0; i <= r - 1; i++) set(c, cx + Math.sin(a) * i, cy - Math.cos(a) * i, 0xe8833a)
  const hr = ((ms / 60_000) % 60) / 60 * Math.PI * 2
  for (let i = 0; i <= r - 2; i++) set(c, cx + Math.sin(hr) * i, cy - Math.cos(hr) * i, 0x2a2f45)

  // 書架
  const sx = Math.round(w * 0.68)
  const sy = Math.round(h * 0.38)
  const sw = Math.max(8, Math.round(w * 0.25))
  for (let shelf = 0; shelf < 2; shelf++) {
    const y = sy + shelf * 7
    rect(c, sx, y + 5, sw, 1, 0x8d9bb5)
    let x = sx + 1
    let i = 0
    while (x < sx + sw - 1) {
      const bw = 1 + Math.floor(hash(i, shelf, 31) * 2)
      const bh = 3 + Math.floor(hash(i, shelf, 32) * 3)
      const colors = [0xe0a870, 0x7c5cff, 0x4ade80, 0xff6b6b, 0x60a5fa, 0xe9d5a8]
      rect(c, x, y + 5 - bh, bw, bh, colors[Math.floor(hash(i, shelf, 33) * colors.length)]!)
      x += bw + 1
      i++
    }
  }

  // 地板
  rect(c, 0, floorY, w, h - floorY, 0x3a3150)
  for (let x = 0; x < w; x += 9) for (let y = floorY + 1; y < h; y += 2) set(c, x + (y % 4 === 0 ? 4 : 0), y, 0x2f2843)
  rect(c, 0, floorY, w, 1, 0x4a4066)

  // 盆栽
  const px = Math.min(w - 6, ox + DEV_W * scale + 3)
  rect(c, px, floorY - 4, 4, 4, 0xc4553a)
  for (let i = 0; i < 7; i++) {
    const sway = Math.round(Math.sin(ms / 700 + i) * 0.6)
    set(c, px + (i % 4) + sway, floorY - 5 - Math.floor(i / 2), i % 2 === 0 ? 0x4ade80 : 0x22c55e)
  }

  behind(c, s, ms, ox, oy, scale)
  drawDev(c, s, ox, oy, scale)
  front(c, s, ms, ox, oy, scale)
  return c
}

// ── 山頂露營 ──────────────────────────────────────────────

export function camp(w: number, h: number, s: State, ms: number): Canvas {
  const c = canvas(w, h, 0x0d1030)
  const { ox, oy, scale, floorY } = layout(w, h)

  // 夜空漸層
  for (let y = 0; y < floorY; y++) rect(c, 0, y, w, 1, mix(0x0d1030, 0x2a2050, y / floorY))
  for (let i = 0; i < w * h * 0.02; i++) {
    const tw = hash(i, Math.floor(ms / 400)) > 0.85
    set(c, hash(i, 41) * w, hash(i, 42) * floorY * 0.7, tw ? 0x5b6170 : 0xe5e7eb)
  }
  // 極光：工作中比較亮
  const glow = s.mood === 'work' ? 0.55 : 0.25
  for (let x = 0; x < w; x++) {
    const base = h * 0.18 + Math.sin(x / 9 + ms / 1_500) * h * 0.05
    for (let k = 0; k < 6; k++) {
      const y = base + k
      set(c, x, y, mix(mix(0x2a2050, 0x2dd4bf, glow * (1 - k / 6)), 0xa78bfa, (Math.sin(x / 13 + ms / 2_000) + 1) / 6))
    }
  }
  // 月亮
  if (s.mood !== 'error') disc(c, Math.round(w * 0.85), Math.round(h * 0.12), Math.max(2, Math.round(h * 0.05)), 0xf3e7b3)

  // 山：兩層
  const ridge = (x: number, amp: number, seed: number) =>
    Math.sin(x / 11 + seed) * amp + Math.sin(x / 5 + seed * 2) * amp * 0.4
  for (let x = 0; x < w; x++) {
    const far = Math.round(floorY - h * 0.28 + ridge(x, h * 0.07, 1))
    for (let y = far; y < floorY; y++) set(c, x, y, 0x2a3158)
    const near = Math.round(floorY - h * 0.15 + ridge(x, h * 0.05, 4))
    for (let y = near; y < floorY; y++) set(c, x, y, 0x1f2445)
  }

  // 地面與草
  rect(c, 0, floorY, w, h - floorY, 0x22342a)
  for (let x = 0; x < w; x += 3) set(c, x + (x % 2), floorY - 1, 0x2f4a38)
  for (let i = 0; i < w / 3; i++) set(c, hash(i, 51) * w, floorY + 1 + hash(i, 52) * (h - floorY - 1), 0x1b2a22)

  // 帳篷
  const tw = Math.max(10, Math.round(14 * scale))
  const tx = Math.max(1, ox - tw - 4 * scale)
  for (let j = 0; j < tw / 2 + 1; j++) {
    const y = floorY - 1 - j
    rect(c, tx + j, y, tw - j * 2, 1, j % 3 === 0 ? 0xc0784a : 0xe0a870)
  }
  rect(c, tx + Math.floor(tw / 2) - 1, floorY - Math.round(tw / 4), 2, Math.round(tw / 4), 0x3a2418)

  // 營火
  const fx = Math.min(w - 4, ox + DEV_W * scale + 4 * scale)
  rect(c, fx - 3, floorY - 1, 7, 1, 0x6b4a2b)
  rect(c, fx - 2, floorY - 2, 5, 1, 0x8a5a2b)
  const power = s.mood === 'work' ? 1 : s.mood === 'error' ? 0.25 : 0.6
  const flameH = Math.max(2, Math.round(7 * power * scale))
  for (let i = -2; i <= 2; i++) {
    const fh = Math.round(flameH * (1 - Math.abs(i) * 0.25) * (0.75 + hash(i + 9, Math.floor(ms / 110)) * 0.35))
    for (let y = 0; y < fh; y++) {
      const t = y / Math.max(1, fh)
      set(c, fx + i, floorY - 3 - y, t < 0.35 ? 0xffd166 : t < 0.7 ? 0xff8c42 : 0xe63946)
    }
  }
  // 火光照亮附近的地
  for (let x = fx - 10; x <= fx + 10; x++) {
    const d = Math.abs(x - fx) / 10
    if (d < 1) set(c, x, floorY, mix(0x5a4030, 0x22342a, d + (1 - power) * 0.5))
  }
  // 火星／煙
  for (let i = 0; i < (s.mood === 'work' ? 8 : 3); i++) {
    const life = (ms / 1_300 + i / 8) % 1
    const x = fx + Math.sin(ms / 250 + i * 3) * 2
    const y = floorY - 3 - flameH - life * h * 0.25
    set(c, x, y, s.mood === 'error' ? mix(0x9ca3af, 0x2a2050, life) : mix(0xffd166, 0x2a2050, life))
  }

  // 螢火蟲
  for (let i = 0; i < 6; i++) {
    const on = Math.sin(ms / 500 + i * 1.7) > 0.2
    if (!on) continue
    const x = (hash(i, 61) * w + Math.sin(ms / 1_700 + i) * 6 + w) % w
    const y = floorY - 4 - hash(i, 62) * h * 0.25 + Math.cos(ms / 1_300 + i) * 2
    set(c, x, y, 0xd9f99d)
  }

  // 下雨
  if (s.mood === 'error') {
    for (let i = 0; i < w * 0.7; i++) {
      const x = hash(i, 71) * w
      const y = (ms / 6 + hash(i, 72) * h * 4) % h
      set(c, x, y, 0x6c7cb0)
      set(c, x, y + 1, 0x6c7cb0)
    }
  }

  // 流星與煙火
  if (s.mood === 'done') {
    const t = Math.min(1, s.since / 900)
    const sx = w * 0.1 + t * w * 0.5
    const sy = h * 0.08 + t * h * 0.15
    for (let k = 0; k < 6; k++) set(c, sx - k * 2, sy - k * 0.6, mix(0xffffff, 0x2a2050, k / 6))
    for (let f = 0; f < 2; f++) {
      const age = (s.since - f * 700) / 1_000
      if (age < 0 || age > 1.6) continue
      const cx = w * (0.3 + f * 0.4)
      const cy = h * 0.3
      const colors = [0xff5c8a, 0xfbbf24]
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2
        const r = age * h * 0.15
        set(c, cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r + age * age * 3, mix(colors[f]!, 0x2a2050, age / 1.6))
      }
    }
  }

  behind(c, s, ms, ox, oy, scale)
  drawDev(c, s, ox, oy, scale)
  front(c, s, ms, ox, oy, scale)
  return c
}

export const render = (name: SceneName, w: number, h: number, s: State, ms: number): Canvas =>
  name === 'studio' ? studio(w, h, s, ms) : camp(w, h, s, ms)
