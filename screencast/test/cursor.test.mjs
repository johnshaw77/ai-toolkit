import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { CURSOR_INIT_SCRIPT } from '../lib/cursor-overlay.mjs';
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

const cursorTransform = (page) =>
  page.evaluate(() => document.getElementById('__pw_fake_cursor')?.style.transform);

test('游標掛在 <html> 底下並跟著 mousemove 移動', async () => {
  const context = await browser.newContext();
  await context.addInitScript(CURSOR_INIT_SCRIPT);
  const page = await context.newPage();
  await page.goto(`${server.url}/index.html`);
  assert.equal(await page.evaluate(() => document.getElementById('__pw_fake_cursor').parentElement.tagName), 'HTML');
  await page.mouse.move(300, 200);
  assert.equal(await cursorTransform(page), 'translate(298px, 198px)');
  await context.close();
});

test('點連結換頁後，游標停在原位而不是消失', async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await context.addInitScript(CURSOR_INIT_SCRIPT);
  const page = await context.newPage();
  await page.goto(`${server.url}/index.html`);
  const link = page.getByRole('link', { name: '下一頁' });
  await link.scrollIntoViewIfNeeded();
  const box = await link.boundingBox();
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await Promise.all([page.waitForURL('**/page2.html'), page.mouse.click(x, y)]);
  // 新頁面：還沒收到任何 mousemove
  assert.equal(await cursorTransform(page), `translate(${x - 2}px, ${y - 2}px)`);
  await context.close();
});

test('點擊漣漪：__pwClickRipple 會把漣漪移到指定位置並播放動畫', async () => {
  const context = await browser.newContext();
  await context.addInitScript(CURSOR_INIT_SCRIPT);
  const page = await context.newPage();
  await page.goto(`${server.url}/page2.html`);
  const state = await page.evaluate(() => {
    window.__pwClickRipple(120, 80);
    const r = document.getElementById('__pw_fake_ripple');
    return { left: r.style.left, top: r.style.top, active: r.classList.contains('active') };
  });
  assert.deepEqual(state, { left: '120px', top: '80px', active: true });
  await context.close();
});
