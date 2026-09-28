// 端對端：對本地 fixture 網站跑一支完整的 scenario（接假 TTS），
// 檢查影片、音軌、mp4、字幕、manifest 是否彼此對得上。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { runScenario } from '../lib/record-engine.mjs';
import { probe } from './helpers/media.mjs';
import { fakeDurationMs, startServer } from './helpers/server.mjs';

let server;
let tmp;
before(async () => {
  server = await startServer();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'screencast-e2e-'));
});
after(async () => { await server.close(); });

const LONG_LINE = '接著到下一頁看看，這一句故意寫得比較長，用來測試字幕切句。';

function fullScenario(outDir) {
  return {
    baseUrl: server.url,
    outDir,
    viewport: { width: 1000, height: 700 },
    timeout: 5000,
    narration: {
      engine: 'openai-compatible',
      baseUrl: server.ttsBaseUrl,
      apiKeyEnv: 'SCREENCAST_TEST_NO_SUCH_KEY',
      voice: 'test',
      cache: path.join(tmp, 'tts-cache'),
    },
    subtitles: { maxCharsPerCue: 14 },
    steps: [
      // 這頁一直在輪詢，networkidle 等不到——不能卡住
      { type: 'goto', url: '/index.html', label: '開表單', narration: '開啟表單頁。' },
      { type: 'fill', placeholder: '請輸入姓名', value: '王小明', label: '填姓名' },
      // 舊寫法：text 當輸入內容
      { type: 'fill', selector: '#email', text: 'a@b.c', label: '填 email' },
      // 名字含括號加號；頁面上另有含「儲存」的標題
      { type: 'click', role: 'button', name: '儲存 (Ctrl+S)', label: '點儲存', narration: '點擊儲存按鈕。' },
      // 結果 800ms 後才出現
      { type: 'waitFor', text: '已儲存：王小明', label: '等儲存完成' },
      { type: 'click', text: '下一頁', label: '到下一頁', narration: LONG_LINE },
      { type: 'waitFor', role: 'heading', name: '第二頁', label: '確認到第二頁' },
      { type: 'wait', ms: 300, label: '停一下' },
    ],
  };
}

test('完整錄一支：步驟、影片、旁白、mp4、字幕都對得上', async () => {
  const outDir = path.join(tmp, 'full');
  const r = await runScenario(fullScenario(outDir));

  assert.equal(r.ok, true, JSON.stringify(r.manifest.filter((m) => !m.ok), null, 2));
  assert.equal(r.manifest.length, 8);
  assert.ok(r.manifest[0].tEndMs < 10000, `goto 輪詢頁花了 ${r.manifest[0].tEndMs}ms，疑似卡在 networkidle`);
  assert.equal(server.ttsCalls.length, 3);

  // 影片長度 ≈ manifest 總長
  const manifestJson = JSON.parse(fs.readFileSync(r.manifestPath, 'utf-8'));
  const webm = probe(r.videoPath);
  assert.deepEqual(webm.streams.map((s) => s.codec_type), ['video']);
  assert.ok(Math.abs(webm.durationMs - manifestJson.totalMs) < 2000, `影片 ${webm.durationMs}ms vs manifest ${manifestJson.totalMs}ms`);

  const narrated = probe(r.narratedVideoPath);
  assert.deepEqual(narrated.streams.map((s) => s.codec_name).sort(), ['opus', 'vp8']);

  const mp4 = probe(r.mp4Path);
  assert.deepEqual(mp4.streams.map((s) => s.codec_name).sort(), ['aac', 'h264']);
  assert.ok(Math.abs(mp4.durationMs - narrated.durationMs) < 500);

  // 旁白：動作做完才開始，且停留時間 = 音檔長度
  for (const m of r.manifest.filter((s) => s.narration)) {
    assert.equal(m.narrationDurationMs, fakeDurationMs(m.narration));
    assert.ok(m.narrationStartMs >= m.tStartMs);
    assert.ok(m.tEndMs - m.narrationStartMs >= m.narrationDurationMs);
  }
  const clickStep = r.manifest[3];
  assert.ok(clickStep.narrationStartMs - clickStep.tStartMs > 300, '點擊步驟的旁白應該在游標移動與點擊之後才開始');

  // 字幕：第一張字卡起點 = 第一句旁白的 narrationStartMs；長句被切成多張
  const srt = fs.readFileSync(r.srtPath, 'utf-8');
  const cues = srt.trim().split('\n\n');
  assert.ok(cues.length >= 4, srt);
  const firstStart = srt.split('\n')[1].split(' --> ')[0];
  const ms = r.manifest[0].narrationStartMs;
  const expected = `00:00:${String(Math.floor(ms / 1000)).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  assert.equal(firstStart, expected);
  assert.match(fs.readFileSync(r.vttPath, 'utf-8'), /^WEBVTT/);

  // 最後停在第二頁
  assert.ok(fs.existsSync(path.join(outDir, 'final.png')));
  const leftovers = fs.readdirSync(outDir).filter((f) => f.endsWith('.webm'));
  assert.deepEqual(leftovers.sort(), ['demo-narrated.webm', 'demo.webm']);
});

test('dry-run：不錄影、不打 TTS、不動 outDir', async () => {
  const outDir = path.join(tmp, 'full');
  const before = fs.readdirSync(outDir).sort();
  const callsBefore = server.ttsCalls.length;

  const t = Date.now();
  const r = await runScenario(fullScenario(outDir), { dryRun: true });
  const elapsed = Date.now() - t;

  assert.equal(r.ok, true);
  assert.equal(r.videoPath, undefined);
  assert.equal(r.mp4Path, undefined);
  assert.equal(server.ttsCalls.length, callsBefore);
  assert.deepEqual(fs.readdirSync(outDir).sort(), before);
  assert.notEqual(r.outDir, outDir);
  assert.equal(JSON.parse(fs.readFileSync(r.manifestPath, 'utf-8')).dryRun, true);
  assert.ok(elapsed < 12000, `dry-run 花了 ${elapsed}ms`);
});

test('重錄同一支：旁白全部來自快取', async () => {
  const callsBefore = server.ttsCalls.length;
  const scenario = fullScenario(path.join(tmp, 'again'));
  scenario.output = { mp4: false };
  const r = await runScenario(scenario);
  assert.equal(r.ok, true);
  assert.equal(server.ttsCalls.length, callsBefore);
  assert.equal(r.mp4Path, undefined);
});

test('某步驟失敗：截圖、中止、回報 ok:false', async () => {
  const outDir = path.join(tmp, 'broken');
  const r = await runScenario({
    baseUrl: server.url,
    outDir,
    viewport: { width: 800, height: 600 },
    timeout: 1500,
    output: { mp4: false },
    steps: [
      { type: 'goto', url: '/index.html' },
      { type: 'click', selector: '#does-not-exist', label: '點不存在的按鈕' },
      { type: 'wait', ms: 100, label: '不應該跑到' },
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(r.manifest.length, 2);
  assert.equal(r.manifest[1].ok, false);
  assert.match(r.manifest[1].error, /Timeout/);
  assert.ok(fs.existsSync(path.join(outDir, 'error-step-2.png')));
  assert.ok(fs.existsSync(r.videoPath), '失敗了影片還是要存下來，方便看出錯前發生什麼');
});

test('abortOnError:false：失敗後繼續跑完', async () => {
  const r = await runScenario({
    baseUrl: server.url,
    outDir: path.join(tmp, 'continue'),
    viewport: { width: 800, height: 600 },
    timeout: 1000,
    abortOnError: false,
    output: { mp4: false },
    steps: [
      { type: 'goto', url: '/page2.html' },
      { type: 'click', selector: '#nope' },
      { type: 'click', text: '回首頁' },
    ],
  }, { dryRun: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.manifest.map((m) => m.ok), [true, false, true]);
});

test('outDir 指到不相干的資料夾：開瀏覽器前就拒絕', async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'project-'));
  fs.writeFileSync(path.join(dir, 'important.txt'), '別刪我');
  await assert.rejects(runScenario({ outDir: dir, steps: [] }), /拒絕整個刪掉/);
  assert.equal(fs.readFileSync(path.join(dir, 'important.txt'), 'utf-8'), '別刪我');
});

test('CLI：--dry-run 通過 exit 0，有步驟失敗 exit 1', async () => {
  const { execFile } = await import('node:child_process');
  const RUN = new URL('../run.mjs', import.meta.url).pathname;
  // server 跟測試在同一個 process，要用非同步子程序，不然 event loop 被卡住、server 回不了
  const runCli = (args) => new Promise((resolve) => {
    execFile('node', [RUN, ...args], (err, stdout) => resolve({ code: err ? err.code : 0, stdout }));
  });
  const write = (name, steps) => {
    const file = path.join(tmp, `${name}.mjs`);
    fs.writeFileSync(file, `export const scenario = ${JSON.stringify({
      baseUrl: server.url, outDir: path.join(tmp, `cli-${name}`), timeout: 1500, steps,
    })};\n`);
    return file;
  };

  const good = await runCli(['--dry-run', write('good', [{ type: 'goto', url: '/page2.html' }, { type: 'click', text: '回首頁' }])]);
  assert.equal(good.code, 0, good.stdout);
  assert.match(good.stdout, /dry-run 通過/);
  assert.ok(!fs.existsSync(path.join(tmp, 'cli-good')), 'dry-run 不該建立 outDir');

  const bad = await runCli(['--dry-run', write('bad', [{ type: 'goto', url: '/page2.html' }, { type: 'click', selector: '#nope' }])]);
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /1 步失敗/);

  const usage = await runCli([]);
  assert.equal(usage.code, 1);
});
