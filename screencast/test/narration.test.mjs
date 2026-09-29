import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { narrationCacheKey, resolveCacheDir, synthesizeNarration } from '../lib/narration.mjs';
import { fakeDurationMs, startServer } from './helpers/server.mjs';

let server;
let tmp;
before(async () => { server = await startServer(); });
after(async () => { await server.close(); });
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-narration-'));
  server.ttsCalls.length = 0;
});

const opts = (extra = {}) => ({
  engine: 'openai-compatible',
  baseUrl: server.ttsBaseUrl,
  apiKeyEnv: 'SCREENCAST_TEST_NO_SUCH_KEY',
  voice: 'test-voice',
  cache: path.join(tmp, 'cache'),
  ...extra,
});

test('openai-compatible：打自訂 baseUrl，長度用 ffprobe 量出來', async () => {
  const out = path.join(tmp, 'out', 'step-1.wav');
  const r = await synthesizeNarration('你好世界。', out, opts());
  assert.equal(r.path, out);
  assert.ok(fs.existsSync(out));
  assert.ok(Math.abs(r.durationMs - fakeDurationMs('你好世界。')) <= 5, `長度 ${r.durationMs}`);
  assert.equal(server.ttsCalls.length, 1);
  assert.equal(server.ttsCalls[0].body.voice, 'test-voice');
  assert.equal(server.ttsCalls[0].body.response_format, 'wav');
});

test('自訂 baseUrl 沒有 key 就不帶 Authorization；有 key 就帶', async () => {
  await synthesizeNarration('一。', path.join(tmp, 'a.wav'), opts({ cache: false }));
  assert.equal(server.ttsCalls[0].authorization, undefined);

  process.env.SCREENCAST_TEST_KEY = 'secret-123';
  try {
    await synthesizeNarration('一。', path.join(tmp, 'b.wav'), opts({ cache: false, apiKeyEnv: 'SCREENCAST_TEST_KEY' }));
  } finally {
    delete process.env.SCREENCAST_TEST_KEY;
  }
  assert.equal(server.ttsCalls[1].authorization, 'Bearer secret-123');
});

test('官方網址沒有 key：送出前就報錯', async () => {
  await assert.rejects(
    synthesizeNarration('一。', path.join(tmp, 'a.wav'), { engine: 'openai', apiKeyEnv: 'SCREENCAST_TEST_NO_SUCH_KEY', cache: false }),
    /沒有 SCREENCAST_TEST_NO_SUCH_KEY 環境變數/,
  );
});

test('TTS 回錯誤：訊息帶狀態碼與伺服器回的內容', async () => {
  await assert.rejects(
    synthesizeNarration('[500] 爆了', path.join(tmp, 'a.wav'), opts()),
    /HTTP 500 .*model exploded/,
  );
  // 失敗的不能進快取
  assert.equal(fs.existsSync(path.join(tmp, 'cache')) && fs.readdirSync(path.join(tmp, 'cache')).length, false);
});

test('連不上：提示檢查 0.0.0.0 綁定', async () => {
  await assert.rejects(
    synthesizeNarration('一。', path.join(tmp, 'a.wav'), opts({ baseUrl: 'http://127.0.0.1:1/v1' })),
    /連不上 TTS 服務[\s\S]*0\.0\.0\.0/,
  );
});

test('服務回應慢（第一次載入模型）：在 timeoutMs 內就等下去', async () => {
  const r = await synthesizeNarration('[slow:1200] 慢慢來。', path.join(tmp, 'a.wav'), opts({ timeoutMs: 5000 }));
  assert.ok(fs.existsSync(r.path));
});

test('超過 timeoutMs 沒回應：錯誤訊息講清楚原因與調整方式', async () => {
  await assert.rejects(
    synthesizeNarration('[slow:1500] 太慢了。', path.join(tmp, 'a.wav'), opts({ timeoutMs: 300 })),
    /超過 0 秒沒有回應[\s\S]*narration\.timeoutMs/,
  );
});

test('timeoutMs 不影響快取 key', () => {
  const o = { engine: 'openai', voice: 'nova' };
  assert.equal(narrationCacheKey('一', o), narrationCacheKey('一', { ...o, timeoutMs: 1 }));
});

test('response_format 換成 mp3：輸出檔名跟著換副檔名', async () => {
  const r = await synthesizeNarration('一。', path.join(tmp, 'step-1.wav'), opts({ format: 'mp3' }));
  assert.equal(path.extname(r.path), '.mp3');
  assert.ok(fs.existsSync(r.path));
});

test('快取：同一句第二次不打 TTS，長度與內容相同', async () => {
  const first = await synthesizeNarration('快取測試。', path.join(tmp, 'r1', 'step-1.wav'), opts());
  const second = await synthesizeNarration('快取測試。', path.join(tmp, 'r2', 'step-3.wav'), opts());
  assert.equal(server.ttsCalls.length, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.durationMs, first.durationMs);
  assert.equal(second.path, path.join(tmp, 'r2', 'step-3.wav'));
  assert.deepEqual(fs.readFileSync(second.path), fs.readFileSync(first.path));
});

test('快取：換音色、語速或文字就不能命中', async () => {
  await synthesizeNarration('一。', path.join(tmp, 'a.wav'), opts());
  await synthesizeNarration('一。', path.join(tmp, 'b.wav'), opts({ voice: 'other' }));
  await synthesizeNarration('一。', path.join(tmp, 'c.wav'), opts({ speed: 1.2 }));
  await synthesizeNarration('二。', path.join(tmp, 'd.wav'), opts());
  assert.equal(server.ttsCalls.length, 4);
});

test('快取 key：openai 與 openai-compatible 視為同一種；apiKeyEnv 不影響', () => {
  const base = { voice: 'nova', baseUrl: 'http://x/v1' };
  assert.equal(
    narrationCacheKey('一', { ...base, engine: 'openai' }),
    narrationCacheKey('一', { ...base, engine: 'openai-compatible', apiKeyEnv: 'OTHER' }),
  );
  assert.notEqual(narrationCacheKey('一', { engine: 'kokoro' }), narrationCacheKey('一', { engine: 'openai' }));
});

test('快取的 meta 壞掉：當沒命中，重新合成並修好', async () => {
  const o = opts();
  await synthesizeNarration('壞掉。', path.join(tmp, 'a.wav'), o);
  const meta = path.join(o.cache, `${narrationCacheKey('壞掉。', o)}.json`);
  fs.writeFileSync(meta, '{ not json');
  const r = await synthesizeNarration('壞掉。', path.join(tmp, 'b.wav'), o);
  assert.equal(r.cached, false);
  assert.equal(server.ttsCalls.length, 2);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(meta, 'utf-8')));
});

test('resolveCacheDir：false 關掉、字串指定、環境變數、預設在家目錄', () => {
  const saved = process.env.SCREENCAST_CACHE_DIR;
  try {
    delete process.env.SCREENCAST_CACHE_DIR;
    assert.equal(resolveCacheDir({ cache: false }), null);
    assert.equal(resolveCacheDir({ cache: '/x' }), '/x');
    assert.equal(resolveCacheDir({}), path.join(os.homedir(), '.cache', 'screencast', 'tts'));
    process.env.SCREENCAST_CACHE_DIR = '/env';
    assert.equal(resolveCacheDir({}), '/env');
  } finally {
    if (saved === undefined) delete process.env.SCREENCAST_CACHE_DIR;
    else process.env.SCREENCAST_CACHE_DIR = saved;
  }
});

test('未知 engine 報錯', async () => {
  await assert.rejects(synthesizeNarration('一。', path.join(tmp, 'a.wav'), { engine: 'nope' }), /未知的 narration.engine/);
});
