// 暖色像素辦公室：純函式，依尺寸排版、依時間與工作狀態算出每個像素

import { PALETTE, SPRITE } from './luffy'

export type Scene = { w: number; h: number; books: Book[]; code: number[][] }
type Book = { x: number; y: number; w: number; h: number; color: number }

const C = {
  wallTop: 0xf0d2a8,
  wallBottom: 0xe2b98a,
  wainscot: 0xa8683f,
  wainscotDark: 0x8a5232,
  rail: 0xc98c5a,
  floorA: 0x9c5f38,
  floorB: 0x8d5431,
  seam: 0x6e3f24,
  frame: 0x7a4527,
  frameLight: 0x9a5f39,
  sill: 0xb57a4c,
  wire: 0x5a3a28,
  rug: 0x7a3038,
  rugEdge: 0xe8c8a0,
  rugInner: 0x5e2430,
  desk: 0xb0703f,
  deskTop: 0xc98450,
  deskDark: 0x7e4a28,
  monitor: 0x2a2526,
  screen: 0x1b2430,
  lampShade: 0xe8a33c,
  lampArm: 0x4a3a32,
  bulb: 0xfff2c0,
  mug: 0xf4ede2,
  coffee: 0x5a3220,
  steam: 0xffffff,
  pot: 0xc4643a,
  potDark: 0x9a4a2a,
  leaf: 0x5a9a4a,
  leafDark: 0x3f7a38,
  shelf: 0x8a5232,
  shelfBack: 0x6a3d24,
  cat: 0xf5a64a,
  catDark: 0xc0702c,
  catEar: 0xe0823a,
  catLine: 0x3a2018,
}

const BOOK_COLORS = [0xc0483a, 0x3f6f8f, 0xd9a441, 0x5f8a4a, 0x8a4a7a, 0xe07a4a, 0x4a5a8a, 0xb0a080]
const LIGHT_COLORS = [0xffc04a, 0xff6a5a, 0xffe08a, 0xff9ad0, 0x9ae0ff]
const CODE_COLORS = [0xe8b06a, 0x8fd18a, 0x8ab8f0, 0xe08aa8, 0xd8d0c0]

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t))
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/** 版面：全部用比例算，任何尺寸都排得下 */
function layout(w: number, h: number) {
  const floorY = Math.round(h * 0.7)
  const win = { x0: Math.round(w * 0.05), x1: Math.round(w * 0.33), y0: Math.round(h * 0.13), y1: Math.round(h * 0.47) }
  const shelf = { x0: Math.round(w * 0.76), x1: Math.round(w * 0.96), y0: Math.round(h * 0.14), y1: floorY }
  const deskTop = floorY - Math.max(4, Math.round(h * 0.15))
  const desk = { x0: Math.round(w * 0.38), x1: Math.round(w * 0.72), y: deskTop }
  // 桌面由左到右：杯子（4 格）、螢幕、檯燈（6 格）
  const monW = Math.max(6, Math.min(Math.round(w * 0.16), desk.x1 - desk.x0 - 11))
  const monH = Math.max(4, Math.round(h * 0.16))
  const mon = { x0: desk.x0 + 5 + Math.max(0, Math.floor((desk.x1 - desk.x0 - 11 - monW) / 2)), y1: deskTop - 2, w: monW, h: monH }
  return { floorY, win, shelf, desk, mon }
}

export function makeScene(w: number, h: number): Scene {
  const r = rng(w * 7919 + h)
  const { shelf, floorY } = layout(w, h)
  // 書櫃：每層塞滿高矮不一的書
  const books: Book[] = []
  const levels = Math.max(2, Math.floor((floorY - shelf.y0) / 7))
  const levelH = (floorY - shelf.y0) / levels
  for (let l = 0; l < levels; l++) {
    const base = Math.round(shelf.y0 + (l + 1) * levelH) - 1
    let x = shelf.x0 + 1
    while (x < shelf.x1 - 2) {
      const bw = 1 + Math.floor(r() * 2)
      if (r() < 0.12) {
        x += 2 // 偶爾空一格
        continue
      }
      const bh = Math.max(2, Math.round(levelH - 2 - r() * 2))
      books.push({ x, y: base - bh, w: Math.min(bw, shelf.x1 - 1 - x), h: bh, color: BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)] ?? 0xc0483a })
      x += bw
    }
  }
  // 螢幕上的「程式碼」：每行縮排與長度
  const code: number[][] = []
  for (let i = 0; i < 64; i++) {
    const indent = Math.floor(r() * 3)
    const len = 2 + Math.floor(r() * 9)
    code.push([indent, len, Math.floor(r() * CODE_COLORS.length)])
  }
  return { w, h, books, code }
}

export function render(scene: Scene, ms: number, isWorking: boolean): number[] {
  const { w, h } = scene
  const px: number[] = new Array(w * h).fill(0)
  const sec = ms / 1000
  const L = layout(w, h)
  const inside = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h
  const set = (x: number, y: number, c: number) => {
    if (inside(x, y)) px[y * w + x] = c
  }
  const blend = (x: number, y: number, c: number, t: number) => {
    if (inside(x, y)) px[y * w + x] = mix(px[y * w + x] ?? 0, c, t)
  }
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c)
  }

  // 牆面漸層、腰板
  const wainY = L.floorY - Math.max(3, Math.round(h * 0.1))
  for (let y = 0; y < L.floorY; y++) {
    const c = y < wainY ? mix(C.wallTop, C.wallBottom, y / wainY) : (y - wainY) % 4 === 0 ? C.wainscotDark : C.wainscot
    for (let x = 0; x < w; x++) set(x, y, c)
  }
  for (let x = 0; x < w; x++) {
    set(x, wainY, C.rail)
    if (x % 6 === 0) for (let y = wainY + 1; y < L.floorY; y++) set(x, y, C.wainscotDark)
  }

  // 木地板：橫向木條交錯
  for (let y = L.floorY; y < h; y++) {
    const row = y - L.floorY
    for (let x = 0; x < w; x++) {
      const offset = (Math.floor(row / 2) % 2) * 7
      const isSeam = row % 2 === 1 || (x + offset) % 14 === 0
      set(x, y, isSeam ? C.seam : row % 4 < 2 ? C.floorA : C.floorB)
    }
  }

  // 窗戶：夕陽漸層、太陽、飄雲、十字窗框
  const { win } = L
  for (let y = win.y0; y < win.y1; y++) {
    const t = (y - win.y0) / Math.max(1, win.y1 - win.y0 - 1)
    const sky = t < 0.5 ? mix(0x6a5aa0, 0xff8a5a, t * 2) : mix(0xff8a5a, 0xffd48a, (t - 0.5) * 2)
    for (let x = win.x0; x < win.x1; x++) set(x, y, sky)
  }
  const sunX = Math.round(win.x0 + (win.x1 - win.x0) * 0.65)
  const sunY = Math.round(win.y0 + (win.y1 - win.y0) * 0.72)
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy)
      const x = sunX + dx
      const y = sunY + dy
      if (x >= win.x0 && x < win.x1 && y >= win.y0 && y < win.y1 && d <= 3.2) blend(x, y, 0xfff0b0, d < 2.2 ? 1 : 0.5)
    }
  }
  const winW = win.x1 - win.x0
  for (let k = 0; k < 3; k++) {
    const cw = 4 + k * 2
    const cx = win.x0 + ((((sec * (0.6 + k * 0.25) + k * 13) % (winW + cw)) + winW + cw) % (winW + cw)) - cw
    const cy = win.y0 + 2 + k * 3
    for (let i = 0; i < cw; i++) {
      for (let j = 0; j < 2; j++) {
        const x = Math.round(cx + i)
        const y = cy + j
        const edge = j === 0 && (i === 0 || i === cw - 1)
        if (x >= win.x0 && x < win.x1 && y < win.y1 && !edge) blend(x, y, 0xffe8d8, 0.75)
      }
    }
  }
  // 遠方屋頂剪影
  for (let x = win.x0; x < win.x1; x++) {
    const roof = win.y1 - 2 - (Math.floor((x - win.x0) / 4) % 3 === 1 ? 2 : 0)
    for (let y = roof; y < win.y1; y++) set(x, y, 0x5a3a52)
  }
  const midX = Math.round((win.x0 + win.x1) / 2)
  const midY = Math.round((win.y0 + win.y1) / 2)
  for (let y = win.y0 - 1; y <= win.y1; y++) {
    set(win.x0 - 1, y, C.frame)
    set(win.x1, y, C.frame)
    set(midX, y, C.frameLight)
  }
  for (let x = win.x0 - 1; x <= win.x1; x++) {
    set(x, win.y0 - 1, C.frame)
    set(x, midY, C.frameLight)
  }
  rect(win.x0 - 2, win.y1, win.x1 + 2, win.y1 + 2, C.sill)

  // 串燈：垂成弧形，燈泡輪流閃
  for (let x = 0; x < w; x++) {
    const sag = 2 + Math.round(2.5 * Math.sin((x / w) * Math.PI))
    set(x, sag, C.wire)
    if (x % 5 === 2) {
      const idx = Math.floor(x / 5)
      const color = LIGHT_COLORS[idx % LIGHT_COLORS.length] ?? 0xffc04a
      const on = 0.55 + 0.45 * Math.sin(sec * 2.2 + idx * 1.9)
      set(x, sag + 1, mix(0x5a3a28, color, on))
      blend(x - 1, sag + 1, color, on * 0.25)
      blend(x + 1, sag + 1, color, on * 0.25)
      blend(x, sag + 2, color, on * 0.3)
    }
  }

  // 書櫃
  const { shelf } = L
  rect(shelf.x0, shelf.y0, shelf.x1, shelf.y1, C.shelfBack)
  for (const b of scene.books) {
    rect(b.x, b.y, b.x + b.w, b.y + b.h, b.color)
    set(b.x, b.y, mix(b.color, 0xffffff, 0.3))
  }
  const levels = Math.max(2, Math.floor((shelf.y1 - shelf.y0) / 7))
  for (let l = 0; l <= levels; l++) {
    const y = Math.round(shelf.y0 + (l * (shelf.y1 - shelf.y0)) / levels) - (l === 0 ? 0 : 1)
    for (let x = shelf.x0 - 1; x <= shelf.x1; x++) set(x, y, C.shelf)
  }
  for (let y = shelf.y0; y < shelf.y1; y++) {
    set(shelf.x0 - 1, y, C.shelf)
    set(shelf.x1, y, C.shelf)
  }

  // 地毯
  const rugCx = (L.desk.x0 + L.desk.x1) / 2
  const rugRx = (L.desk.x1 - L.desk.x0) * 0.75
  const rugCy = L.floorY + (h - L.floorY) * 0.55
  const rugRy = Math.max(2, (h - L.floorY) * 0.38)
  for (let y = L.floorY; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = ((x - rugCx) / rugRx) ** 2 + ((y - rugCy) / rugRy) ** 2
      if (d <= 1) set(x, y, d > 0.75 ? C.rugEdge : d < 0.3 ? C.rugInner : (x + y) % 4 === 0 ? C.rugEdge : C.rug)
    }
  }

  // 書桌
  const { desk } = L
  rect(desk.x0, desk.y, desk.x1, desk.y + 2, C.deskTop)
  rect(desk.x0, desk.y + 2, desk.x1, desk.y + 3, C.deskDark)
  rect(desk.x0 + 1, desk.y + 3, desk.x0 + 3, L.floorY + 1, C.desk)
  rect(desk.x1 - 3, desk.y + 3, desk.x1 - 1, L.floorY + 1, C.desk)
  const drawerX0 = desk.x1 - Math.max(6, Math.round((desk.x1 - desk.x0) * 0.35))
  rect(drawerX0, desk.y + 3, desk.x1 - 1, desk.y + Math.max(5, Math.round((L.floorY - desk.y) * 0.55)), C.desk)
  set(Math.round((drawerX0 + desk.x1) / 2), desk.y + 4, 0xe0a35a)

  // 螢幕：工作時一行行打字，待命時游標閃爍
  const { mon } = L
  const my0 = mon.y1 - mon.h
  rect(mon.x0 - 1, my0 - 1, mon.x0 + mon.w + 1, mon.y1 + 1, C.monitor)
  rect(mon.x0, my0, mon.x0 + mon.w, mon.y1, C.screen)
  rect(Math.round(mon.x0 + mon.w / 2) - 1, mon.y1 + 1, Math.round(mon.x0 + mon.w / 2) + 1, desk.y, C.monitor)
  const lines = mon.h - 1
  const typed = isWorking ? Math.floor(sec * 4) : 0
  const scroll = Math.max(0, Math.floor(typed / 6) - lines + 1)
  for (let i = 0; i < lines; i++) {
    const n = scroll + i
    const spec = scene.code[n % scene.code.length] ?? [0, 4, 0]
    const [indent = 0, len = 4, ci = 0] = spec
    const full = Math.min(len, mon.w - 2 - indent)
    // 工作中：最後一行逐字出現；待命：全部顯示完
    const shown = !isWorking ? full : n < Math.floor(typed / 6) ? full : n === Math.floor(typed / 6) ? Math.min(full, typed % 6 * 2) : 0
    for (let k = 0; k < shown; k++) set(mon.x0 + 1 + indent + k, my0 + i + (i > 0 ? 0 : 0), CODE_COLORS[ci] ?? 0xd8d0c0)
  }
  if (!isWorking && Math.floor(sec * 2) % 2 === 0) set(mon.x0 + 1, mon.y1 - 1, 0xe8e0d0)
  // 螢幕的光暈打在桌面上
  for (let x = mon.x0 - 2; x < mon.x0 + mon.w + 2; x++) blend(x, desk.y, 0x8ab8f0, isWorking ? 0.25 : 0.12)

  // 檯燈與暖光（版面太窄、會擋到螢幕就不畫）
  const lampX = desk.x1 - 3
  const hasLamp = lampX - 3 >= mon.x0 + mon.w
  if (hasLamp) {
  const shadeY = desk.y - Math.max(5, Math.round(h * 0.12))
  for (let y = shadeY + 1; y < desk.y; y++) set(lampX, y, C.lampArm)
  rect(lampX - 2, desk.y - 1, lampX + 3, desk.y, C.lampArm)
  rect(lampX - 3, shadeY, lampX + 2, shadeY + 2, C.lampShade)
  set(lampX - 2, shadeY - 1, C.lampShade)
  set(lampX - 1, shadeY - 1, C.lampShade)
  set(lampX, shadeY - 1, C.lampShade)
  const flicker = 0.92 + 0.08 * Math.sin(sec * 7.3) * Math.sin(sec * 3.1)
  set(lampX - 1, shadeY + 2, C.bulb)
  for (let y = shadeY + 2; y <= desk.y + 1; y++) {
    const spread = (y - shadeY) * 0.9
    for (let x = Math.max(mon.x0 + mon.w + 1, Math.floor(lampX - 1 - spread)); x <= Math.ceil(lampX - 1 + spread); x++) {
      const d = Math.abs(x - (lampX - 1)) / (spread + 1)
      blend(x, y, 0xffe7a0, (1 - d) * 0.28 * flicker)
    }
  }
  }

  // 馬克杯與熱氣
  const mugX = desk.x0 + 1
  rect(mugX, desk.y - 3, mugX + 3, desk.y, C.mug)
  set(mugX + 3, desk.y - 2, C.mug)
  set(mugX + 1, desk.y - 3, C.coffee)
  for (let k = 0; k < 4; k++) {
    const t = (sec * 0.8 + k * 0.25) % 1
    const y = Math.round(desk.y - 4 - t * 5)
    const x = Math.round(mugX + 1 + Math.sin(sec * 3 + k * 1.7) * 1.1)
    blend(x, y, C.steam, 0.55 * (1 - t))
  }

  // 盆栽（窗邊地上），葉子輕微擺動
  const potX = Math.max(1, win.x1 - 4)
  const potY = L.floorY + 1
  rect(potX - 2, potY - 4, potX + 3, potY + 1, C.pot)
  rect(potX - 3, potY - 5, potX + 4, potY - 4, C.potDark)
  const sway = Math.round(Math.sin(sec * 0.9))
  const leaves: [number, number][] = [[0, -6], [-1, -7], [1, -7], [-2, -8], [2, -9], [0, -9], [-1, -10], [1, -11], [-3, -10], [3, -8], [0, -12], [2, -12]]
  for (const [dx, dy] of leaves) {
    const s = dy < -9 ? sway : 0
    set(potX + dx + s, potY + dy, (dx + dy) % 2 === 0 ? C.leaf : C.leafDark)
  }

  // 地毯上睡覺的貓：蜷成一團，呼吸時背部起伏
  const catX = Math.round(rugCx - rugRx * 0.5)
  const catY = Math.round(rugCy) + 1
  const breathe = Math.sin(sec * 1.6) > 0.3 ? 1 : 0
  const body: string[] = [
    '..........',
    '.....#..#.',
    '..####oo#.',
    '.#ooooooo#',
    '#ooodooo-#',
    '#oooooood#',
    '.#dddddd#.',
  ]
  const top = breathe ? 0 : 1 // 吸氣時背拱高一格
  body.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      const y = catY - body.length + j + (j < 4 ? top : 0)
      if (ch === '#') set(catX + i, y, C.catLine)
      else if (ch === 'o') set(catX + i, y, C.cat)
      else if (ch === 'd') set(catX + i, y, C.catDark)
      else if (ch === '-') set(catX + i, y, C.catLine) // 閉著的眼睛
    }
  })
  for (let k = 0; k < 4; k++) set(catX - 1 - Math.floor(k / 2), catY - 1 - k % 2, C.catDark) // 尾巴
  if (Math.floor(sec / 1.5) % 4 === 0) blend(catX + 10, catY - 9, 0xffffff, 0.7) // 偶爾冒一個 z

  // 魯夫：待命時站在地毯旁輕晃，工作時在房間裡來回跑
  const spW = SPRITE[0]?.length ?? 0
  const spH = SPRITE.length
  const footY = Math.min(h - 1, Math.round(L.floorY + (h - L.floorY) * 0.5))
  let heroX: number
  let facingRight = false
  let hop = 0
  if (isWorking) {
    const left = Math.round(w * 0.04)
    const span = Math.max(1, w - spW - left * 2)
    const pos = (sec * 9) % (span * 2) // 每秒 9 像素
    facingRight = pos < span
    heroX = left + Math.round(facingRight ? pos : span * 2 - pos)
    hop = Math.floor(sec * 6) % 2 // 跑步時一步一跳
  } else {
    heroX = Math.round(Math.min(w - spW - 1, rugCx + rugRx * 0.25))
    hop = Math.sin(sec * 2.4) > 0.6 ? 1 : 0
  }
  for (let dx = -1; dx <= spW; dx++) blend(heroX + dx, footY + 1, 0x2a1810, 0.35) // 腳下影子
  SPRITE.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[facingRight ? row.length - 1 - i : i] ?? '.'
      const color = PALETTE[ch]
      if (color !== undefined) set(heroX + i, footY - spH + 1 + j - hop, color)
    }
  })

  // 牆上的時鐘：真的會走（分針）
  const clockX = Math.round(mon.x0 + mon.w / 2)
  const clockY = Math.max(7, Math.round(L.win.y0 + 3))
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy)
      if (d <= 3.4) set(clockX + dx, clockY + dy, d > 2.5 ? C.frame : 0xfbf3e4)
    }
  }
  const local = ms - new Date(ms).getTimezoneOffset() * 60_000 // 時鐘照本地時間
  const minute = (local / 60000) % 60
  const hour = (local / 3600000) % 12
  const hand = (frac: number, len: number, c: number) => {
    const a = frac * Math.PI * 2 - Math.PI / 2
    for (let r = 1; r <= len; r++) set(Math.round(clockX + Math.cos(a) * r), Math.round(clockY + Math.sin(a) * r), c)
  }
  hand(hour / 12, 1, 0x3a2418)
  hand(minute / 60, 2, 0x7a2a20)
  set(clockX, clockY, 0x3a2418)

  // 整體暖色調：四周稍暗
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2)
      const dy = (y - h * 0.55) / (h * 0.7)
      const v = Math.min(1, dx * dx * 0.5 + dy * dy * 0.6)
      px[y * w + x] = mix(px[y * w + x] ?? 0, 0x3a2418, v * 0.35)
    }
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
      words[k++] = px[2 * r * w + x] ?? 0
      words[k++] = px[(2 * r + 1) * w + x] ?? 0
    }
  }
  return base64(new Uint8Array(words.buffer))
}
