// scenario.setup：前置步驟（登入）不錄影，登入狀態（localStorage 與 cookie）帶進正式錄影。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { runScenario } from '../lib/record-engine.mjs';
import { probe } from './helpers/media.mjs';
import { startServer } from './helpers/server.mjs';

let server;
let tmp;
before(async () => {
  server = await startServer();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-setup-'));
});
after(async () => { await server.close(); });

const loginSetup = [
  { type: 'goto', url: '/session.html', label: '開登入頁' },
  { type: 'fill', placeholder: '帳號', value: '王小明', label: '輸入帳號' },
  { type: 'click', role: 'button', name: '登入', label: '按登入' },
  { type: 'wait', ms: 100, label: '等狀態寫入' },
];

const scenarioOf = (name, extra) => ({
  baseUrl: server.url,
  outDir: path.join(tmp, name),
  viewport: { width: 800, height: 500 },
  timeout: 5000,
  steps: [
    { type: 'goto', url: '/welcome.html', label: '開歡迎頁' },
    { type: 'waitFor', text: '歡迎 王小明', label: '確認已登入' },
    { type: 'wait', ms: 300, label: '停留' },
  ],
  ...extra,
});

test('setup：登入狀態帶進正式錄影，manifest 只有正式步驟，影片不含準備階段', async () => {
  const r = await runScenario(scenarioOf('with-setup', { setup: loginSetup }));
  assert.equal(r.ok, true, JSON.stringify(r.manifest.filter((m) => !m.ok)));
  assert.deepEqual(r.manifest.map((m) => m.label), ['開歡迎頁', '確認已登入', '停留']);
  const manifestJson = JSON.parse(fs.readFileSync(r.manifestPath, 'utf-8'));
  // 影片長度 ≈ 正式步驟的總長（準備階段的時間不在裡面）
  assert.ok(Math.abs(probe(r.videoPath).durationMs - manifestJson.totalMs) < 2000);
});

test('沒有 setup：同一份 scenario 看不到登入狀態（證明上一個測試是 setup 的功勞）', async () => {
  const r = await runScenario(scenarioOf('no-setup', { abortOnError: false }));
  assert.equal(r.ok, false);
  assert.equal(r.manifest[1].ok, false, '沒登入就找不到「歡迎 王小明」');
});

test('setup 也能 dry-run', async () => {
  const r = await runScenario(scenarioOf('dry', { setup: loginSetup }), { dryRun: true });
  assert.equal(r.ok, true);
});

test('setup 失敗：丟出有步驟名稱的錯誤，不會開始錄影', async () => {
  const outDir = path.join(tmp, 'bad-setup');
  await assert.rejects(
    runScenario(scenarioOf('bad-setup', { setup: [{ type: 'goto', url: '/session.html' }, { type: 'click', selector: '#不存在', label: '按不存在的按鈕' }], timeout: 800 })),
    /準備階段第 2 步「按不存在的按鈕」失敗/,
  );
  assert.ok(!fs.readdirSync(outDir).some((f) => f.endsWith('.webm')), '準備階段失敗就不該有影片');
});

test('setup 用了不支援的 type（例如 rightClick）→ 報清楚的錯', async () => {
  await assert.rejects(
    runScenario(scenarioOf('bad-type', { setup: [{ type: 'rightClick', selector: 'body', label: '右鍵' }] })),
    /準備階段只支援/,
  );
});
