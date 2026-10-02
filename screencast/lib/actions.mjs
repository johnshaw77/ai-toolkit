import fs from 'node:fs';
import path from 'node:path';
import { locate, locatorSpec } from './locate.mjs';

// 錄影引擎的三個「非點擊」步驟：upload（上傳檔案）、press（按鍵）、scroll（捲動）。
// 跟 record-engine 共用游標與節奏（pace）；寫成獨立檔案，單元測試不必開瀏覽器。

/** upload 的 files 一律換成絕對路徑陣列；相對路徑以 scenario 檔所在的資料夾為準。 */
export function uploadFiles(step, baseDir) {
  const raw = step.files;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  if (!list.length || list.some((f) => typeof f !== 'string' || !f)) {
    throw new Error(`step "${step.label ?? 'upload'}"：files 要是檔案路徑（字串或字串陣列）`);
  }
  return list.map((f) => path.resolve(baseDir, f));
}

/** 開瀏覽器之前就檢查：upload 的檔案存在嗎、press 有沒有 key、scroll 有沒有要捲到哪裡。 */
export function validateActionSteps(steps, baseDir) {
  steps.forEach((step, i) => {
    const name = `step ${i + 1}「${step.label ?? step.type}」`;
    if (step.type === 'upload') {
      locatorSpec(step); // 沒有定位方式就在這裡報錯
      const missing = uploadFiles(step, baseDir).filter((f) => !fs.existsSync(f));
      if (missing.length) throw new Error(`${name}：找不到要上傳的檔案 ${missing.join('、')}`);
    } else if (step.type === 'press') {
      if (typeof step.key !== 'string' || !step.key.trim()) throw new Error(`${name}：press 需要 key（例如 'Enter'、'Control+Minus'）`);
    } else if (step.type === 'scroll') {
      const hasTo = step.to != null;
      const hasBy = step.by != null;
      if (hasTo === hasBy) throw new Error(`${name}：scroll 要寫 to（捲到哪個元素）或 by（捲幾像素），兩個擇一`);
      if (hasBy && !Number.isFinite(Number(step.by))) throw new Error(`${name}：scroll 的 by 要是數字（像素，正數往下）`);
      if (hasTo) locatorSpec(toSpec(step.to));
    }
  });
}

/** scroll 的 to 可以寫 CSS selector 字串，或和其他步驟一樣的定位物件（role+name、text、placeholder…）。 */
function toSpec(to) {
  return typeof to === 'string' ? { type: 'scroll', selector: to } : { type: 'scroll', ...to };
}

const KEY_NAMES = {
  Control: 'Ctrl', Meta: 'Cmd', Escape: 'Esc', Minus: '−', Equal: '+', Plus: '+', ArrowLeft: '←', ArrowRight: '→',
  ArrowUp: '↑', ArrowDown: '↓', Backspace: '⌫', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn',
};

/** 螢幕上顯示的按鍵文字：'Control+Minus' → 'Ctrl + −'，單一字母轉大寫。 */
export function keyLabelText(key) {
  return String(key)
    .split('+')
    .filter(Boolean)
    .map((k) => KEY_NAMES[k] ?? (k.length === 1 ? k.toUpperCase() : k))
    .join(' + ');
}

/**
 * upload：游標移到按鈕上「點下去」，檔案選擇器一開就把檔案帶進去。
 * selector 若是看不見的 <input type=file>（很多元件庫把它藏起來），沒有東西可以點，
 * 就直接 setInputFiles——這種情況請改指向畫面上看得到的那個按鈕，影片才有點擊的動作。
 */
export async function uploadWithCursor(page, step, files, pace, { timeout, clickWithCursor }) {
  const locator = locate(page, step);
  const isFileInput = await locator.evaluate((n) => n.tagName === 'INPUT' && n.type === 'file');
  if (isFileInput && !(await locator.isVisible())) {
    await locator.setInputFiles(files);
    return { at: Date.now(), box: null };
  }
  const chooser = page.waitForEvent('filechooser', { timeout });
  chooser.catch(() => {}); // 點擊失敗時，這個等待也會逾時；不要變成沒人接的 rejection
  const action = await clickWithCursor(page, locator, pace);
  await (await chooser).setFiles(files);
  if (pace.afterClick) await page.waitForTimeout(pace.afterClick);
  return action;
}

/** press：送出按鍵，在游標旁短暫顯示按了什麼（觀眾才知道有這個快速鍵）。 */
export async function pressWithLabel(page, step, pace) {
  await page.evaluate((text) => window.__pwKeyLabel?.(text), keyLabelText(step.key));
  if (pace.beforeKey) await page.waitForTimeout(pace.beforeKey);
  await page.keyboard.press(step.key);
  if (pace.afterKey) await page.waitForTimeout(pace.afterKey);
}

// 在頁面裡平滑捲動（容器 c 捲 dy 像素；ms 是 0 就直接到位）。回傳實際捲到的位置。
function smoothScroll(c, { dy, ms }) {
  return new Promise((resolve) => {
    const start = c.scrollTop;
    const target = Math.min(Math.max(start + dy, 0), c.scrollHeight - c.clientHeight);
    if (!ms || target === start) {
      c.scrollTop = target;
      resolve(c.scrollTop);
      return;
    }
    const t0 = performance.now();
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      c.scrollTop = start + (target - start) * u * u * (3 - 2 * u);
      if (u < 1) requestAnimationFrame(tick);
      else resolve(c.scrollTop);
    };
    requestAnimationFrame(tick);
  });
}

// 要捲多少才能讓目標元素落在容器的正中央（容器是頁面本身時，用視窗當範圍）
function distanceToCenter(c, target) {
  const isPage = c === document.scrollingElement;
  const box = isPage ? { top: 0, height: window.innerHeight } : c.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  return t.top + t.height / 2 - (box.top + box.height / 2);
}

const hasLocator = (step) => Boolean(step.selector || step.role || step.placeholder || step.text);

/**
 * scroll：游標先移到要捲的區域中央，再平滑捲動。
 *   selector（或 role／text／placeholder）：要捲的容器，沒寫就是整個頁面
 *   to：捲到這個元素（讓它落在容器正中央）；by：往下捲幾像素（負數往上）
 */
export async function scrollWithCursor(page, step, pace, moveTo) {
  const container = hasLocator(step) ? await locate(page, step).elementHandle() : await page.evaluateHandle(() => document.scrollingElement);
  const box = hasLocator(step) ? await locate(page, step).boundingBox() : null;
  const vp = page.viewportSize();
  await moveTo(page, box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: vp.width / 2, y: vp.height / 2 }, pace);

  let dy;
  if (step.to != null) {
    const target = await locate(page, toSpec(step.to)).elementHandle();
    dy = await container.evaluate(distanceToCenter, target);
  } else {
    dy = Number(step.by);
  }
  const ms = pace.scrollMs ? Math.min(Math.max(400 + Math.abs(dy) * 0.6, 600), 2000) : 0;
  await container.evaluate(smoothScroll, { dy, ms });
  if (pace.afterScroll) await page.waitForTimeout(pace.afterScroll);
}
