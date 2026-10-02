// 開頭主旨卡：選項驗證、頁面行為（顯示 → 淡出 → 移除）、換頁時的接續，以及引擎的整合。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { introInitScript, introOptions } from '../lib/intro-overlay.mjs';
import { runScenario } from '../lib/record-engine.mjs';
import { startServer } from './helpers/server.mjs';

let server;
let tmp;
before(async () => {
  server = await startServer();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-intro-'));
});
after(async () => { await server.close(); });

test('introOptions：沒寫就是 null；title 必填；時間要是數字；補預設值', () => {
  assert.equal(introOptions(undefined), null);
  assert.equal(introOptions(false), null);
  assert.equal(introInitScript(undefined), '');
  assert.throws(() => introOptions({}), /intro\.title 必填/);
  assert.throws(() => introOptions({ title: '  ' }), /intro\.title 必填/);
  assert.throws(() => introOptions({ title: 'x', holdMs: -1 }), /intro\.holdMs/);
  assert.throws(() => introOptions({ title: 'x', fadeMs: 'abc' }), /intro\.fadeMs/);
  assert.throws(() => introOptions('字串'), /intro 要是物件/);
  assert.deepEqual(introOptions({ title: '主旨' }), { title: '主旨', kicker: '', subtitle: '', holdMs: 2600, fadeMs: 900, accent: '#1677ff' });
});

async function withPage(intro, fn) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
    await context.addInitScript(introInitScript(intro));
    await fn(await context.newPage());
  } finally {
    await browser.close();
  }
}

const state = (page) => page.evaluate(() => ({ el: Boolean(document.getElementById('__pw_intro')), s: sessionStorage.getItem('__pw_intro') }));

test('頁面載入就蓋上主旨卡（含章節、標題、說明），停留後淡出並移除，之後換頁不再出現', async () => {
  await withPage({ kicker: '操作教學・第 02 支', title: '搜尋與查出處', subtitle: '一句說明', holdMs: 500, fadeMs: 300 }, async (page) => {
    await page.goto(`${server.url}/index.html`);
    const first = await state(page);
    assert.equal(first.el, true, '載入時卡片就在');
    assert.match(first.s, /^shown:/);
    const text = await page.locator('#__pw_intro').innerText();
    assert.match(text, /操作教學・第 02 支/);
    assert.match(text, /搜尋與查出處/);
    assert.match(text, /一句說明/);

    await page.waitForFunction(() => sessionStorage.getItem('__pw_intro') === 'done', null, { timeout: 5000 });
    assert.equal((await state(page)).el, false, '淡出後移除');

    await page.goto(`${server.url}/page2.html`);
    assert.deepEqual(await state(page), { el: false, s: 'done' }, '換頁後不再顯示');
  });
});

test('主旨卡顯示到一半換頁（例如登入 redirect）：新頁面接著蓋上、用剩下的時間，不重來也不停在半途', async () => {
  await withPage({ title: '接續', holdMs: 1200, fadeMs: 200 }, async (page) => {
    await page.goto(`${server.url}/index.html`);
    await page.waitForTimeout(400);
    await page.goto(`${server.url}/page2.html`);
    const mid = await state(page);
    assert.equal(mid.el, true, '換頁後卡片接著蓋上');
    const t = Date.now();
    await page.waitForFunction(() => sessionStorage.getItem('__pw_intro') === 'done', null, { timeout: 5000 });
    const waited = Date.now() - t;
    assert.ok(waited < 1100, `剩下的時間約 1.2s − 已過的時間，不該又等滿 1.2s＋淡出（實際 ${waited}ms）`);
  });
});

test('引擎：第一個 goto 等主旨卡淡出才結束；之後的步驟照常；dry-run 不等主旨卡', async () => {
  const scenario = (name, extra = {}) => ({
    baseUrl: server.url,
    outDir: path.join(tmp, name),
    viewport: { width: 800, height: 500 },
    timeout: 5000,
    intro: { title: '主旨', holdMs: 2000, fadeMs: 500 },
    steps: [
      // 第一頁要載入得快：主旨卡跟頁面載入同時開始，頁面載入慢（例如輪詢到 networkidle 逾時）就已經涵蓋了停留時間
      { type: 'goto', url: '/page2.html', label: '開頁' },
      { type: 'wait', ms: 100, label: '停一下' },
      { type: 'goto', url: '/page2.html', label: '第二個 goto' },
    ],
    ...extra,
  });

  const r = await runScenario(scenario('engine'));
  assert.equal(r.ok, true, JSON.stringify(r.manifest.filter((m) => !m.ok)));
  const base = await runScenario(scenario('engine-base', { intro: undefined }));
  const len = (m) => m.tEndMs - m.tStartMs;
  assert.ok(len(r.manifest[0]) >= 2400, `第一個 goto 應該等滿 hold＋fade（實際 ${len(r.manifest[0])}ms）`);
  assert.ok(len(r.manifest[0]) - len(base.manifest[0]) >= 800, `比沒有主旨卡的基準線久（卡片跟頁面載入同時開始，載入花掉的時間會算進停留）：有 ${len(r.manifest[0])}ms，基準 ${len(base.manifest[0])}ms`);
  // 第二個 goto 不再等：跟基準線差不多（頁面載入的時間兩邊一樣）
  assert.ok(Math.abs(len(r.manifest[2]) - len(base.manifest[2])) < 600, `第二個 goto 不該再等（有 ${len(r.manifest[2])}ms，基準 ${len(base.manifest[2])}ms）`);

  const dry = await runScenario(scenario('engine-dry', { intro: { title: '主旨', holdMs: 5000, fadeMs: 5000 } }), { dryRun: true });
  assert.equal(dry.ok, true);
  assert.ok(dry.manifest[0].tEndMs < 4000, `dry-run 不該等主旨卡（實際 ${dry.manifest[0].tEndMs}ms）`);

  await assert.rejects(runScenario(scenario('engine-bad', { intro: { subtitle: '沒有標題' } })), /intro\.title 必填/);
});
