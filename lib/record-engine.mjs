import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { CURSOR_INIT_SCRIPT } from './cursor-overlay.mjs';
import { synthesizeNarration, muxNarration } from './narration.mjs';
import { cuesFromManifest, writeSubtitles } from './subtitles.mjs';

/**
 * 定位一個 step 指到的元素。三選一：
 *   selector — CSS selector
 *   role     — ARIA role（可搭配 name 用文字/正則篩選）
 *   text     — 用可見文字找（getByText）
 */
function locate(page, step) {
  if (step.selector) return page.locator(step.selector).first();
  if (step.role) return page.getByRole(step.role, step.name ? { name: new RegExp(step.name) } : undefined).first();
  if (step.text) return page.getByText(step.text, { exact: step.exact ?? false }).first();
  throw new Error(`step "${step.label ?? step.type}" 缺少 selector / role / text 其中一種定位方式`);
}

async function moveTo(page, point) {
  await page.mouse.move(point.x, point.y, { steps: 30 });
  await page.waitForTimeout(220);
}

async function moveToLocator(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('元素不可見，抓不到座標');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await moveTo(page, { x, y });
  return { x, y };
}

async function clickWithCursor(page, locator) {
  const { x, y } = await moveToLocator(page, locator);
  await page.evaluate(([x, y]) => window.__pwClickRipple?.(x, y), [x, y]);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function typeWithCursor(page, locator, text) {
  await clickWithCursor(page, locator);
  await locator.fill('');
  await page.keyboard.type(text, { delay: 55 });
  await page.waitForTimeout(300);
}

/**
 * 執行一份宣告式的操作腳本（scenario），錄影並附上假游標軌跡。
 *
 * scenario 格式：
 *   {
 *     baseUrl: 'https://...'            // 可省略，步驟自帶完整 url 時不需要
 *     viewport: { width, height }       // 預設 1440x900
 *     outDir: '路徑'                     // 影片/截圖/manifest 輸出位置
 *     abortOnError: true/false          // 預設 true：某步驟失敗就整支中止
 *     narration: { engine, voice, speed, baseUrl }  // 可省略，見下方 narration 欄位說明
 *     subtitles: { enabled, maxCharsPerCue }   // 可省略，預設開啟、每張字卡 18 字
 *     steps: [
 *       { type: 'goto',   url, label, narration },
 *       { type: 'fill',   selector|role|text, text, label, narration },
 *       { type: 'click',  selector|role|text, label, narration },
 *       { type: 'wait',   ms, label, narration },
 *     ]
 *   }
 *
 * 任何一個 step 都可以加 `narration:'一句口白'`。先把這句話合成語音、量出實際長度，
 * 再拿這個長度去決定該步驟要停留多久——操作步調跟著講稿走，天生對得齊，不用事後
 * 對嘴。錄完之後會把所有旁白疊到影片上，另存一份 demo-narrated.webm（需要系統
 * ffmpeg 裝了 libopus；`brew install ffmpeg`）。
 *
 * 有旁白就順便產出 demo.srt / demo.vtt —— 講稿跟時間戳錄的時候就都握在手上，
 * 不用事後跑語音辨識去對。
 *
 * 回傳 { videoPath, narratedVideoPath, manifestPath, manifest, srtPath, vttPath }。
 * manifest 記錄每個 step 相對影片開頭的起訖時間（毫秒），以及旁白自己的起點與長度。
 */
export async function runScenario(scenario) {
  const {
    baseUrl = '',
    viewport = { width: 1440, height: 900 },
    outDir,
    abortOnError = true,
    narration: narrationOpts = {},
    subtitles: subtitleOpts = {},
    steps,
  } = scenario;

  if (!outDir) throw new Error('scenario.outDir 必填');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // 先把有旁白的步驟全部合成好、量出時長——步驟停留多久由講稿長度決定，
  // 不是先錄影片再事後把語音塞進去對嘴。
  const narrationByIndex = new Map();
  const narrationSteps = steps.map((s, i) => [i, s]).filter(([, s]) => s.narration);
  if (narrationSteps.length) {
    console.log(`合成 ${narrationSteps.length} 句旁白…`);
    for (const [i, step] of narrationSteps) {
      const wavPath = path.join(outDir, 'narration', `step-${i + 1}.wav`);
      const result = await synthesizeNarration(step.narration, wavPath, narrationOpts);
      narrationByIndex.set(i, result);
    }
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: outDir, size: viewport },
  });
  await context.addInitScript(CURSOR_INIT_SCRIPT);
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('  [pageerror]', err.message));

  const manifest = [];
  const narrationClips = [];
  const t0 = Date.now();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const narrationAudio = narrationByIndex.get(i);
    const label = step.label ?? `${step.type} #${i + 1}`;
    console.log(`${i + 1}/${steps.length}) ${label}${narrationAudio ? ` 🔊(${(narrationAudio.durationMs / 1000).toFixed(1)}s)` : ''}`);
    const tStart = Date.now() - t0;
    let ok = true;
    let errorMessage;
    let narrationStartMs;

    try {
      switch (step.type) {
        case 'goto': {
          const url = /^https?:\/\//.test(step.url) ? step.url : baseUrl + step.url;
          await page.goto(url, { waitUntil: 'networkidle' });
          await moveTo(page, { x: viewport.width / 2, y: viewport.height / 2 });
          break;
        }
        case 'fill':
          await typeWithCursor(page, locate(page, step), step.text ?? '');
          break;
        case 'click':
          await clickWithCursor(page, locate(page, step));
          break;
        case 'wait':
          if (!narrationAudio) await page.waitForTimeout(step.ms ?? 800);
          break;
        default:
          throw new Error(`未知的 step.type: ${step.type}`);
      }

      // 有旁白的步驟：動作做完之後，停留到旁白講完的長度，讓畫面跟聲音對齊。
      if (narrationAudio) {
        narrationStartMs = Date.now() - t0;
        narrationClips.push({ path: narrationAudio.path, tStartMs: narrationStartMs });
        await page.waitForTimeout(narrationAudio.durationMs);
      }
    } catch (err) {
      ok = false;
      errorMessage = err.message;
      const shotPath = path.join(outDir, `error-step-${i + 1}.png`);
      await page.screenshot({ path: shotPath }).catch(() => {});
      console.error(`  ✗ 失敗: ${errorMessage}（截圖存在 ${shotPath}）`);
    }

    manifest.push({
      index: i + 1,
      type: step.type,
      label,
      ok,
      error: errorMessage,
      tStartMs: tStart,
      tEndMs: Date.now() - t0,
      narration: step.narration,
      // 字幕要的是「旁白幾時開始講」，不是「step 幾時開始」——動作先做完才播口白，
      // 兩者差的就是那段操作時間。沒存這兩個欄位的話，字幕會整句提早出現。
      narrationStartMs,
      narrationDurationMs: narrationAudio?.durationMs,
    });

    if (!ok && abortOnError) break;
  }

  await page.screenshot({ path: path.join(outDir, 'final.png'), fullPage: true }).catch(() => {});

  const video = page.video();
  await context.close();

  const videoPath = path.join(outDir, 'demo.webm');
  if (video) await video.saveAs(videoPath);
  await browser.close();

  // saveAs() 是複製，不是搬移 —— 清掉 Playwright 用 hash 命名的原始檔，只留 demo.webm。
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.webm') && f !== 'demo.webm') {
      fs.rmSync(path.join(outDir, f), { force: true });
    }
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ steps: manifest, totalMs: Date.now() - t0 }, null, 2));

  // 字幕直接從 manifest 推出來，不用再打一次 TTS——文字跟時間戳錄的時候就都有了。
  let srtPath;
  let vttPath;
  if (subtitleOpts.enabled !== false) {
    const cues = cuesFromManifest(manifest, { maxCharsPerCue: subtitleOpts.maxCharsPerCue ?? 18 });
    ({ srtPath, vttPath } = writeSubtitles(outDir, cues, subtitleOpts.basename ?? 'demo'));
    if (srtPath) console.log(`字幕: ${srtPath}（${cues.length} 張字卡）`);
  }

  let narratedVideoPath;
  if (narrationClips.length) {
    narratedVideoPath = path.join(outDir, 'demo-narrated.webm');
    try {
      muxNarration(videoPath, narrationClips, narratedVideoPath);
      console.log('已疊上旁白:', narratedVideoPath);
    } catch (err) {
      narratedVideoPath = undefined;
      console.error('  ✗ 疊旁白失敗（影片本身沒事，只是沒有聲音）:', err.message);
      console.error('    通常是系統沒裝完整版 ffmpeg：brew install ffmpeg');
    }
  }

  const failed = manifest.filter((m) => !m.ok);
  console.log(failed.length ? `完成，但有 ${failed.length} 步失敗` : '完成，全部步驟成功');
  console.log('影片:', videoPath);
  if (narratedVideoPath) console.log('帶旁白的影片:', narratedVideoPath);
  console.log('manifest:', manifestPath);

  return { videoPath, narratedVideoPath, manifestPath, manifest, srtPath, vttPath };
}
