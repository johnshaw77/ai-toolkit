import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_ZOOM, focusRect, planCamera, renderCamera, resolveZoom, scenarioUsesZoom } from '../lib/camera.mjs';

const VP = { width: 1280, height: 800 };
const FULL = { x: 0, y: 0, w: 1280, h: 800 };
const rectOf = (k) => ({ x: k.x, y: k.y, w: k.w, h: k.h });
const approx = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.01);

test('resolveZoom：數字、true、false、autoZoom 的組合', () => {
  assert.equal(resolveZoom({ type: 'click' }), null);
  assert.equal(resolveZoom({ type: 'click' }, { autoZoom: true }), DEFAULT_ZOOM);
  assert.equal(resolveZoom({ type: 'click' }, { autoZoom: { zoom: 1.6 } }), 1.6);
  assert.equal(resolveZoom({ type: 'fill', zoom: 2.5 }), 2.5);
  assert.equal(resolveZoom({ type: 'fill', zoom: true }), DEFAULT_ZOOM);
  assert.equal(resolveZoom({ type: 'click', zoom: false }, { autoZoom: true }), null);
  // 只有 click / fill 會放大
  assert.equal(resolveZoom({ type: 'goto', zoom: 2 }, { autoZoom: true }), null);
  assert.equal(resolveZoom({ type: 'wait' }, { autoZoom: true }), null);
});

test('resolveZoom：倍率小於 1 報錯；scenarioUsesZoom 判斷整支要不要高解析度錄', () => {
  assert.throws(() => resolveZoom({ type: 'click', zoom: 0.5, label: '點' }), /step "點" 的 zoom 要 >= 1/);
  assert.equal(scenarioUsesZoom({ steps: [{ type: 'click' }, { type: 'goto' }] }), false);
  assert.equal(scenarioUsesZoom({ steps: [{ type: 'click', zoom: 2 }] }), true);
  assert.equal(scenarioUsesZoom({ autoZoom: true, steps: [{ type: 'goto' }] }), false);
  assert.equal(scenarioUsesZoom({ autoZoom: true, steps: [{ type: 'fill' }] }), true);
});

test('focusRect：以元素中心為中心、長寬比同畫面', () => {
  const r = focusRect({ x: 600, y: 380, w: 80, h: 40 }, 2, VP);
  assert.ok(approx(r, { x: 320, y: 200, w: 640, h: 400 }), JSON.stringify(r));
});

test('focusRect：靠邊的元素，鏡頭不超出畫面', () => {
  assert.ok(approx(focusRect({ x: 5, y: 5, w: 40, h: 20 }, 2, VP), { x: 0, y: 0, w: 640, h: 400 }));
  assert.ok(approx(focusRect({ x: 1250, y: 780, w: 20, h: 10 }, 2, VP), { x: 640, y: 400, w: 640, h: 400 }));
});

test('focusRect：元素太大就降低倍率，大到不值得放大就全畫面', () => {
  // 寬 800 的元素：2 倍時框寬只有 640 放不下 → 倍率降到 0.9*1280/800 = 1.44
  const r = focusRect({ x: 200, y: 300, w: 800, h: 100 }, 2, VP);
  assert.ok(Math.abs(r.w - 1280 / 1.44) < 0.01, `w=${r.w}`);
  assert.ok(approx(focusRect({ x: 0, y: 0, w: 1200, h: 700 }, 2, VP), FULL));
});

const step = (o) => ({ ok: true, tStartMs: 0, tEndMs: 0, ...o });

test('planCamera：沒有要放大的步驟 → 全程全畫面', () => {
  const kfs = planCamera([step({ type: 'goto', tEndMs: 1000 }), step({ type: 'click', focus: { x: 1, y: 1, w: 9, h: 9 }, actionMs: 1500 })], { viewport: VP, totalMs: 3000 });
  assert.equal(kfs.length, 1);
  assert.ok(approx(rectOf(kfs[0]), FULL));
});

test('planCamera：推近在「按下去的那一刻」到位，最後拉回全畫面', () => {
  const focus = { x: 600, y: 380, w: 80, h: 40 };
  const kfs = planCamera([
    step({ type: 'goto', tStartMs: 0, tEndMs: 2000 }),
    step({ type: 'click', tStartMs: 2000, tEndMs: 5000, actionMs: 2800, focus, zoom: 2 }),
  ], { viewport: VP, totalMs: 5000 });
  const arrive = kfs.find((k) => k.t === 2800);
  assert.ok(arrive, JSON.stringify(kfs));
  assert.ok(approx(rectOf(arrive), focusRect(focus, 2, VP)));
  assert.equal(kfs[kfs.indexOf(arrive) - 1].t, 2100, '轉場 700ms');
  assert.ok(approx(rectOf(kfs.at(-1)), FULL), '結尾拉回全畫面');
  assert.ok(kfs.at(-1).t <= 5000);
});

test('planCamera：最後一步做完就拉回全畫面，不等到 totalMs', () => {
  const focus = { x: 600, y: 380, w: 80, h: 40 };
  const kfs = planCamera([
    step({ type: 'click', tStartMs: 0, tEndMs: 3000, actionMs: 800, focus, zoom: 2 }),
  ], { viewport: VP, totalMs: 9000 });
  assert.equal(kfs.at(-1).t, 3700);
  assert.ok(approx(rectOf(kfs.at(-1)), FULL));
});

test('planCamera：wait / waitFor 維持鏡頭；goto 拉回全畫面', () => {
  const focus = { x: 600, y: 380, w: 80, h: 40 };
  const kfs = planCamera([
    step({ type: 'click', tStartMs: 0, tEndMs: 2000, actionMs: 800, focus, zoom: 2 }),
    step({ type: 'waitFor', tStartMs: 2000, tEndMs: 3000 }),
    step({ type: 'wait', tStartMs: 3000, tEndMs: 4000 }),
    step({ type: 'goto', tStartMs: 4000, tEndMs: 6000 }),
  ], { viewport: VP, totalMs: 6000 });
  // 推近之後，到 goto 開始前都沒有新的關鍵格
  const between = kfs.filter((k) => k.t > 800 && k.t < 4000);
  assert.deepEqual(between, []);
  const out = kfs.find((k) => k.t === 4700);
  assert.ok(out && approx(rectOf(out), FULL), JSON.stringify(kfs));
});

test('planCamera：下一個焦點還在鏡頭中央 → 不動；離很遠 → 平移（倍率不變）', () => {
  const kfs = planCamera([
    step({ type: 'fill', tStartMs: 0, tEndMs: 2000, actionMs: 800, focus: { x: 600, y: 380, w: 80, h: 40 }, zoom: 2 }),
    step({ type: 'fill', tStartMs: 2000, tEndMs: 4000, actionMs: 2800, focus: { x: 600, y: 420, w: 80, h: 40 }, zoom: 2 }),
    step({ type: 'click', tStartMs: 4000, tEndMs: 6000, actionMs: 4800, focus: { x: 1100, y: 700, w: 80, h: 40 }, zoom: 2 }),
  ], { viewport: VP, totalMs: 8000 });
  assert.equal(kfs.filter((k) => k.t > 800 && k.t < 4000).length, 0, '第二步不該動');
  const pan = kfs.find((k) => k.t === 4800);
  assert.ok(pan, JSON.stringify(kfs));
  assert.equal(pan.w, 640);
  assert.ok(pan.x > 320, '往右平移');
});

test('planCamera：zoom:false 的步驟拉回全畫面；失敗的步驟不影響鏡頭', () => {
  const focus = { x: 600, y: 380, w: 80, h: 40 };
  const kfs = planCamera([
    step({ type: 'click', tStartMs: 0, tEndMs: 2000, actionMs: 800, focus, zoom: 2 }),
    step({ type: 'click', ok: false, tStartMs: 2000, tEndMs: 3000 }),
    step({ type: 'click', tStartMs: 3000, tEndMs: 5000, actionMs: 3800, focus }),
  ], { viewport: VP, totalMs: 5000 });
  assert.equal(kfs.filter((k) => k.t > 800 && k.t < 3100).length, 0);
  assert.ok(approx(rectOf(kfs.find((k) => k.t === 3800)), FULL));
});

test('planCamera：步驟很擠時關鍵格時間仍然遞增', () => {
  const steps = [];
  for (let i = 0; i < 40; i++) {
    steps.push(step({
      type: i % 5 === 0 ? 'goto' : 'click',
      tStartMs: i * 150, tEndMs: i * 150 + 150, actionMs: i * 150 + 50,
      focus: { x: (i * 97) % 1200, y: (i * 53) % 760, w: 40, h: 20 }, zoom: i % 3 ? 2 : 1.5,
    }));
  }
  const kfs = planCamera(steps, { viewport: VP, totalMs: 6000 });
  for (let i = 1; i < kfs.length; i++) assert.ok(kfs[i].t > kfs[i - 1].t, `第 ${i} 格 ${kfs[i].t} <= ${kfs[i - 1].t}`);
  for (const k of kfs) {
    assert.ok(k.x >= -0.01 && k.y >= -0.01 && k.x + k.w <= 1280.01 && k.y + k.h <= 800.01, JSON.stringify(k));
  }
});

// ---- 實際用 ffmpeg 渲染：四象限不同顏色的合成影片 ----

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-camera-'));

function quadrantVideo(file, { width, height, seconds }) {
  const w = width / 2;
  const h = height / 2;
  const src = (c) => `color=${c}:s=${w}x${h}:d=${seconds}:r=25`;
  execFileSync('ffmpeg', ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', src('red'), '-f', 'lavfi', '-i', src('lime'),
    '-f', 'lavfi', '-i', src('yellow'), '-f', 'lavfi', '-i', src('blue'),
    '-filter_complex', '[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0',
    '-c:v', 'libvpx', '-b:v', '2M', file]);
}

function pixel(file, seconds, x, y) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(seconds), '-i', file, '-frames:v', '1',
    // 先轉 RGB 再裁：yuv420p 的色度是 2x2 共用，不能直接裁成 1x1
    '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [...buf];
}
const isColor = (rgb, name) => {
  const [r, g, b] = rgb;
  const hi = (v) => v > 180;
  const lo = (v) => v < 80;
  return {
    red: hi(r) && lo(g) && lo(b),
    lime: lo(r) && hi(g) && lo(b),
    yellow: hi(r) && hi(g) && lo(b),
    blue: lo(r) && lo(g) && hi(b),
  }[name];
};

test('renderCamera：推近左上象限整個畫面都是紅，平移到右下整個畫面都是藍', () => {
  // 影片 2560x1600（2 倍像素），CSS 座標 1280x800，四個象限各 640x400 CSS px
  const src = path.join(tmp, 'quad.webm');
  quadrantVideo(src, { width: 2560, height: 1600, seconds: 4 });
  const kfs = [
    { t: 0, ...FULL }, { t: 1000, ...FULL },
    { t: 1500, x: 0, y: 0, w: 640, h: 400 }, { t: 2500, x: 0, y: 0, w: 640, h: 400 },
    { t: 3000, x: 640, y: 400, w: 640, h: 400 },
  ];
  const out = path.join(tmp, 'quad-zoomed.mp4');
  renderCamera(src, out, kfs, { scale: 2, output: { width: 1280, height: 800 } });

  const dims = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf-8' }).trim();
  assert.equal(dims, '1280,800');

  // 0.5s：全畫面，四個角各是自己的顏色
  assert.ok(isColor(pixel(out, 0.5, 20, 20), 'red'));
  assert.ok(isColor(pixel(out, 0.5, 1260, 20), 'lime'));
  assert.ok(isColor(pixel(out, 0.5, 20, 780), 'yellow'));
  assert.ok(isColor(pixel(out, 0.5, 1260, 780), 'blue'));
  // 2.0s：推近左上象限，四個角都是紅
  for (const [x, y] of [[20, 20], [1260, 20], [20, 780], [1260, 780]]) {
    assert.ok(isColor(pixel(out, 2.0, x, y), 'red'), `2.0s (${x},${y}) = ${pixel(out, 2.0, x, y)}`);
  }
  // 3.5s：平移到右下象限，四個角都是藍
  for (const [x, y] of [[20, 20], [1260, 20], [20, 780], [1260, 780]]) {
    assert.ok(isColor(pixel(out, 3.5, x, y), 'blue'), `3.5s (${x},${y}) = ${pixel(out, 3.5, x, y)}`);
  }
});

test('renderCamera：上百個關鍵格的運算式 ffmpeg 也吃得下', () => {
  const src = path.join(tmp, 'small.webm');
  quadrantVideo(src, { width: 320, height: 200, seconds: 2 });
  const kfs = [];
  for (let i = 0; i < 150; i++) {
    const zoomed = i % 2 === 1;
    kfs.push(zoomed ? { t: i * 13, x: (i % 7) * 10, y: (i % 5) * 10, w: 80, h: 50 } : { t: i * 13, x: 0, y: 0, w: 160, h: 100 });
  }
  const out = path.join(tmp, 'small-zoomed.mp4');
  renderCamera(src, out, kfs, { scale: 2, output: { width: 160, height: 100 } });
  assert.ok(fs.statSync(out).size > 0);
});
