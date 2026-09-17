#!/usr/bin/env node
// 用法：node tools/manifest-to-srt.mjs <out 目錄或 manifest.json 路徑>
//
// 給「已經錄好、但當時還沒有字幕功能」的影片補字幕，不用重錄。
// 新版錄影的 manifest 有 narrationStartMs / narrationDurationMs，直接用；
// 舊版沒有，就 ffprobe 量 narration/step-N.wav 的長度，從 tEndMs 往回推——
// 因為引擎是「動作做完 → 播旁白 → 等它講完」，旁白結束點就等於 step 結束點。
import fs from 'node:fs';
import path from 'node:path';
import { ffprobeDurationMs } from '../lib/narration.mjs';
import { cuesFromManifest, writeSubtitles } from '../lib/subtitles.mjs';

const arg = process.argv[2];
if (!arg) {
  console.error('用法: node tools/manifest-to-srt.mjs <out 目錄或 manifest.json 路徑>');
  process.exit(1);
}

const target = path.resolve(arg);
const manifestPath = target.endsWith('.json') ? target : path.join(target, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`找不到 manifest: ${manifestPath}`);
  process.exit(1);
}
const outDir = path.dirname(manifestPath);
const { steps } = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

let retrofitted = 0;
const cues = cuesFromManifest(steps, {
  maxCharsPerCue: Number(process.env.SCREENCAST_MAX_CHARS ?? 18),
  fallbackDurationMs(step) {
    // 副檔名不寫死 .wav —— 換成 mp3 的 response_format 時檔名會跟著變。
    const dir = path.join(outDir, 'narration');
    const hit = fs.existsSync(dir)
      && fs.readdirSync(dir).find((f) => f.replace(/\.[^.]+$/, '') === `step-${step.index}`);
    if (!hit) {
      console.warn(`  ! step ${step.index} 找不到旁白音檔，這句沒有字幕`);
      return undefined;
    }
    retrofitted++;
    return ffprobeDurationMs(path.join(dir, hit));
  },
});

if (!cues.length) {
  console.error('這份 manifest 沒有任何帶旁白的步驟，沒東西可以產。');
  process.exit(1);
}

const { srtPath, vttPath } = writeSubtitles(outDir, cues, 'demo');
console.log(`${cues.length} 張字卡${retrofitted ? `（其中 ${retrofitted} 句是用 ffprobe 反推時間）` : ''}`);
console.log('SRT:', srtPath);
console.log('VTT:', vttPath);
