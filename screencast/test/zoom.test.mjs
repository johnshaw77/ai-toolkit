// 運鏡端對端：autoZoom 錄一支（接假 TTS），再用 --zoom-only 改設定重新輸出。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { rezoomScenario, runScenario } from '../lib/record-engine.mjs';
import { probe } from './helpers/media.mjs';
import { startServer } from './helpers/server.mjs';

let server;
let tmp;
before(async () => {
  server = await startServer();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-zoom-'));
});
after(async () => { await server.close(); });

function zoomScenario(outDir, extra = {}) {
  return {
    baseUrl: server.url,
    outDir,
    viewport: { width: 1000, height: 700 },
    timeout: 5000,
    autoZoom: true,
    narration: {
      engine: 'openai-compatible', baseUrl: server.ttsBaseUrl,
      apiKeyEnv: 'SCREENCAST_TEST_NO_SUCH_KEY', cache: path.join(tmp, 'tts-cache'),
    },
    steps: [
      { type: 'goto', url: '/index.html', label: '開表單', narration: '開啟表單。' },
      { type: 'fill', placeholder: '請輸入姓名', value: '王小明', label: '填姓名', narration: '填姓名。' },
      { type: 'click', role: 'button', name: '儲存 (Ctrl+S)', label: '點儲存', narration: '點儲存。' },
      { type: 'waitFor', text: '已儲存：王小明', label: '等結果' },
    ],
    ...extra,
  };
}

let recorded;
const outDir = () => path.join(tmp, 'zoom');

test('autoZoom：2 倍像素錄影、manifest 記下點擊位置、另外輸出運鏡版', async () => {
  recorded = await runScenario(zoomScenario(outDir()));
  assert.equal(recorded.ok, true, JSON.stringify(recorded.manifest.filter((m) => !m.ok)));

  const dims = (f) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf-8' }).trim();
  assert.equal(dims(recorded.videoPath), '2000,1400', '錄影是 2 倍像素');
  assert.equal(dims(recorded.mp4Path), '1000,700', 'demo.mp4 縮回 viewport 大小');
  assert.equal(dims(recorded.zoomedPath), '1000,700');

  const zoomed = probe(recorded.zoomedPath);
  assert.deepEqual(zoomed.streams.map((s) => s.codec_name).sort(), ['aac', 'h264']);
  assert.ok(Math.abs(zoomed.durationMs - probe(recorded.narratedVideoPath).durationMs) < 500);

  const m = JSON.parse(fs.readFileSync(recorded.manifestPath, 'utf-8'));
  assert.equal(m.videoScale, 2);
  assert.deepEqual(m.viewport, { width: 1000, height: 700 });
  const [gotoStep, fillStep, clickStep, waitStep] = m.steps;
  assert.equal(gotoStep.zoom, undefined);
  assert.equal(waitStep.zoom, undefined);
  for (const s of [fillStep, clickStep]) {
    assert.equal(s.zoom, 2);
    assert.ok(s.focus.w > 0 && s.focus.h > 0, JSON.stringify(s.focus));
    assert.ok(s.actionMs > s.tStartMs && s.actionMs < s.tEndMs, `actionMs ${s.actionMs} 應在 ${s.tStartMs}~${s.tEndMs}`);
  }
  // 鏡頭：有推近（寬度 500＝1000/2），最後回到全畫面
  assert.ok(m.camera.some((k) => Math.abs(k.w - 500) < 0.01), JSON.stringify(m.camera));
  assert.equal(m.camera.at(-1).w, 1000);
});

test('--zoom-only：只重新輸出運鏡版，不重錄、不打 TTS', async () => {
  const webmMtime = fs.statSync(recorded.videoPath).mtimeMs;
  const zoomedMtime = fs.statSync(recorded.zoomedPath).mtimeMs;
  const calls = server.ttsCalls.length;

  const scenario = zoomScenario(outDir(), { autoZoom: false });
  scenario.steps[2].zoom = 3;
  const r = await rezoomScenario(scenario);

  assert.equal(r.ok, true);
  assert.equal(fs.statSync(recorded.videoPath).mtimeMs, webmMtime, 'demo.webm 不該被動到');
  assert.ok(fs.statSync(r.zoomedPath).mtimeMs > zoomedMtime, 'demo-zoomed.mp4 要重新輸出');
  assert.equal(server.ttsCalls.length, calls);
  const m = JSON.parse(fs.readFileSync(recorded.manifestPath, 'utf-8'));
  assert.deepEqual(m.steps.map((s) => s.zoom), [undefined, undefined, 3, undefined]);
  assert.ok(m.camera.some((k) => Math.abs(k.w - 1000 / 3) < 0.5), '倍率 3 的鏡頭');
});

test('--zoom-only：都不放大了就移除運鏡版', async () => {
  const r = await rezoomScenario(zoomScenario(outDir(), { autoZoom: false }));
  assert.equal(r.zoomedPath, undefined);
  assert.ok(!fs.existsSync(path.join(outDir(), 'demo-zoomed.mp4')));
});

test('--zoom-only：步驟跟錄影時不一樣就拒絕', async () => {
  const scenario = zoomScenario(outDir());
  scenario.steps.push({ type: 'click', text: '下一頁' });
  await assert.rejects(rezoomScenario(scenario), /步驟跟錄影時不一樣/);
  const swapped = zoomScenario(outDir());
  swapped.steps[1] = { type: 'click', text: '下一頁' };
  await assert.rejects(rezoomScenario(swapped), /步驟跟錄影時不一樣/);
});

test('--zoom-only：沒錄過、或是 dry-run 的輸出，給明確的錯誤', async () => {
  await assert.rejects(rezoomScenario(zoomScenario(path.join(tmp, 'never'))), /要先正式錄一次/);
  const dry = await runScenario(zoomScenario(path.join(tmp, 'dry')), { dryRun: true });
  await assert.rejects(rezoomScenario({ ...zoomScenario(dry.outDir), outDir: dry.outDir }), /dry-run/);
});

test('step.zoom 寫錯：開瀏覽器前就報錯', async () => {
  const scenario = zoomScenario(path.join(tmp, 'bad'));
  scenario.steps[1].zoom = 0.5;
  await assert.rejects(runScenario(scenario), /zoom 要 >= 1/);
  assert.ok(!fs.existsSync(path.join(tmp, 'bad')));
});

test('autoZoom 預設：等了才出現的 waitFor 在結果出現時拉回全畫面；releaseOnWait:false 則維持', async () => {
  const outA = path.join(tmp, 'release-on');
  const a = await runScenario(zoomScenario(outA));
  const mA = JSON.parse(fs.readFileSync(a.manifestPath, 'utf-8'));
  assert.equal(mA.releaseOnWait, true);
  const waitA = mA.steps[3];
  assert.ok(waitA.actionMs != null, 'waitFor 要記下等到的時間點');
  assert.ok(mA.camera.some((k) => k.w === 1000 && k.t > mA.steps[2].actionMs && k.t <= waitA.actionMs), '結果出現前後鏡頭回到全畫面：' + JSON.stringify(mA.camera));

  const outB = path.join(tmp, 'release-off');
  const b = await runScenario(zoomScenario(outB, { autoZoom: { zoom: 2, releaseOnWait: false } }));
  const mB = JSON.parse(fs.readFileSync(b.manifestPath, 'utf-8'));
  assert.equal(mB.releaseOnWait, false);
  const waitB = mB.steps[3];
  assert.ok(!mB.camera.some((k) => k.w === 1000 && k.t > mB.steps[2].actionMs && k.t <= waitB.actionMs), '關掉後 waitFor 期間維持放大：' + JSON.stringify(mB.camera));

  // --zoom-only 也吃新規則：把 B 的設定改成預設（開），不重錄就會拉回
  const re = await rezoomScenario(zoomScenario(outB));
  assert.ok(re.ok);
  const mB2 = JSON.parse(fs.readFileSync(path.join(outB, 'manifest.json'), 'utf-8'));
  assert.equal(mB2.releaseOnWait, true);
  assert.ok(mB2.camera.some((k) => k.w === 1000 && k.t > mB2.steps[2].actionMs && k.t <= mB2.steps[3].actionMs));
});
