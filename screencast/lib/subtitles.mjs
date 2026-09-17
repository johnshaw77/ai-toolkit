import fs from 'node:fs';
import path from 'node:path';

/**
 * 把毫秒格式化成字幕時間戳。SRT 用逗號當小數點，WebVTT 用句點。
 */
export function formatTimestamp(ms, decimalSep = ',') {
  const clamped = Math.max(0, Math.round(ms));
  const h = String(Math.floor(clamped / 3600000)).padStart(2, '0');
  const m = String(Math.floor((clamped % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((clamped % 60000) / 1000)).padStart(2, '0');
  const msec = String(clamped % 1000).padStart(3, '0');
  return `${h}:${m}:${s}${decimalSep}${msec}`;
}

/**
 * 一句旁白太長時切成幾張字幕卡。先在句末標點與逗號處切成不可再分的小塊，
 * 再貪婪地塞回 maxChars 以內。切不動（沒有標點的長句）就原樣留著，
 * 寧可一行長字幕，也不要把句子從中間硬斷。
 */
function splitText(text, maxChars) {
  const t = String(text).trim();
  if (t.length <= maxChars) return [t];

  const atoms = t.split(/(?<=[。！？!?，,、；;：:])/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let buf = '';
  for (const a of atoms) {
    if (buf && buf.length + a.length > maxChars) {
      out.push(buf);
      buf = a;
    } else {
      buf += a;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [t];
}

/**
 * 把一段 [startMs, endMs] 的旁白切成多張字幕卡，時間按字數比例分配。
 *
 * 注意這是**估算**：我們只知道整句話的音檔總長，不知道每個字實際唸多久，
 * 所以是假設語速均勻。一般操作教學的口白夠用；需要逐字精準對時
 * （例如卡拉 OK 式高亮）得另外跑 forced alignment，這裡不做。
 */
function cuesForNarration(text, startMs, endMs, maxChars) {
  const pieces = splitText(text, maxChars);
  if (pieces.length === 1) return [{ startMs, endMs, text: pieces[0] }];

  const totalChars = pieces.reduce((n, p) => n + p.length, 0);
  const span = endMs - startMs;
  const cues = [];
  let acc = 0;
  for (const piece of pieces) {
    const from = startMs + Math.round((acc / totalChars) * span);
    acc += piece.length;
    const to = startMs + Math.round((acc / totalChars) * span);
    cues.push({ startMs: from, endMs: to, text: piece });
  }
  return cues;
}

/**
 * 從 manifest 的 steps 產出字幕 cue 清單。
 *
 * 字幕的時間軸**不等於 step 的時間軸**：`lib/record-engine.mjs` 是先把動作做完
 * 才開始播旁白，所以旁白起點在 step 中間。有 `narrationStartMs` 就直接用；
 * 舊的錄影沒存這個欄位，呼叫端可以傳 `fallbackDurationMs(step)` 進來，
 * 用音檔長度從 `tEndMs` 往回推。
 */
export function cuesFromManifest(steps, { maxCharsPerCue = 18, fallbackDurationMs } = {}) {
  const cues = [];
  for (const step of steps) {
    if (!step.narration) continue;

    let startMs = step.narrationStartMs;
    let endMs;
    if (typeof startMs === 'number' && typeof step.narrationDurationMs === 'number') {
      endMs = startMs + step.narrationDurationMs;
    } else {
      const dur = fallbackDurationMs?.(step);
      if (typeof dur !== 'number' || !Number.isFinite(dur)) continue;
      endMs = step.tEndMs;
      startMs = endMs - dur;
    }
    cues.push(...cuesForNarration(step.narration, startMs, endMs, maxCharsPerCue));
  }
  return cues;
}

export function buildSrt(cues) {
  return cues
    .map((c, i) => `${i + 1}\n${formatTimestamp(c.startMs)} --> ${formatTimestamp(c.endMs)}\n${c.text}\n`)
    .join('\n');
}

export function buildVtt(cues) {
  const body = cues
    .map((c) => `${formatTimestamp(c.startMs, '.')} --> ${formatTimestamp(c.endMs, '.')}\n${c.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

/**
 * 寫出 <basename>.srt 與 <basename>.vtt，回傳兩個路徑。
 * 兩種都給：.srt 給剪輯軟體和上字幕工具，.vtt 給網頁 <video><track>
 * （.webm 不吃外掛 .srt，包成 HTML 分享時要的是 .vtt）。
 */
export function writeSubtitles(outDir, cues, basename = 'demo') {
  if (!cues.length) return {};
  fs.mkdirSync(outDir, { recursive: true });
  const srtPath = path.join(outDir, `${basename}.srt`);
  const vttPath = path.join(outDir, `${basename}.vtt`);
  fs.writeFileSync(srtPath, buildSrt(cues), 'utf-8');
  fs.writeFileSync(vttPath, buildVtt(cues), 'utf-8');
  return { srtPath, vttPath };
}
