// dblclick / rightClick：送出的事件要和真人操作一致（雙擊 = click, click, dblclick；右鍵 = contextmenu）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { runScenario } from '../lib/record-engine.mjs';
import { startServer } from './helpers/server.mjs';

let server;
let tmp;
before(async () => {
  server = await startServer();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-clicks-'));
});
after(async () => { await server.close(); });

// 頁面每次回報完整紀錄，最長的一筆就是最終結果
const events = () => (server.pageEvents.slice().sort((a, b) => b.length - a.length)[0] ?? '').split(',').filter(Boolean);

async function run(steps) {
  server.pageEvents.length = 0;
  const r = await runScenario({
    baseUrl: server.url,
    outDir: path.join(tmp, `out-${Math.random().toString(36).slice(2)}`),
    viewport: { width: 800, height: 400 },
    timeout: 5000,
    steps: [{ type: 'goto', url: '/clicks.html' }, ...steps, { type: 'wait', ms: 300 }],
  });
  assert.equal(r.ok, true, JSON.stringify(r.manifest.filter((m) => !m.ok)));
  return r;
}

test('click：只有一次 click（button 0）', async () => {
  await run([{ type: 'click', selector: '#target' }]);
  assert.deepEqual(events(), ['click:0']);
});

test('dblclick：依序觸發 click、click、dblclick', async () => {
  const r = await run([{ type: 'dblclick', selector: '#target', label: '雙擊' }]);
  assert.deepEqual(events(), ['click:0', 'click:0', 'dblclick:0']);
  assert.ok(r.manifest[1].focus, '要記下點擊的元素位置（鏡頭推近要用）');
});

test('rightClick：觸發 contextmenu（button 2），不會有 click', async () => {
  const r = await run([{ type: 'rightClick', selector: '#target', label: '右鍵' }]);
  assert.deepEqual(events(), ['contextmenu:2']);
  assert.ok(r.manifest[1].focus);
});
