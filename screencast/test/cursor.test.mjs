import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { CURSOR_INIT_SCRIPT, cursorInitScript, cursorOptions } from '../lib/cursor-overlay.mjs';
import { startServer } from './helpers/server.mjs';

let server;
let browser;
before(async () => {
  server = await startServer();
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

async function openPage(script, path = '/index.html', contextOpts = {}) {
  const context = await browser.newContext(contextOpts);
  await context.addInitScript(script);
  const page = await context.newPage();
  await page.goto(`${server.url}${path}`);
  return { context, page };
}

// 箭頭尖端在畫面上的實際位置：path 的外框左上角就是尖端 (4,2)
const tipPosition = (page) => page.evaluate(() => {
  const r = document.querySelector('#__pw_fake_cursor path').getBoundingClientRect();
  return { x: r.left, y: r.top };
});

const near = (actual, expected, label) => {
  assert.ok(Math.abs(actual.x - expected.x) <= 1 && Math.abs(actual.y - expected.y) <= 1,
    `${label}：尖端在 (${actual.x}, ${actual.y})，應該在 (${expected.x}, ${expected.y})`);
};

test('cursorOptions：預設放大 1.5 倍', () => {
  assert.deepEqual(cursorOptions(), { size: 36, tipX: 6, tipY: 3, rippleSize: 60, rippleColor: 'rgba(255,100,50,0.55)' });
  assert.equal(cursorOptions({ scale: 1 }).size, 24);
  assert.deepEqual(cursorOptions({ size: 48 }), { size: 48, tipX: 8, tipY: 4, rippleSize: 60, rippleColor: 'rgba(255,100,50,0.55)' });
  assert.equal(cursorOptions({ scale: 2, rippleSize: 30 }).rippleSize, 30);
});

test('cursorOptions：scale／size 不是正數就報錯', () => {
  assert.throws(() => cursorOptions({ scale: 0 }), /cursor.scale 要是正數/);
  assert.throws(() => cursorOptions({ scale: 'big' }), /cursor.scale 要是正數/);
  assert.throws(() => cursorOptions({ size: -3 }), /cursor.size 要是正數/);
});

test('游標掛在 <html> 底下，預設 36px，尖端對準滑鼠座標', async () => {
  const { context, page } = await openPage(CURSOR_INIT_SCRIPT);
  assert.equal(await page.evaluate(() => document.getElementById('__pw_fake_cursor').parentElement.tagName), 'HTML');
  await page.mouse.move(300, 200);
  const box = await page.evaluate(() => document.querySelector('#__pw_fake_cursor svg').getBoundingClientRect().width);
  assert.equal(box, 36);
  near(await tipPosition(page), { x: 300, y: 200 }, '預設大小');
  await context.close();
});

test('不同大小的尖端都對準滑鼠座標', async () => {
  for (const opts of [{ scale: 1 }, { scale: 2.5 }, { size: 50 }]) {
    const { context, page } = await openPage(cursorInitScript(opts));
    await page.mouse.move(420, 260);
    near(await tipPosition(page), { x: 420, y: 260 }, JSON.stringify(opts));
    await context.close();
  }
});

test('點連結換頁後，游標停在原位而不是消失', async () => {
  const { context, page } = await openPage(CURSOR_INIT_SCRIPT, '/index.html', { viewport: { width: 1000, height: 700 } });
  const link = page.getByRole('link', { name: '下一頁' });
  await link.scrollIntoViewIfNeeded();
  const box = await link.boundingBox();
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await Promise.all([page.waitForURL('**/page2.html'), page.mouse.click(x, y)]);
  // 新頁面：還沒收到任何 mousemove
  near(await tipPosition(page), { x, y }, '換頁後');
  await context.close();
});

test('點擊漣漪：大小跟著設定、圓心在點擊位置、會播放動畫', async () => {
  const { context, page } = await openPage(cursorInitScript({ scale: 2, rippleColor: 'rgb(0, 128, 255)' }), '/page2.html');
  const state = await page.evaluate(() => {
    window.__pwClickRipple(120, 80);
    const el = document.getElementById('__pw_fake_ripple');
    el.style.animation = 'none'; // 量圓心時不要被動畫的 scale 干擾
    const r = el.getBoundingClientRect();
    return {
      width: r.width,
      center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      color: getComputedStyle(el).backgroundColor,
      active: el.classList.contains('active'),
    };
  });
  assert.equal(state.width, 80);
  near(state.center, { x: 120, y: 80 }, '漣漪圓心');
  assert.equal(state.color, 'rgb(0, 128, 255)');
  assert.equal(state.active, true);
  await context.close();
});
