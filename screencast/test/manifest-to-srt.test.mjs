import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { silentWav } from './helpers/server.mjs';

const TOOL = new URL('../tools/manifest-to-srt.mjs', import.meta.url).pathname;

test('舊錄影補字幕：量 narration/step-N.wav 長度，從 tEndMs 往回推', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-srt-'));
  fs.mkdirSync(path.join(dir, 'narration'));
  fs.writeFileSync(path.join(dir, 'narration', 'step-2.wav'), silentWav(1500));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    steps: [
      { index: 1, type: 'goto', tStartMs: 0, tEndMs: 2000 },
      { index: 2, type: 'click', narration: '點這裡。', tStartMs: 2000, tEndMs: 6000 },
    ],
  }));

  const stdout = execFileSync('node', [TOOL, dir], { encoding: 'utf-8' });
  assert.match(stdout, /1 張字卡（其中 1 句是用 ffprobe 反推時間）/);
  assert.equal(
    fs.readFileSync(path.join(dir, 'demo.srt'), 'utf-8'),
    '1\n00:00:04,500 --> 00:00:06,000\n點這裡。\n',
  );
  assert.match(fs.readFileSync(path.join(dir, 'demo.vtt'), 'utf-8'), /^WEBVTT\n\n00:00:04\.500 --> 00:00:06\.000/);
});

test('沒有旁白的 manifest：exit code 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-srt-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ steps: [{ index: 1, tEndMs: 1 }] }));
  assert.throws(() => execFileSync('node', [TOOL, dir], { stdio: 'pipe' }), (err) => err.status === 1);
});
