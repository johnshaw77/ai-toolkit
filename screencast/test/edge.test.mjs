import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { DEFAULT_ENGINE, edgeRate, narrationCacheKey, synthesizeNarration } from '../lib/narration.mjs';
import { fakeDurationMs } from './helpers/server.mjs';

const FAKE = fileURLToPath(new URL('./helpers/fake-edge-tts.mjs', import.meta.url));
let tmp;
let log;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-edge-'));
  log = path.join(tmp, 'calls.log');
  process.env.SCREENCAST_EDGE_TTS = FAKE;
  process.env.FAKE_EDGE_LOG = log;
});
afterEach(() => {
  delete process.env.SCREENCAST_EDGE_TTS;
  delete process.env.FAKE_EDGE_LOG;
});
const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf-8').trim().split('\n').map(JSON.parse) : []);
const cache = () => ({ cache: path.join(tmp, 'cache') });

test('預設 engine 是 edge、預設音色是曉臻', async () => {
  assert.equal(DEFAULT_ENGINE, 'edge');
  const r = await synthesizeNarration('你好。', path.join(tmp, 'step-1.wav'), cache());
  const [call] = calls();
  assert.equal(call.voice, 'zh-TW-HsiaoChenNeural');
  assert.equal(call.rate, '+0%');
  assert.equal(call.text, '你好。');
  assert.ok(Math.abs(r.durationMs - fakeDurationMs('你好。')) <= 5);
});

test('輸出一律是 mp3：.wav 路徑換成 .mp3', async () => {
  const r = await synthesizeNarration('一。', path.join(tmp, 'step-1.wav'), { engine: 'edge', cache: false });
  assert.equal(r.path, path.join(tmp, 'step-1.mp3'));
  assert.equal(calls()[0]['write-media'], r.path);
  assert.ok(fs.existsSync(r.path));
});

test('speed 換成 --rate；音色、pitch 照傳', async () => {
  await synthesizeNarration('一。', path.join(tmp, 'a.wav'), { engine: 'edge', voice: 'zh-TW-YunJheNeural', speed: 1.15, pitch: '-5Hz', cache: false });
  assert.deepEqual(
    { voice: calls()[0].voice, rate: calls()[0].rate, pitch: calls()[0].pitch },
    { voice: 'zh-TW-YunJheNeural', rate: '+15%', pitch: '-5Hz' },
  );
});

test('edgeRate：倍率轉百分比', () => {
  assert.equal(edgeRate(1), '+0%');
  assert.equal(edgeRate(1.2), '+20%');
  assert.equal(edgeRate(0.9), '-10%');
  assert.equal(edgeRate(), '+0%');
});

test('講稿開頭是「-」也不會被當成參數', async () => {
  await synthesizeNarration('-- 注意：這是警告。', path.join(tmp, 'a.wav'), { engine: 'edge', cache: false });
  assert.equal(calls()[0].text, '-- 注意：這是警告。');
});

test('快取：同一句第二次不呼叫 edge-tts', async () => {
  await synthesizeNarration('快取。', path.join(tmp, 'r1', 'step-1.wav'), cache());
  const second = await synthesizeNarration('快取。', path.join(tmp, 'r2', 'step-1.wav'), cache());
  assert.equal(calls().length, 1);
  assert.equal(second.cached, true);
  assert.equal(path.extname(second.path), '.mp3');
  assert.notEqual(narrationCacheKey('快取。', { engine: 'edge' }), narrationCacheKey('快取。', { engine: 'kokoro' }));
});

test('找不到 edge-tts：告訴使用者怎麼裝', async () => {
  process.env.SCREENCAST_EDGE_TTS = path.join(tmp, 'no-such-edge-tts');
  await assert.rejects(
    synthesizeNarration('一。', path.join(tmp, 'a.wav'), { engine: 'edge', cache: false }),
    /找不到 edge-tts[\s\S]*uv tool install edge-tts/,
  );
});

test('edge-tts 失敗：帶出 stderr 最後幾行與升級建議', async () => {
  await assert.rejects(
    synthesizeNarration('[fail] 一。', path.join(tmp, 'a.wav'), { engine: 'edge', cache: false }),
    /edge-tts 合成失敗[\s\S]*403[\s\S]*uv tool upgrade edge-tts/,
  );
  assert.ok(!fs.existsSync(path.join(tmp, 'cache')), '失敗的不能進快取');
});

test('成功結束但沒有音檔（voice 打錯）：明確報錯', async () => {
  await assert.rejects(
    synthesizeNarration('一。', path.join(tmp, 'a.wav'), { engine: 'edge', voice: 'bad-voice', cache: false }),
    /沒有產出音檔[\s\S]*bad-voice/,
  );
});
