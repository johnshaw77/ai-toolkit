// 搬運動畫：token 方塊一排排流進右邊正在處理的檔案，小搬 推著推車在地上來回走；每次工具呼叫車上裝滿貨

export const H = 12 // 像素高；Raster 一格放上下兩個像素 → 6 行
export const DEFAULT = 0x01000000 // 透出終端機背景

const BOT = 0x5eead4
const EYE = 0x0f2828
// 天線燈：平常綠燈閃，工具呼叫失敗後恆亮紅燈
const LAMP_OK = 0x4ade80
const LAMP_OK_DIM = 0x1f5a35
const LAMP_FAIL = 0xff3b3b
const STAR = 0x5b6170
const GROUND_TOP = 0x8b5a2b
const GROUND = 0x5c4033
const FILE_RIM = 0xc4553a
const FILE_GLOW = 0xff9a6a
const FILE_IN = 0x2a2230
const LABEL = 0xe8825f
const CART = 0xe8b07a
const WHEEL = 0x9ca3af
export const TOKEN_COLORS = [0xd9a55a, 0xc08a3e, 0x9a9a3a, 0xe0b060, 0xb87a35] as const

export const LANES = [2, 4, 6] as const
export const SPEED = 0.02 // 方塊每毫秒走幾像素（每秒 20 格）
export const CART_MS = 2_500
const FILE_W = 18
const LANE_START = 16

export type Block = { born: number; lane: number; color: number }
export type World = {
  now: number
  frame: number
  blocks: readonly Block[]
  label: string
  cartAt?: number
  glowAt?: number
  /** 最近一次工具呼叫失敗（被拒或出錯），之後有一次成功就解除 */
  isFailing?: boolean
}

/** 一個像素格可以帶字（檔名）：[codepoint, fg, bg] */
export type Overlay = Map<number, { ch: string; fg: number; bg: number }>

export const fileX = (w: number): number => w - FILE_W - 2
export const blockX = (b: Block, now: number): number => LANE_START + (now - b.born) * SPEED
export const hasArrived = (b: Block, now: number, w: number): boolean => blockX(b, now) >= fileX(w) - 1

// 簡單的定值亂數，星星位置每次一樣
function stars(w: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  let s = 7
  for (let i = 0; i < Math.floor(w / 9); i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    out.push({ x: s % w, y: (s >> 8) % 9 })
  }
  return out
}

// 面向右的樣子；往左時左右鏡像
// 小搬：方塊頭機器人，頭頂天線燈（@），第 3 列手臂伸直搭在推車把手上
const BODY = [
  '.....@......',
  '..#######...',
  '..#E###E####',
  '..#######...',
] as const
const LEGS = [
  ['...#...#....', '..##..##....'],
  ['....#...#...', '...##..##...'],
] as const
const CART_ROWS = [
  'h..ccc.', // y5：把手、貨物
  'h######', // y6：手臂剛好搭在這一列
  '.######',
  '.######',
  '..o..o.', // y9：輪子
] as const

const BOT_W = 12
const CART_W = 7
const WALK_SPEED = 0.01 // 每毫秒走幾像素（每秒 10 格）

type Set = (x: number, y: number, c: number) => void

/** 來回走：x 是 小搬 加推車這一組的左緣，dir 1 往右、-1 往左，step 決定腳步 */
export function walker(w: number, now: number): { x: number; dir: 1 | -1; step: number } {
  const span = Math.max(1, fileX(w) - 2 - BOT_W - CART_W)
  const period = (2 * span) / WALK_SPEED
  const t = ((now % period) + period) % period
  const isOut = t < period / 2
  const x = isOut ? t * WALK_SPEED : (period - t) * WALK_SPEED
  return { x: Math.round(x), dir: isOut ? 1 : -1, step: Math.floor((t * WALK_SPEED) / 3) }
}

function drawBot(set: Set, x0: number, dir: 1 | -1, step: number, frame: number, isFailing: boolean): void {
  const at = (x: number) => (dir === 1 ? x0 + x : x0 + BOT_W - 1 - x)
  const isBlink = frame % 40 === 0
  const lamp = isFailing ? LAMP_FAIL : frame % 10 < 5 ? LAMP_OK : LAMP_OK_DIM
  BODY.forEach((row, r) => {
    ;[...row].forEach((c, x) => {
      if (c === '#') set(at(x), 4 + r, BOT)
      if (c === 'E') set(at(x), 4 + r, isBlink ? BOT : EYE)
      if (c === '@') set(at(x), 4 + r, lamp)
    })
  })
  const legs = LEGS[step % 2] ?? LEGS[0]
  legs.forEach((row, r) => {
    ;[...row].forEach((c, x) => {
      if (c === '#') set(at(x), 8 + r, BOT)
    })
  })
}

function drawCart(set: Set, x0: number, dir: 1 | -1, isLoaded: boolean, step: number): void {
  // 往右推時把手在車的左邊（靠 小搬），往左推時在右邊
  const at = (x: number) => (dir === 1 ? x0 + x : x0 + CART_W - 1 - x)
  CART_ROWS.forEach((row, r) => {
    ;[...row].forEach((c, x) => {
      const y = 5 + r
      if (c === 'h' || c === '#') set(at(x), y, CART)
      if (c === 'c' && isLoaded) set(at(x), y, TOKEN_COLORS[x % TOKEN_COLORS.length] ?? CART)
      if (c === 'o') set(at(x), y, step % 2 === 0 ? WHEEL : 0x6b7280)
    })
  })
}

// ── 背景：黃昏城市 ─────────────────────────────────────────

const SKY_TOP = 0x141a2e
const SKY_LOW = 0x5a3462
const MOON = 0xf5e6b8
const CLOUD = 0x2a3150
const CITY = 0x161a2e
const CITY_FAR = 0x262a45
const WINDOW_ON = 0x7fb3e0 // 冷色，跟暖色的 token 方塊分得開
const WINDOW_OFF = 0x262b48
const POLE = 0x4b5563
const LAMP = 0xfff4dc

export function mix(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// 定值亂數：同樣的 i 永遠得到同樣的數，建築與窗戶每次畫都一樣
const hash = (i: number): number => {
  let x = (i * 2654435761) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 2246822519) >>> 0
  return (x ^ (x >>> 13)) >>> 0
}

function drawBackdrop(set: Set, w: number, now: number, frame: number): void {
  // 天空：上深藍、下紫
  for (let y = 0; y < 10; y++) {
    const c = mix(SKY_TOP, SKY_LOW, y / 9)
    for (let x = 0; x < w; x++) set(x, y, c)
  }

  // 星星：只在上半部，慢慢閃
  stars(w).forEach((st, i) => {
    if (st.y <= 4 && (i * 7 + Math.floor(frame / 4)) % 5 !== 0) set(st.x, st.y, STAR)
  })

  // 彎月
  const mx = Math.floor(w * 0.42)
  for (const [dx, dy] of [[1, 0], [2, 0], [0, 1], [0, 2], [1, 3], [2, 3]] as const) set(mx + dx, dy, MOON)
  set(mx + 1, 1, mix(MOON, SKY_TOP, 0.5))
  set(mx + 1, 2, mix(MOON, SKY_TOP, 0.5))

  // 雲：慢慢往左飄，飄出去從右邊回來
  for (let i = 0; i < Math.max(2, Math.floor(w / 45)); i++) {
    const len = 6 + (hash(i + 50) % 6)
    const y = 1 + (hash(i + 70) % 2)
    const x0 = (((hash(i + 90) % w) - now * 0.0015) % (w + len) + w + len) % (w + len) - len
    for (let x = 0; x < len; x++) set(Math.floor(x0) + x, y, CLOUD)
    for (let x = 1; x < len - 1; x++) set(Math.floor(x0) + x, y - 1, mix(CLOUD, SKY_TOP, 0.4))
  }

  // 遠景：兩層城市剪影，近的那層有窗戶，燈一盞盞亮起熄滅
  let x = 0
  for (let b = 0; x < w; b++) {
    const bw = 3 + (hash(b + 300) % 4)
    const top = 5 + (hash(b + 400) % 3)
    for (let dx = 0; dx < bw; dx++) for (let y = top; y < 10; y++) set(x + dx, y, CITY_FAR)
    x += bw
  }
  x = 2
  for (let b = 0; x < w; b++) {
    const bw = 4 + (hash(b + 100) % 5)
    const top = 6 + (hash(b + 200) % 3)
    for (let dx = 0; dx < bw; dx++) {
      for (let y = top; y < 10; y++) {
        const isWindow = dx > 0 && dx < bw - 1 && y > top && (dx + y) % 2 === 0
        if (!isWindow) {
          set(x + dx, y, CITY)
          continue
        }
        const id = (x + dx) * 31 + y
        const isOn = (hash(id) + Math.floor(frame / 25) * (hash(id + 7) % 3 === 0 ? 1 : 0)) % 3 === 0
        set(x + dx, y, isOn ? WINDOW_ON : WINDOW_OFF)
      }
    }
    x += bw + 1 + (hash(b + 500) % 3)
  }

  // 路燈：燈下一圈暖光
  for (let lx = 9; lx < w - 22; lx += 26) {
    for (let y = 5; y < 10; y++) set(lx, y, POLE)
    set(lx + 1, 5, POLE)
    set(lx + 2, 5, LAMP)
    for (const [dx, dy, t] of [[2, 6, 0.55], [1, 6, 0.75], [3, 6, 0.75], [2, 7, 0.8]] as const) {
      set(lx + dx, dy, mix(LAMP, SKY_LOW, t))
    }
  }
}

export function render(w: number, world: World): { px: number[]; overlay: Overlay } {
  const px = new Array<number>(w * H).fill(DEFAULT)
  const overlay: Overlay = new Map()
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && x < w && y >= 0 && y < H) px[y * w + Math.floor(x)] = c
  }
  const { now, frame } = world

  drawBackdrop(set, w, now, frame)

  // 地面
  for (let x = 0; x < w; x++) {
    set(x, 10, GROUND_TOP)
    set(x, 11, GROUND)
  }

  // 檔案：頂上一塊標籤，外框收到方塊時亮一下
  const fx = fileX(w)
  const isGlowing = world.glowAt !== undefined && now - world.glowAt < 160
  const rim = isGlowing ? FILE_GLOW : FILE_RIM
  for (let x = fx + 3; x < fx + 10; x++) set(x, 1, rim)
  for (let y = 2; y <= 9; y++) {
    for (let x = fx; x < fx + FILE_W; x++) {
      const isEdge = y === 2 || y === 9 || x === fx || x === fx + FILE_W - 1
      set(x, y, isEdge ? rim : FILE_IN)
    }
  }
  // 檔名寫在第 4 行（像素 6–7），置中、太長就截掉
  const text = world.label.length > FILE_W - 4 ? `${world.label.slice(0, FILE_W - 5)}…` : world.label
  const start = fx + Math.floor((FILE_W - text.length) / 2)
  ;[...text].forEach((ch, i) => overlay.set(3 * w + start + i, { ch, fg: LABEL, bg: FILE_IN }))

  // token 方塊：一排排往右流
  for (const b of world.blocks) {
    const x = blockX(b, now)
    if (x < fx - 1) set(x, LANES[b.lane] ?? 2, b.color)
  }

  // 小搬 推著推車來回走：往右時車在右邊，走到檔案前轉身推回左邊
  const walk = walker(w, now)
  const isLoaded = world.cartAt !== undefined && now - world.cartAt < CART_MS
  const botX = walk.dir === 1 ? walk.x : walk.x + CART_W
  const cartX = walk.dir === 1 ? walk.x + BOT_W : walk.x
  drawCart(set, cartX, walk.dir, isLoaded, walk.step)
  drawBot(set, botX, walk.dir, walk.step, frame, world.isFailing === true)

  return { px, overlay }
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

/** 每格用 ▀ 放上下兩個像素；帶字的格子改放那個字 */
export function toCells(px: readonly number[], w: number, overlay: Overlay): string {
  const rows = H / 2
  const words = new Uint32Array(w * rows * 3)
  let k = 0
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < w; x++) {
      const o = overlay.get(r * w + x)
      if (o !== undefined) {
        words[k++] = o.ch.codePointAt(0) ?? 0x20
        words[k++] = o.fg
        words[k++] = o.bg
      } else {
        words[k++] = 0x2580
        words[k++] = px[2 * r * w + x] ?? DEFAULT
        words[k++] = px[(2 * r + 1) * w + x] ?? DEFAULT
      }
    }
  }
  return base64(new Uint8Array(words.buffer))
}

/** 工具呼叫要顯示在檔案上的名字 */
export function labelOf(tool: string, args: Readonly<Record<string, unknown>>): string {
  const path = args['file_path'] ?? args['notebook_path']
  if (typeof path === 'string') return path.split('/').pop() ?? path
  if (tool === 'Bash' && typeof args['command'] === 'string') return `$ ${args['command'].trim().split(/\s+/)[0] ?? ''}`
  if (typeof args['pattern'] === 'string') return `/${args['pattern']}/`
  return tool
}
