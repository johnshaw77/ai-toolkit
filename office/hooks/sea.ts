// 海上冒險：航行（工作中）、靠岸（待命）、暴風雨（出錯）

import { PALETTE, SPRITE } from './luffy'

export type SeaMode = 'sail' | 'dock' | 'storm'

function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t))
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

const SKY: Record<SeaMode, [number, number]> = {
  sail: [0x4aa8e8, 0xcfeefa],
  dock: [0x5a4a8a, 0xffb070],
  storm: [0x1a1d26, 0x3e4450],
}
const SEA: Record<SeaMode, [number, number]> = {
  sail: [0x2a8ad0, 0x0e4a8a],
  dock: [0x6a5a9a, 0x2a2a5a],
  storm: [0x3a4a58, 0x141c24],
}

// 草帽海賊旗：骷髏戴草帽（7×6）
const JOLLY = ['..YYY..', '.YRRRY.', 'YYYYYYY', '.WWWWW.', '.WKWKW.', '..WWW..']
const JOLLY_PAL: Record<string, number> = { Y: 0xe8c078, R: 0xd4121e, W: 0xffffff, K: 0x101010 }

export function renderSea(w: number, h: number, ms: number, mode: SeaMode): number[] {
  const px: number[] = new Array(w * h).fill(0)
  const sec = ms / 1000
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

  const horizon = Math.round(h * 0.42)
  const rough = mode === 'storm' ? 2.2 : mode === 'sail' ? 1 : 0.45
  const speed = mode === 'dock' ? 0.15 : mode === 'storm' ? 1.4 : 1 // 海面往左捲的速度：船往右開

  // 天空
  const [skyTop, skyBottom] = SKY[mode]
  for (let y = 0; y < horizon; y++) {
    const c = mix(skyTop, skyBottom, y / horizon)
    for (let x = 0; x < w; x++) set(x, y, c)
  }

  // 太陽（航行）／夕陽（靠岸）
  if (mode !== 'storm') {
    const sx = mode === 'sail' ? Math.round(w * 0.8) : Math.round(w * 0.3)
    const sy = mode === 'sail' ? Math.round(horizon * 0.25) : horizon - 2
    const sr = mode === 'sail' ? 3.2 : 4.5
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const d = Math.hypot(dx, dy)
        if (sy + dy >= horizon) continue
        if (d <= sr) set(sx + dx, sy + dy, mode === 'sail' ? 0xfff6c8 : 0xffd27a)
        else if (d <= sr + 2.5) blend(sx + dx, sy + dy, 0xffffff, 0.25 * (1 - (d - sr) / 2.5))
      }
    }
  }

  // 雲：航行白雲、暴風雨烏雲
  const cloudCount = mode === 'storm' ? 6 : 3
  for (let k = 0; k < cloudCount; k++) {
    const cw = 6 + Math.round(hash(k) * 8) + (mode === 'storm' ? 6 : 0)
    const span = w + cw
    const cx = Math.round((((hash(k + 9) * span - sec * (0.8 + k * 0.3) * speed) % span) + span) % span) - cw
    const cy = Math.round(2 + hash(k + 3) * horizon * 0.5)
    const col = mode === 'storm' ? (k % 2 === 0 ? 0x1c1f26 : 0x30343e) : mode === 'dock' ? 0xffc8a0 : 0xffffff
    for (let i = 0; i < cw; i++) {
      const hgt = mode === 'storm' ? 4 : 2
      for (let j = 0; j < hgt; j++) {
        if (j === 0 && (i < 2 || i > cw - 3)) continue
        blend(cx + i, cy + j, col, mode === 'storm' ? 0.95 : 0.85)
      }
    }
  }

  // 遠方小島剪影
  if (mode !== 'storm') {
    for (let x = 0; x < w; x++) {
      const bump = Math.max(0, 2.5 * Math.sin((x - w * 0.1) / 5) + 1.2 * Math.sin(x / 2.3))
      if (x > w * 0.05 && x < w * 0.35) for (let y = horizon - Math.round(bump); y < horizon; y++) set(x, y, mode === 'dock' ? 0x4a3a6a : 0x6a9ab8)
    }
  }

  // 海面：一層層往左捲的浪，越近越深、浪越大
  const [seaTop, seaBottom] = SEA[mode]
  for (let y = horizon; y < h; y++) {
    const t = (y - horizon) / (h - horizon)
    const base = mix(seaTop, seaBottom, t)
    for (let x = 0; x < w; x++) {
      const depth = 0.4 + t * 2.2
      const crest = Math.sin(x / (3 + t * 6) + sec * 1.2 * speed * depth + y * 1.7) * Math.sin(x / 11 - sec * 0.5 + y)
      let c = base
      if (crest > 0.82 - rough * 0.08) c = mix(base, 0xffffff, 0.55 * Math.min(1, rough + 0.3))
      else if (crest > 0.55) c = mix(base, 0xffffff, 0.12)
      set(x, y, c)
    }
  }
  // 夕陽／太陽倒影
  if (mode !== 'storm') {
    const rx = mode === 'sail' ? Math.round(w * 0.8) : Math.round(w * 0.3)
    for (let y = horizon; y < h; y++) {
      const wob = Math.round(Math.sin(y * 1.3 + sec * 3) * 1.5)
      if ((y + Math.floor(sec * 4)) % 2 === 0) blend(rx + wob, y, 0xfff0b0, 0.5 * (1 - (y - horizon) / (h - horizon)))
    }
  }

  // 靠岸的小島：沙灘與椰子樹
  if (mode === 'dock') {
    const ix = Math.round(w * 0.84)
    const iy = horizon + Math.round((h - horizon) * 0.35)
    const ir = Math.max(8, Math.round(w * 0.2))
    for (let y = iy - 6; y <= iy + 2; y++) {
      for (let x = ix - ir; x <= ix + ir; x++) {
        const d = ((x - ix) / ir) ** 2 + ((y - iy) / 4) ** 2
        if (y <= iy && d <= 1) set(x, y, d > 0.75 ? 0xe8c890 : 0xd8a868)
      }
    }
    // 椰子樹
    const tx = ix + Math.round(ir * 0.25)
    for (let k = 0; k < 12; k++) set(tx + Math.round(Math.sin(k / 4) * 1.5), iy - 4 - k, 0x8a5a32)
    const topX = tx + Math.round(Math.sin(11 / 4) * 1.5)
    const topY = iy - 16
    const sway = Math.sin(sec * 1.2) * 0.6
    for (const dir of [-1, 1]) {
      for (let k = 1; k <= 6; k++) {
        set(topX + dir * k, topY + Math.round(k * k * 0.12 + sway * k * 0.2), k % 2 ? 0x3a8a3a : 0x2a6a2a)
        set(topX + dir * k, topY + 1 + Math.round(k * k * 0.12 + sway * k * 0.2), 0x2a6a2a)
      }
    }
    set(topX, topY - 1, 0x3a8a3a)
    set(topX - 1, topY + 1, 0x6a4020)
    set(topX + 1, topY + 1, 0x6a4020)
  }

  // ── 船 ──
  const shipW = Math.max(36, Math.min(72, Math.round(w * 0.8)))
  // 靠岸時船尾超出左邊界，把右邊讓給小島
  const shipX = mode === 'dock' ? -Math.round(shipW * 0.28) : Math.round((w - shipW) / 2)
  const bob = Math.round(Math.sin(sec * (mode === 'storm' ? 2.6 : 1.4)) * (mode === 'storm' ? 2 : mode === 'sail' ? 1 : 0.6))
  const deckY = Math.round(horizon + (h - horizon) * 0.42) + bob
  const hullH = Math.max(7, Math.round(h * 0.13))

  // 船身：上寬下窄，橘黃色帶、木板線
  for (let j = 0; j < hullH; j++) {
    const inset = Math.round((j / hullH) ** 1.6 * shipW * 0.18)
    for (let x = shipX + inset; x < shipX + shipW - inset - Math.round(j * 0.6); x++) {
      const c = j === 0 ? 0xffffff : j === 1 ? 0x2a1a10 : j < hullH * 0.45 ? 0xe8a040 : j % 2 ? 0x8a4a22 : 0x7a3e1c
      set(x, deckY + j, c)
    }
  }
  // 圓窗
  const portY = deckY + Math.round(hullH * 0.55)
  for (let x = shipX + Math.round(shipW * 0.2); x < shipX + shipW * 0.8; x += 6) {
    set(x, portY, 0x2a1a10)
    set(x + 1, portY, 0x2a1a10)
    set(x, portY - 1, 0xffe8a0)
    set(x + 1, portY - 1, 0x2a1a10)
  }
  // 欄杆
  for (let x = shipX + 1; x < shipX + shipW - 2; x++) {
    set(x, deckY - 2, 0x8a4a22)
    if (x % 3 === 0) set(x, deckY - 1, 0x8a4a22)
  }
  // 船底倒影
  for (let x = shipX + 3; x < shipX + shipW - 4; x++) for (let k = 0; k < 2; k++) blend(x, deckY + hullH + k, 0x000000, 0.25 - k * 0.1)

  // 獅子船首（右側）
  const lx = shipX + shipW - 2
  const ly = deckY - 3
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dy)
      if (d <= 4.3) set(lx + dx, ly + dy, d > 2.6 ? 0xe86a1a : 0xf8d050) // 外圈鬃毛、內圈臉
    }
  }
  set(lx - 1, ly - 1, 0x2a1a10)
  set(lx + 1, ly - 1, 0x2a1a10)
  set(lx, ly + 1, 0x8a3a10)

  // 主桅與帆
  const mastX = shipX + Math.round(shipW * 0.3)
  const mastTop = Math.max(2, deckY - Math.round(h * 0.42))
  for (let y = mastTop; y < deckY; y++) set(mastX, y, 0x6a3a1a)
  const sailW = Math.max(12, Math.round(shipW * 0.42))
  const sailTop = mastTop + 3
  const sailBottom = deckY - Math.round(h * 0.1)
  const gust = mode === 'dock' ? 0 : mode === 'storm' ? 3 : 2
  for (let y = sailTop; y < sailBottom; y++) {
    const t = (y - sailTop) / Math.max(1, sailBottom - sailTop)
    const belly = Math.round(Math.sin(t * Math.PI) * (gust + Math.sin(sec * 2) * 0.6))
    const x0 = mastX - Math.round(sailW / 2) + belly
    const x1 = mastX + Math.round(sailW / 2) + belly
    for (let x = x0; x < x1; x++) set(x, y, x === x0 || x === x1 - 1 ? 0xd8d0c0 : 0xfaf6ec)
  }
  for (let x = mastX - Math.round(sailW / 2) - 1; x <= mastX + Math.round(sailW / 2) + 1; x++) set(x, sailTop - 1, 0x6a3a1a)
  // 帆上的海賊旗
  const jx = mastX - 3 + Math.round(gust * 0.6)
  const jy = Math.round((sailTop + sailBottom) / 2) - 3
  JOLLY.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = JOLLY_PAL[row[i] ?? '.']
      if (c !== undefined) set(jx + i, jy + j, c)
    }
  })
  // 桅頂黑旗飄動
  for (let i = 0; i < 6; i++) {
    const wave = Math.round(Math.sin(sec * 6 - i * 0.9) * (mode === 'dock' ? 0.3 : 1))
    set(mastX + 1 + i, mastTop + wave, 0x101010)
    set(mastX + 1 + i, mastTop + 1 + wave, 0x101010)
  }

  // 魯夫站在甲板前段
  const spW = SPRITE[0]?.length ?? 0
  const spH = SPRITE.length
  const heroX = Math.min(shipX + shipW - spW - 6, mastX + Math.round(sailW / 2) + 3)
  const hop = mode === 'sail' && Math.floor(sec * 2) % 4 === 0 ? 1 : 0
  SPRITE.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[row.length - 1 - i] ?? '.' // 面向右（船頭）
      const c = PALETTE[ch]
      if (c !== undefined) set(heroX + i, deckY - spH + j - hop, c)
    }
  })

  // 海鷗
  if (mode !== 'storm') {
    for (let k = 0; k < 3; k++) {
      const gx = Math.round(((hash(k + 20) * w + sec * (2 + k)) % (w + 6)) - 3)
      const gy = Math.round(4 + hash(k + 30) * horizon * 0.4 + Math.sin(sec * 2 + k) * 1.5)
      const flap = Math.floor(sec * 4 + k) % 2
      set(gx, gy, 0x404040)
      set(gx - 1, gy - flap, 0x404040)
      set(gx + 1, gy - flap, 0x404040)
      set(gx - 2, gy - 1 + flap, 0x404040)
      set(gx + 2, gy - 1 + flap, 0x404040)
    }
  }

  // 暴風雨：雨絲與閃電
  if (mode === 'storm') {
    for (let k = 0; k < w * h * 0.012; k++) {
      const rx = Math.round(hash(k) * w - ((sec * 30 + hash(k + 1) * h) % h) * 0.4)
      const ry = Math.round((hash(k + 2) * h + sec * 40) % h)
      blend(((rx % w) + w) % w, ry, 0xb8c8d8, 0.55)
      blend(((rx - 1) % w + w) % w, ry - 1, 0xb8c8d8, 0.3)
    }
    const flash = sec % 3.5 < 0.18
    if (flash) {
      for (let i = 0; i < px.length; i++) px[i] = mix(px[i] ?? 0, 0xffffff, 0.45)
      let bx = Math.round(w * (0.15 + hash(Math.floor(sec / 3.5)) * 0.7))
      for (let y = 0; y < horizon; y++) {
        bx += y % 3 === 0 ? (hash(y + sec) > 0.5 ? 1 : -1) : 0
        set(bx, y, 0xfffbe0)
      }
    }
  }
  return px
}
