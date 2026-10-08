// 像素畫布小工具：一格 Raster 用 ▀ 放上下兩個像素

export const DEFAULT = 0x01000000 // 透出終端機背景

export type Canvas = { w: number; h: number; px: number[] }

export const canvas = (w: number, h: number, fill: number): Canvas => ({ w, h, px: new Array<number>(w * h).fill(fill) })

export function set(c: Canvas, x: number, y: number, color: number): void {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  if (xi < 0 || yi < 0 || xi >= c.w || yi >= c.h) return
  c.px[yi * c.w + xi] = color
}

export const get = (c: Canvas, x: number, y: number): number => c.px[Math.floor(y) * c.w + Math.floor(x)] ?? DEFAULT

export function rect(c: Canvas, x: number, y: number, w: number, h: number, color: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(c, x + i, y + j, color)
}

export function disc(c: Canvas, cx: number, cy: number, r: number, color: number): void {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) set(c, cx + x, cy + y, color)
}

/** 字元圖 → 畫布；'.' 與調色盤沒有的字元透明；scale 倍放大 */
export function sprite(c: Canvas, rows: readonly string[], pal: Readonly<Record<string, number>>, ox: number, oy: number, scale = 1): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = pal[row[x] ?? '.']
      if (color === undefined) continue
      rect(c, ox + x * scale, oy + y * scale, scale, scale, color)
    }
  })
}

/** 定值雜湊亂數 0～1：同樣的輸入每次一樣，畫面才不會亂閃 */
export function hash(a: number, b = 0, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t))
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export function toCells(c: Canvas): string {
  const rows = Math.floor(c.h / 2)
  const words = new Uint32Array(c.w * rows * 3)
  let k = 0
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < c.w; x++) {
      words[k++] = 0x2580
      words[k++] = c.px[2 * r * c.w + x] ?? DEFAULT
      words[k++] = c.px[(2 * r + 1) * c.w + x] ?? DEFAULT
    }
  }
  return base64(new Uint8Array(words.buffer))
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
