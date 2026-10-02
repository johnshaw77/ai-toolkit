// upload / press / scroll 三個步驟：離線 fixture（test/fixtures/actions.html）端對端測試。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { keyLabelText, uploadFiles, validateActionSteps } from '../lib/actions.mjs';
import { resolveZoom, scenarioUsesZoom } from '../lib/camera.mjs';
import { cursorInitScript } from '../lib/cursor-overlay.mjs';
import { runScenario } from '../lib/record-engine.mjs';
import { startServer } from './helpers/server.mjs';

const FIXTURES = fileURL('fixtures');
function fileURL(sub) { return path.join(path.dirname(new URL(import.meta.url).pathname), sub); }

let server;
let tmp;
before(async () => {
  server = await startServer();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-actions-'));
});
after(async () => { await server.close(); });

const lastEvent = (prefix) => server.pageEvents.filter((e) => e.startsWith(prefix)).pop();

async function run(steps, { dryRun = true, extra = {} } = {}) {
  server.pageEvents.length = 0;
  const r = await runScenario({
    baseUrl: server.url,
    outDir: path.join(tmp, `out-${Math.random().toString(36).slice(2)}`),
    viewport: { width: 800, height: 500 },
    timeout: 5000,
    steps: [{ type: 'goto', url: '/actions.html' }, ...steps, { type: 'wait', ms: 500 }],
    ...extra,
  }, { dryRun, baseDir: FIXTURES });
  assert.equal(r.ok, true, JSON.stringify(r.manifest.filter((m) => !m.ok)));
  return r;
}

// ---- 純函式 ----

test('keyLabelText：修飾鍵與特殊鍵換成好讀的寫法', () => {
  assert.equal(keyLabelText('Enter'), 'Enter');
  assert.equal(keyLabelText('Control+Minus'), 'Ctrl + −');
  assert.equal(keyLabelText('Control+Shift+k'), 'Ctrl + Shift + K');
  assert.equal(keyLabelText('Escape'), 'Esc');
  assert.equal(keyLabelText('ArrowLeft'), '←');
});

test('uploadFiles：相對路徑以 scenario 所在資料夾為準，單一字串與陣列都接受', () => {
  assert.deepEqual(uploadFiles({ files: 'a.txt' }, '/base'), ['/base/a.txt']);
  assert.deepEqual(uploadFiles({ files: ['x/a.txt', '/abs/b.txt'] }, '/base'), ['/base/x/a.txt', '/abs/b.txt']);
  assert.throws(() => uploadFiles({ files: [] }, '/base'), /files/);
  assert.throws(() => uploadFiles({}, '/base'), /files/);
});

test('validateActionSteps：缺欄位、檔案不存在都在開瀏覽器之前就報錯', () => {
  assert.throws(() => validateActionSteps([{ type: 'upload', selector: '#x', files: 'assets/nope.txt', label: '傳' }], FIXTURES), /找不到要上傳的檔案.*nope\.txt/);
  assert.throws(() => validateActionSteps([{ type: 'upload', files: 'assets/a.txt' }], FIXTURES), /缺少 selector/);
  assert.throws(() => validateActionSteps([{ type: 'press' }], FIXTURES), /需要 key/);
  assert.throws(() => validateActionSteps([{ type: 'scroll' }], FIXTURES), /to.*by/);
  assert.throws(() => validateActionSteps([{ type: 'scroll', to: '#a', by: 10 }], FIXTURES), /to.*by/);
  assert.throws(() => validateActionSteps([{ type: 'scroll', by: 'abc' }], FIXTURES), /數字/);
  assert.doesNotThrow(() => validateActionSteps([
    { type: 'upload', selector: '#x', files: ['assets/a.txt', 'assets/b.txt'] },
    { type: 'press', key: 'Enter' },
    { type: 'scroll', by: 300 },
    { type: 'scroll', selector: '#box', to: { text: '容器裡的目標' } },
  ], FIXTURES));
});

test('zoom：upload 和 click 一樣會推近；press、scroll 沒有對象，寫 zoom 就報錯', () => {
  assert.equal(resolveZoom({ type: 'upload' }, { autoZoom: { zoom: 1.8 } }), 1.8);
  assert.equal(resolveZoom({ type: 'upload', zoom: false }, { autoZoom: true }), null);
  assert.equal(resolveZoom({ type: 'press', key: 'Enter' }, { autoZoom: true }), null);
  assert.equal(resolveZoom({ type: 'scroll', by: 10 }, { autoZoom: true }), null);
  assert.throws(() => resolveZoom({ type: 'press', key: 'Enter', zoom: 2 }, {}), /press.*zoom/);
  assert.throws(() => resolveZoom({ type: 'scroll', by: 10, zoom: false }, {}), /scroll.*zoom/);
  assert.equal(scenarioUsesZoom({ autoZoom: true, steps: [{ type: 'press', key: 'Enter' }, { type: 'scroll', by: 1 }] }), false);
});

// ---- 端對端（dry-run） ----

test('upload：點按鈕開檔案選擇器並帶入多個檔案，manifest 記下按鈕位置', async () => {
  const r = await run([{ type: 'upload', selector: '#pick', files: ['assets/a.txt', 'assets/b.txt'], label: '上傳' }]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(lastEvent('file:hidden'), 'file:hidden:a.txt+b.txt');
  assert.ok(r.manifest[1].focus, '要記下按鈕的位置（鏡頭推近要用）');
});

test('upload：可見的 <input type=file> 也是點下去開選擇器', async () => {
  const r = await run([{ type: 'upload', selector: '#plain', files: 'assets/a.txt' }]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(lastEvent('file:plain'), 'file:plain:a.txt');
  assert.ok(r.manifest[1].focus);
});

test('upload：看不見的 <input type=file> 直接帶入（沒有東西可以點，沒有 focus）', async () => {
  const r = await run([{ type: 'upload', selector: '#hidden', files: 'assets/b.txt' }]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(lastEvent('file:hidden'), 'file:hidden:b.txt');
  assert.equal(r.manifest[1].focus, null);
});

test('upload：找不到按鈕就失敗，並且不會有沒人接的 rejection', async () => {
  const r = await runScenario({
    baseUrl: server.url,
    outDir: path.join(tmp, 'upload-missing'),
    viewport: { width: 800, height: 500 },
    timeout: 800,
    steps: [{ type: 'goto', url: '/actions.html' }, { type: 'upload', selector: '#nope', files: 'assets/a.txt' }],
  }, { dryRun: true, baseDir: FIXTURES });
  assert.equal(r.ok, false);
  assert.equal(r.manifest[1].ok, false);
});

test('upload：檔案不存在，開瀏覽器之前就丟錯（不建 outDir）', async () => {
  const outDir = path.join(tmp, 'upload-nofile');
  await assert.rejects(runScenario({
    baseUrl: server.url, outDir, viewport: { width: 800, height: 500 },
    steps: [{ type: 'goto', url: '/actions.html' }, { type: 'upload', selector: '#pick', files: 'assets/missing.txt' }],
  }, { dryRun: true, baseDir: FIXTURES }), /找不到要上傳的檔案/);
  assert.equal(fs.existsSync(outDir), false);
});

test('press：送出按鍵（含修飾鍵）；不會有 focus 也不會推近', async () => {
  const r = await run([
    { type: 'press', key: 'Enter', label: '按 Enter' },
    { type: 'press', key: 'Control+Minus', label: '縮小' },
  ], { extra: { autoZoom: true } });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(server.pageEvents.includes('key:Enter'));
  assert.ok(server.pageEvents.includes('key:Control+-'));
  assert.equal(r.manifest[1].focus, undefined);
  assert.equal(r.manifest[1].zoom, undefined);
});

test('scroll by：整個頁面往下捲指定像素，再往回捲', async () => {
  await run([{ type: 'scroll', by: 600, label: '往下' }]);
  assert.equal(lastEvent('page-scroll'), 'page-scroll:600');
  await run([{ type: 'scroll', by: 600 }, { type: 'scroll', by: -200, label: '往回' }]);
  assert.equal(lastEvent('page-scroll'), 'page-scroll:400');
});

test('scroll to：把元素捲到視窗中央附近', async () => {
  await run([{ type: 'scroll', to: '#bottom', label: '捲到頁尾' }]);
  const y = Number(lastEvent('page-scroll').split(':')[1]);
  const max = await (async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
      await page.goto(`${server.url}/actions.html`);
      return await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
    } finally { await browser.close(); }
  })();
  assert.ok(y > 1000 && y <= max, `捲到 ${y}，最多 ${max}`);
});

test('scroll 容器：selector 指定要捲的區域，to 用定位物件（text）也行', async () => {
  await run([{ type: 'scroll', selector: '#box', to: { text: '容器裡的目標' }, label: '捲容器' }]);
  const top = Number(lastEvent('box-scroll').split(':')[1]);
  assert.ok(top > 800, `容器捲到 ${top}`);
  assert.equal(lastEvent('page-scroll'), undefined, '只有容器捲動，頁面不動');
});

test('scroll：找不到目標元素就失敗', async () => {
  const r = await runScenario({
    baseUrl: server.url,
    outDir: path.join(tmp, 'scroll-missing'),
    viewport: { width: 800, height: 500 },
    timeout: 800,
    steps: [{ type: 'goto', url: '/actions.html' }, { type: 'scroll', to: '#nope' }],
  }, { dryRun: true, baseDir: FIXTURES });
  assert.equal(r.ok, false);
});

test('正式錄影：upload、press、scroll 三種步驟都能錄，影片產出、manifest 全部 ok、輸出運鏡版', async () => {
  const r = await run([
    { type: 'upload', selector: '#pick', files: 'assets/a.txt', label: '上傳' },
    { type: 'press', key: 'Control+Minus', label: '縮小' },
    { type: 'scroll', by: 400, label: '捲動' },
  ], { dryRun: false, extra: { autoZoom: true } });
  assert.ok(fs.existsSync(r.videoPath));
  assert.ok(r.zoomedPath && fs.existsSync(r.zoomedPath), '有 upload（會推近），要輸出運鏡版');
});

// ---- 按鍵標籤的覆蓋層 ----

test('overlay：__pwKeyLabel 在游標旁顯示按鍵，一段時間後淡出', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
    await context.addInitScript(cursorInitScript());
    const page = await context.newPage();
    await page.goto(`${server.url}/actions.html`);
    await page.mouse.move(300, 200);
    await page.evaluate(() => window.__pwKeyLabel('Ctrl + −', 300));
    const label = page.locator('#__pw_key_label');
    assert.equal(await label.textContent(), 'Ctrl + −');
    assert.equal(await label.evaluate((n) => n.style.opacity), '1');
    const box = await label.boundingBox();
    assert.ok(box.x > 300 && box.y > 200, `標籤在游標右下方：(${box.x}, ${box.y})`);
    await page.waitForTimeout(600);
    assert.equal(await label.evaluate((n) => n.style.opacity), '0');
  } finally { await browser.close(); }
});
