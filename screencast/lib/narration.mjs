import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// hyperframes tts 跑在獨立的 Python venv（kokoro-onnx 需要 3.9–3.12，
// 跟系統預設 Python 版本可能對不上），裝在這個 skill 目錄下。
const DEFAULT_PYTHON = new URL('../.venv/bin/python', import.meta.url).pathname;

function parseJsonLine(raw) {
  // npx 第一次跑會混一些 npm warn 訊息進 stdout，JSON 通常是最後一行合法的那個。
  const lines = raw.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // 繼續往前找
    }
  }
  throw new Error('hyperframes tts 輸出不是合法 JSON：\n' + raw);
}

function synthesizeKokoro(text, outPath, { voice = 'zf_xiaobei', speed = 1 } = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const env = {
    ...process.env,
    HYPERFRAMES_PYTHON: process.env.HYPERFRAMES_PYTHON || DEFAULT_PYTHON,
  };
  const raw = execFileSync(
    'npx',
    ['hyperframes', 'tts', text, '-v', voice, '-s', String(speed), '-o', outPath, '--json'],
    { env, encoding: 'utf-8' },
  );
  const result = parseJsonLine(raw);
  if (!result.ok) throw new Error(`TTS 失敗（"${text.slice(0, 20)}..."）: ${result.error}`);
  return { path: outPath, durationMs: Math.round(result.durationSeconds * 1000) };
}

export function ffprobeDurationMs(filePath) {
  const raw = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    { encoding: 'utf-8' },
  );
  return Math.round(parseFloat(raw.trim()) * 1000);
}

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * 打 OpenAI 的 /v1/audio/speech —— 或**任何講同一套協定的伺服器**。
 *
 * 網址不寫死的用意：本地跑的 TTS（4090 上的 openedai-speech、Fish Speech，
 * 或自己包一層 FastAPI 的 IndexTTS / CosyVoice）多半都提供 OpenAI 相容端點，
 * 把 baseUrl 指過去就能用，不必每換一個模型就在這裡多寫一個 engine。
 *
 * API key 的規則：官方網址一定要有（沒有就直接報錯，不要送出去被擋才發現）；
 * 自訂 baseUrl 則是有就帶、沒有就不帶 Authorization —— 本地服務通常不驗。
 */
async function synthesizeOpenAI(text, outPath, {
  voice = 'nova',
  model = 'gpt-4o-mini-tts',
  speed = 1,
  baseUrl = OPENAI_BASE_URL,
  apiKeyEnv = 'OPENAI_API_KEY',
  format = 'wav',
  extraBody = {},
} = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const isOfficial = base === OPENAI_BASE_URL;
  // 呼叫端一律給 .wav 的路徑；換了 response_format 就把副檔名改掉，
  // 免得 mp3 的內容躺在 .wav 的檔名底下。回傳的 path 才是真正寫出去的檔案。
  if (format !== 'wav') outPath = outPath.replace(/\.wav$/, `.${format}`);
  const apiKey = process.env[apiKeyEnv];
  if (isOfficial && !apiKey) {
    throw new Error(`narration.engine 是 "openai" 但沒有 ${apiKeyEnv} 環境變數`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let res;
  try {
    res = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, voice, input: text, response_format: format, speed, ...extraBody }),
    });
  } catch (err) {
    // 本地服務最常見的死法：port 只綁 localhost，從別台機器連不到。
    throw new Error(`連不上 TTS 服務 ${base}: ${err.message}\n` +
      '    本地服務請確認有綁 0.0.0.0（不是只綁 localhost）且防火牆有開');
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`TTS 失敗 (HTTP ${res.status} @ ${base}): ${errText.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return { path: outPath, durationMs: ffprobeDurationMs(outPath) };
}

const ENGINES = {
  kokoro: synthesizeKokoro,
  openai: synthesizeOpenAI,
  'openai-compatible': synthesizeOpenAI,
};

/**
 * 快取放哪裡。不能放 outDir——outDir 每次錄都會整個刪掉重建。
 *   narration.cache: false        關掉
 *   narration.cache: '<目錄>'      指定位置
 *   SCREENCAST_CACHE_DIR=<目錄>    環境變數（測試用這個隔離）
 *   預設 ~/.cache/screencast/tts
 */
export function resolveCacheDir(opts = {}) {
  if (opts.cache === false) return null;
  if (typeof opts.cache === 'string') return opts.cache;
  if (process.env.SCREENCAST_CACHE_DIR) return process.env.SCREENCAST_CACHE_DIR;
  return path.join(os.homedir(), '.cache', 'screencast', 'tts');
}

/**
 * 快取的 key：凡是會改變「唸出來的聲音」的參數都要算進去，換了音色或語速
 * 就不能拿舊檔。apiKeyEnv 不影響聲音，不算。
 */
export function narrationCacheKey(text, opts = {}) {
  const engine = opts.engine ?? 'kokoro';
  const material = JSON.stringify({
    engine: engine === 'openai-compatible' ? 'openai' : engine,
    text,
    voice: opts.voice ?? null,
    model: opts.model ?? null,
    speed: opts.speed ?? 1,
    baseUrl: opts.baseUrl ?? null,
    format: opts.format ?? 'wav',
    extraBody: opts.extraBody ?? null,
  });
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * 把一句話合成語音，回傳實際音檔長度（毫秒）——用這個長度去決定
 * 對應的操作步驟該停留多久，讓畫面跟旁白自然對齊。
 *
 * engine：
 *   'kokoro'            本地、免費、免 API key，但中文音質普通，機械感重
 *   'openai'            OpenAI 的 /v1/audio/speech，中文自然很多，費用可忽略
 *   'openai-compatible' 同一段程式，只是語意上標明「這不是 OpenAI 本尊」，
 *                       搭配 baseUrl 指向本地或第三方的相容端點
 *
 * 同一句話、同樣參數合成過就直接拿快取：調 selector 時整支會重跑很多次，
 * 每次都重新打 TTS 又慢又花錢。回傳值的 cached 標示這句是不是從快取來的。
 */
export async function synthesizeNarration(text, outPath, opts = {}) {
  const engine = opts.engine ?? 'kokoro';
  const synth = ENGINES[engine];
  if (!synth) {
    throw new Error(
      `未知的 narration.engine: "${engine}"（支援 'kokoro' / 'openai' / 'openai-compatible'）`,
    );
  }

  const cacheDir = resolveCacheDir(opts);
  if (!cacheDir) return { ...(await synth(text, outPath, opts)), cached: false };

  const key = narrationCacheKey(text, opts);
  const metaPath = path.join(cacheDir, `${key}.json`);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const cachedAudio = path.join(cacheDir, meta.file);
      if (fs.existsSync(cachedAudio)) {
        const dest = outPath.replace(/\.[^./]+$/, path.extname(meta.file));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(cachedAudio, dest);
        return { path: dest, durationMs: meta.durationMs, cached: true };
      }
    } catch {
      // 快取檔壞了就當沒命中，重新合成覆蓋掉
    }
  }

  const result = await synth(text, outPath, opts);
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = `${key}${path.extname(result.path)}`;
  fs.copyFileSync(result.path, path.join(cacheDir, file));
  // meta 最後寫、而且先寫暫存檔再改名：中途被砍掉也不會留下指向半個音檔的 meta。
  const tmp = `${metaPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ file, durationMs: result.durationMs, engine, voice: opts.voice, text }));
  fs.renameSync(tmp, metaPath);
  return { ...result, cached: false };
}

/**
 * 把已經合成好的旁白音檔，依各自在影片時間軸上的起點（毫秒）疊到影片上。
 * 用系統 ffmpeg（需要 libopus/libvorbis 編碼器，Playwright 內附的精簡版 ffmpeg
 * 沒有音訊編碼器，跑不了這步——`brew install ffmpeg` 裝一份完整版）。
 */
export function muxNarration(videoPath, clips, outPath) {
  if (clips.length === 0) {
    fs.copyFileSync(videoPath, outPath);
    return outPath;
  }

  const inputs = [];
  const filterParts = [];
  clips.forEach((clip, i) => {
    inputs.push('-i', clip.path);
    filterParts.push(`[${i + 1}:a]adelay=${Math.max(0, clip.tStartMs)}:all=1[a${i}]`);
  });
  const mixLabels = clips.map((_, i) => `[a${i}]`).join('');
  const filterComplex = `${filterParts.join(';')};${mixLabels}amix=inputs=${clips.length}:normalize=0[aout]`;

  execFileSync('ffmpeg', [
    '-y',
    '-i', videoPath,
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'libopus',
    outPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  return outPath;
}
