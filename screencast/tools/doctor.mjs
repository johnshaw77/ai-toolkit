#!/usr/bin/env node
// 用法：npm run doctor（或 node tools/doctor.mjs [--offline]）
//
// 檢查這台電腦能不能錄 screencast：缺什麼就直接說要跑哪一行。
// 團隊一半 Windows、一半 Mac，裝到一半漏一步最常見——錄到一半才失敗很浪費時間。
// --offline：跳過實際打一次 edge-tts（要連網）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OFFLINE = process.argv.includes('--offline');
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

const HINT = {
  node: WIN ? 'winget install OpenJS.NodeJS.LTS' : MAC ? 'brew install node' : '到 https://nodejs.org 安裝 LTS 版',
  npm: `cd "${ROOT}" && npm install`,
  chromium: `cd "${ROOT}" && npx playwright install chromium`,
  ffmpeg: WIN ? 'winget install Gyan.FFmpeg（裝完要重開終端機）' : MAC ? 'brew install ffmpeg' : 'sudo apt install ffmpeg',
  uv: WIN ? 'winget install astral-sh.uv' : MAC ? 'brew install uv' : 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  edge: 'uv tool install edge-tts（裝完找不到指令就跑 uv tool update-shell 再重開終端機）',
  link: WIN
    ? `New-Item -ItemType Junction -Path "$env:USERPROFILE\\.claude\\skills\\screencast" -Target "${ROOT}"`
    : `mkdir -p ~/.claude/skills && ln -s "${ROOT}" ~/.claude/skills/screencast`,
};

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg, fix) => {
  failed++;
  console.log(`  ✗ ${msg}`);
  if (fix) console.log(`      → ${fix}`);
};
const info = (msg) => console.log(`  · ${msg}`);

function run(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
}
function has(bin, args = ['-version']) {
  try {
    return run(bin, args);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    return String(err.stdout ?? '') + String(err.stderr ?? '');
  }
}

console.log(`screencast doctor（${process.platform} ${os.arch()}）\n`);

// 1. Node
const major = Number(process.versions.node.split('.')[0]);
if (major >= 18) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} 太舊（要 18 以上）`, HINT.node);

// 2. npm 依賴與 Chromium
let chromium;
try {
  ({ chromium } = await import('playwright'));
  ok('playwright 已安裝');
} catch {
  bad('找不到 playwright（還沒 npm install）', HINT.npm);
}
if (chromium) {
  const exe = chromium.executablePath();
  if (!fs.existsSync(exe)) {
    bad('Chromium 還沒下載', HINT.chromium);
  } else {
    try {
      // 用錄 zoom 時的同一組參數開一次，確認高解析度錄影這條路也走得通
      const browser = await chromium.launch({ args: ['--force-device-scale-factor=2'] });
      const page = await browser.newPage({ deviceScaleFactor: 2 });
      await page.setContent('<p>ok</p>');
      await browser.close();
      ok('Chromium 開得起來（含 2 倍像素模式）');
    } catch (err) {
      bad(`Chromium 開不起來：${err.message.split('\n')[0]}`, HINT.chromium);
    }
  }
}

// 3. ffmpeg：疊旁白要 libopus，轉 mp4 要 libx264 + aac
const ffmpeg = has('ffmpeg');
if (ffmpeg == null) {
  bad('找不到 ffmpeg（疊旁白、轉 mp4、運鏡都要用）', HINT.ffmpeg);
} else {
  ok(`ffmpeg ${ffmpeg.match(/ffmpeg version (\S+)/)?.[1] ?? ''}`.trim());
  const encoders = has('ffmpeg', ['-hide_banner', '-encoders']) ?? '';
  const missing = ['libx264', 'libopus', 'aac'].filter((e) => !new RegExp(`\\s${e}\\s`).test(encoders));
  if (missing.length) bad(`ffmpeg 缺少編碼器：${missing.join('、')}（這份 ffmpeg 是精簡版）`, HINT.ffmpeg);
  else ok('ffmpeg 編碼器齊全（libx264、libopus、aac）');
  const filters = has('ffmpeg', ['-hide_banner', '-filters']) ?? '';
  if (!/\sperspective\s/.test(filters)) bad('ffmpeg 沒有 perspective 濾鏡（運鏡要用）', HINT.ffmpeg);
}
if (has('ffprobe') == null) bad('找不到 ffprobe（通常跟 ffmpeg 一起裝）', HINT.ffmpeg);
else ok('ffprobe');

// 4. edge-tts（預設語音）
const edgeBin = process.env.SCREENCAST_EDGE_TTS || 'edge-tts';
const edgeVersion = has(edgeBin, ['--version']);
if (edgeVersion == null) {
  bad('找不到 edge-tts（預設的曉臻語音要用）', HINT.edge);
  if (has('uv', ['--version']) == null) info(`uv 也還沒裝：${HINT.uv}`);
} else {
  ok(`edge-tts ${edgeVersion.trim().split(/\s+/).pop()}`);
  if (OFFLINE) {
    info('--offline：跳過實際合成');
  } else {
    const out = path.join(os.tmpdir(), `screencast-doctor-${process.pid}.mp3`);
    try {
      run(edgeBin, ['--voice=zh-TW-HsiaoChenNeural', '--text=測試', `--write-media=${out}`]);
      if (!fs.existsSync(out) || fs.statSync(out).size === 0) throw new Error('沒有產出音檔');
      ok('edge-tts 能連到微軟合成語音（曉臻）');
    } catch (err) {
      const detail = String(err.stderr || err.message).trim().split('\n').pop();
      bad(`edge-tts 合成失敗：${detail}`, '檢查網路／公司防火牆能不能連 speech.platform.bing.com；還是不行就 uv tool upgrade edge-tts');
    } finally {
      fs.rmSync(out, { force: true });
    }
  }
}

// 5. 有沒有接到 Claude Code
const link = path.join(os.homedir(), '.claude', 'skills', 'screencast');
try {
  const target = fs.realpathSync(link);
  if (target === fs.realpathSync(ROOT)) ok(`Claude Code skill 已接上（${link}）`);
  else bad(`${link} 指到別的地方：${target}`, `先刪掉它，再 ${HINT.link}`);
} catch {
  bad('Claude Code 還沒接上這個 skill', HINT.link);
}

// 6. 選用的本地語音（只有 Apple Silicon Mac）
if (MAC && os.arch() === 'arm64') {
  const mlx = fs.existsSync(path.join(ROOT, '.venv-mlx'));
  info(`選用：Breeze／Qwen3 本地語音 ${mlx ? '已安裝（.venv-mlx）' : '沒裝（不需要的話可忽略，見 SKILL.md）'}`);
}

console.log(failed ? `\n有 ${failed} 項要處理，照上面 → 的指令做完再跑一次 npm run doctor。` : '\n全部就緒，可以開始錄了。');
process.exit(failed ? 1 : 0);
