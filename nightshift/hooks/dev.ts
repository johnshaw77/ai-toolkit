// 主角：毛帽大鬍子工程師坐在書桌前開筆電（30×22），配色照參考圖

import { sprite } from './pix'
import type { Canvas } from './pix'

export type Mood = 'idle' | 'work' | 'error' | 'done'
export type State = { mood: Mood; since: number }

export const DEV_W = 30
export const DEV_H = 22

const PAL: Record<string, number> = {
  K: 0x3d4a6b, // 毛帽
  k: 0x5b6b8c, // 毛帽反摺
  E: 0xe8833a, // 耳朵
  F: 0xf5b13d, // 臉
  A: 0xf5b13d, // 手
  o: 0x2a2f45, // 眼睛
  g: 0x4a5675, // 鬍子（嘴邊）
  G: 0x5b6b8c, // 鬍子
  W: 0xe6edf5, // 白 T
  L: 0x5a6a8a, // 筆電
  l: 0x9aa8c0, // 筆電 logo
  T: 0xc3cfe0, // 桌面
  t: 0x8d9bb5, // 桌緣
  U: 0x5a6a8a, // 桌下
  u: 0x8d9bb5, // 桌腳
  P: 0x8d9bb5, // 檯燈
  p: 0x5a6a8a, // 燈桿
  Y: 0x5a6a8a, // 燈泡（亮的時候換色）
  '1': 0xe9d5a8, // 紙
  '2': 0xe0a870,
  '3': 0xf5f7fb,
  M: 0x8d9bb5, // 馬克杯
  C: 0xe0a870, // 可可
  B: 0x5a6a8a, // 垃圾桶
  b: 0x3d4a6b,
  N: 0x8d9bb5,
  O: 0xe0a870, // 紙團
  S: 0x7dd3fc, // 汗滴
  R: 0xff6b6b, // 筆電紅燈
}

const BASE = [
  '................KKKKK.........',
  '...............KKKKKKK........',
  '...............KKKKKKK........',
  '...............kkkkkkk........',
  '...............EFFFFFE........',
  '......PP.......EFoFoFE........',
  '.....PPPP.......FoFoF.........',
  '.....pYYp.......FgggF.........',
  '.....p.......WWWGGGGGWWW......',
  '.....p.......WWWWGGGWWWW......',
  '.....p.......WWWWWWWWWWW......',
  '.....p.......AWWWWWWWWWA......',
  '....TpTTTTTTTAALLLLLLLAATMCMT.',
  '....PPPPTTTTTAALLLlLLLAATMMMMT',
  '.OO.PPPP123TTTTLLLLLLLTTTMMMMT',
  'NNNNTTTT1223TTTLLLLLLLTTTMMMT.',
  'BbBbTTTTT2233TTTTTTTTTTTTTTTT.',
  'bBbBTTTTTT33TTTTTTTTTTTTTTTTT.',
  'BbBbttttttttttttttttttttttttt.',
  'bBbB.UUUUUUUUUUUUUUUUUUUUUUU..',
  'BbBb.UUUUUUUUUUUUUUUUUUUUUUU..',
  'bBbB..uu...............uu.....',
]

const put = (rows: string[], x: number, y: number, ch: string): void => {
  const r = rows[y]
  if (r !== undefined) rows[y] = r.slice(0, x) + ch + r.slice(x + ch.length)
}

/** 這個狀態這一刻的字元圖 */
export function devRows(s: State): string[] {
  const rows = [...BASE]
  const blink = s.since % 3_000 > 2_850
  if (blink) {
    put(rows, 17, 5, 'F')
    put(rows, 19, 5, 'F')
  }
  if (s.mood === 'work') {
    // 兩手輪流敲鍵盤
    const left = Math.floor(s.since / 180) % 2 === 0
    put(rows, 14, 12, left ? 'A' : 'L')
    put(rows, 22, 12, left ? 'L' : 'A')
  }
  if (s.mood === 'work' || s.mood === 'done') put(rows, 6, 7, 'YY') // 檯燈亮
  if (s.mood === 'error') {
    put(rows, 22, 4, 'S')
    put(rows, 22, 5, 'S')
    put(rows, 18, 13, 'R') // 筆電亮紅燈
  }
  if (s.mood === 'done') {
    // 雙手舉高
    put(rows, 13, 11, 'W')
    put(rows, 23, 11, 'W')
    put(rows, 13, 12, 'TT')
    put(rows, 22, 12, 'TT')
    for (let y = 4; y <= 10; y++) {
      put(rows, 13, y, 'A')
      put(rows, 23, y, 'A')
    }
    put(rows, 17, 7, 'FFF') // 笑：鬍子讓出嘴
  }
  return rows
}

export const LAMP_ON = 0xfff1b8

export function drawDev(c: Canvas, s: State, ox: number, oy: number, scale: number): void {
  const pal = s.mood === 'work' || s.mood === 'done' ? { ...PAL, Y: LAMP_ON } : PAL
  sprite(c, devRows(s), pal, ox, oy, scale)
}

/** 筆電中心、杯口的位置（畫粒子用），以主角左上角為原點、未放大 */
export const LAPTOP = { x: 18, y: 12 }
export const MUG = { x: 26, y: 11 }
