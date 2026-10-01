import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planCamera, renderCamera, resolveZoom, scenarioUsesZoom } from './camera.mjs';
import { cursorInitScript } from './cursor-overlay.mjs';
import { encodeMp4 } from './encode.mjs';
import { fillValue, locate } from './locate.mjs';
import { synthesizeNarration, muxNarration } from './narration.mjs';
import { cuesFromManifest, writeSubtitles } from './subtitles.mjs';

// 錄影時的節奏：游標平滑移動、點擊有停頓、打字有速度感，觀眾才看得清楚。
const RECORD_PACE = {
  moveSteps: 30, afterMove: 220, clickHold: 90, afterClick: 500, typeDelay: 55, afterType: 300,
};
// dry-run 只是確認 selector 都對得到，不需要給人看，全部壓到最短。
const DRY_RUN_PACE = {
  moveSteps: 1, afterMove: 0, clickHold: 0, afterClick: 0, typeDelay: 0, afterType: 0,
};

// outDir 裡放這個檔，下次才敢整個刪掉重建——避免 outDir 不小心指到專案根目錄
// 或別的資料夾時，一跑就把裡面的東西全刪光。
const OUT_MARKER = '.screencast-out';

/**
 * 清空並重建 outDir。只有在資料夾不存在、是空的、或者看得出是之前的錄影輸出
 * （有標記檔，或舊版留下的 manifest.json）時才動手，否則拒絕。
 */
export function prepareOutDir(outDir) {
  if (fs.existsSync(outDir)) {
    const entries = fs.readdirSync(outDir).filter((f) => f !== '.DS_Store');
    const looksLikeOurs = entries.includes(OUT_MARKER) || entries.includes('manifest.json');
    if (entries.length && !looksLikeOurs) {
      throw new Error(
        `outDir 不是空的，也不像之前的錄影輸出，拒絕整個刪掉：${outDir}\n` +
        '    請把 outDir 指到一個專用的資料夾（例如 scenario 旁邊的 out/<名稱>）',
      );
    }
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, OUT_MARKER), '這個資料夾是 screencast 的輸出，每次錄影都會整個刪掉重建。\n');
}

async function moveTo(page, point, pace) {
  await page.mouse.move(point.x, point.y, { steps: pace.moveSteps });
  if (pace.afterMove) await page.waitForTimeout(pace.afterMove);
}

async function moveToLocator(page, locator, pace) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('元素不可見，抓不到座標');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await moveTo(page, { x, y }, pace);
  return { x, y, box };
}

// 回傳點擊的元素外框（CSS px）與按下去的時間點——鏡頭運動要知道
// 「什麼時候、往哪裡」推近。
// `button`：'left'（預設）或 'right'（右鍵 → 觸發 contextmenu）。
// `times`：2 ＝ 雙擊（click、click、dblclick 依序觸發，和真人雙擊一樣），第二下的漣漪晚一點出現。
async function clickWithCursor(page, locator, pace, { button = 'left', times = 1 } = {}) {
  const { x, y, box } = await moveToLocator(page, locator, pace);
  await page.evaluate(([x, y]) => window.__pwClickRipple?.(x, y), [x, y]);
  const at = Date.now();
  for (let n = 1; n <= times; n++) {
    if (n > 1) await page.waitForTimeout(90);
    await page.mouse.down({ button, clickCount: n });
    if (pace.clickHold) await page.waitForTimeout(pace.clickHold);
    await page.mouse.up({ button, clickCount: n });
  }
  if (pace.afterClick) await page.waitForTimeout(pace.afterClick);
  return { box, at };
}

async function typeWithCursor(page, locator, text, pace) {
  const action = await clickWithCursor(page, locator, pace);
  await locator.fill('');
  await page.keyboard.type(text, { delay: pace.typeDelay });
  if (pace.afterType) await page.waitForTimeout(pace.afterType);
  return action;
}

/**
 * Windows 上 `new URL(..., import.meta.url).pathname` 會得到 /C:/Users/... ，
 * 以前的範例就是這樣寫 outDir 的。這裡把開頭多的斜線拿掉，舊 scenario 照樣能跑。
 */
export function normalizeOutDir(outDir, platform = process.platform) {
  const s = String(outDir);
  if (platform === 'win32' && /^\/[A-Za-z]:[\/\\]/.test(s)) return path.win32.normalize(s.slice(1));
  return s;
}

const evenSize = (vp) => ({ width: vp.width - (vp.width % 2), height: vp.height - (vp.height % 2) });

/**
 * 依 manifest 算鏡頭路徑、輸出 demo-zoomed.mp4。正式錄影與 --zoom-only 共用。
 */
function renderZoomed(outDir, manifestJson, sourceVideo) {
  const { steps, viewport, videoScale = 1, totalMs } = manifestJson;
  const camera = planCamera(steps, { viewport, totalMs });
  const zoomedPath = path.join(outDir, 'demo-zoomed.mp4');
  renderCamera(sourceVideo, zoomedPath, camera, { scale: videoScale, output: evenSize(viewport) });
  return { zoomedPath, camera };
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
 *     timeout: 15000                    // 找元素、等畫面的逾時（毫秒）
 *     waitUntil: 'load'                 // goto 等到哪個階段，見下方 goto 說明
 *     narration: { engine, voice, speed, baseUrl, cache }  // 可省略
 *     subtitles: { enabled, maxCharsPerCue }   // 可省略，預設開啟、每張字卡 18 字
 *     output: { mp4 }                   // 預設會多轉一份 demo.mp4
 *     cursor: { scale, size, rippleSize, rippleColor }  // 假游標大小，預設放大 1.5 倍
 *     autoZoom: true | { zoom }         // click / fill 自動推近，另輸出 demo-zoomed.mp4
 *     videoScale: 2                     // 錄影像素倍率；有 zoom 時預設 2（放大才不糊）
 *     steps: [
 *       { type: 'goto',    url, waitUntil, label, narration },
 *       { type: 'fill',    selector|role+name|placeholder, value, zoom, label, narration },
 *       { type: 'click',   selector|role+name|placeholder|text, zoom, label, narration },
 *       { type: 'dblclick',   （定位同 click）雙擊 },
 *       { type: 'rightClick', （定位同 click）右鍵，會打開頁面的 contextmenu },
 *       { type: 'waitFor', selector|role+name|placeholder|text, state, timeout, label },
 *       { type: 'wait',    ms, label, narration },
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
 * options.dryRun：只走一次流程確認每一步都對得到元素——不錄影、不合成語音、
 * 不刪 outDir（輸出放到系統暫存資料夾），幾秒內就知道 scenario 能不能跑。
 *
 * zoom：step.zoom 是數字就用那個倍率、true 用預設倍率、false 不放大；沒寫就看
 * scenario.autoZoom。有任何一步會放大，就用 2 倍像素錄影，並另外輸出 demo-zoomed.mp4。
 *
 * 回傳 { ok, videoPath, narratedVideoPath, mp4Path, zoomedPath, manifestPath, manifest, srtPath, vttPath, outDir }。
 * manifest 記錄每個 step 相對影片開頭的起訖時間（毫秒），以及旁白自己的起點與長度。
 */
export async function runScenario(scenario, { dryRun = false } = {}) {
  const {
    baseUrl = '',
    viewport = { width: 1440, height: 900 },
    abortOnError = true,
    timeout = 15000,
    waitUntil: defaultWaitUntil = 'load',
    narration: narrationOpts = {},
    subtitles: subtitleOpts = {},
    output: outputOpts = {},
    cursor: cursorOpts = {},
    steps,
  } = scenario;

  if (!scenario.outDir) throw new Error('scenario.outDir 必填');
  scenario = { ...scenario, outDir: normalizeOutDir(scenario.outDir) };
  // 先組好游標 script：設定寫錯要在刪 outDir、開瀏覽器之前就報錯。
  const cursorScript = cursorInitScript(cursorOpts);
  const usesZoom = scenarioUsesZoom(scenario); // zoom 寫錯也在這裡就報錯
  const videoScale = dryRun ? 1 : (scenario.videoScale ?? (usesZoom ? 2 : 1));
  const outDir = dryRun
    ? path.join(os.tmpdir(), `screencast-dry-run-${path.basename(scenario.outDir)}`)
    : scenario.outDir;
  prepareOutDir(outDir);
  const pace = dryRun ? DRY_RUN_PACE : RECORD_PACE;
  if (dryRun) console.log(`dry-run：不錄影、不合成語音，輸出在 ${outDir}`);

  // 先把有旁白的步驟全部合成好、量出時長——步驟停留多久由講稿長度決定，
  // 不是先錄影片再事後把語音塞進去對嘴。
  const narrationByIndex = new Map();
  const narrationSteps = dryRun ? [] : steps.map((s, i) => [i, s]).filter(([, s]) => s.narration);
  if (narrationSteps.length) {
    console.log(`合成 ${narrationSteps.length} 句旁白…`);
    let hits = 0;
    for (const [i, step] of narrationSteps) {
      const wavPath = path.join(outDir, 'narration', `step-${i + 1}.wav`);
      const result = await synthesizeNarration(step.narration, wavPath, narrationOpts);
      if (result.cached) hits++;
      narrationByIndex.set(i, result);
    }
    if (hits) console.log(`  其中 ${hits} 句來自快取`);
  }

  // 高解析度錄影：Playwright 的 recordVideo 會忽略 deviceScaleFactor，只錄 CSS px
  // 大小的畫面、其餘填灰色；要加 --force-device-scale-factor 才錄得到真正的 2 倍細節。
  // 頁面看到的 viewport（innerWidth）不變，排版與點擊座標都不受影響。
  const browser = await chromium.launch(
    videoScale > 1 ? { args: [`--force-device-scale-factor=${videoScale}`] } : {},
  );
  const context = await browser.newContext({
    viewport,
    ...(videoScale > 1 ? { deviceScaleFactor: videoScale } : {}),
    ...(dryRun ? {} : {
      recordVideo: { dir: outDir, size: { width: viewport.width * videoScale, height: viewport.height * videoScale } },
    }),
  });
  context.setDefaultTimeout(timeout);
  await context.addInitScript(cursorScript);
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
    let action;

    try {
      switch (step.type) {
        case 'goto': {
          const url = /^https?:\/\//.test(step.url) ? step.url : baseUrl + step.url;
          const waitUntil = step.waitUntil ?? defaultWaitUntil;
          await page.goto(url, { waitUntil });
          // 預設只等到 load，再「盡量」等網路安靜兩秒：SPA 的初始資料通常在這段
          // 時間內就回來了；但有 WebSocket、輪詢的頁面永遠不會安靜，硬等
          // networkidle 會一路卡到逾時。
          if (waitUntil !== 'networkidle') {
            await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
          }
          await moveTo(page, { x: viewport.width / 2, y: viewport.height / 2 }, pace);
          break;
        }
        case 'fill':
          action = await typeWithCursor(page, locate(page, step), fillValue(step), pace);
          break;
        case 'click':
          action = await clickWithCursor(page, locate(page, step), pace);
          break;
        case 'dblclick':
          action = await clickWithCursor(page, locate(page, step), pace, { times: 2 });
          break;
        case 'rightClick':
          action = await clickWithCursor(page, locate(page, step), pace, { button: 'right' });
          break;
        case 'waitFor':
          await locate(page, step).waitFor({ state: step.state ?? 'visible', timeout: step.timeout ?? timeout });
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
      console.error(`  ✗ 失敗: ${errorMessage.split('\n')[0]}（截圖存在 ${shotPath}）`);
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
      // 鏡頭運動用：點在哪個元素（CSS px）、什麼時候按下去、這步要不要放大
      focus: action?.box && { x: action.box.x, y: action.box.y, w: action.box.width, h: action.box.height },
      actionMs: action ? action.at - t0 : undefined,
      zoom: resolveZoom(step, scenario) ?? undefined,
    });

    if (!ok && abortOnError) break;
  }

  // 只截目前畫面，不用 fullPage：fullPage 會暫時把 viewport 撐大，這段會被錄進
  // 影片結尾（2 倍像素錄影時是畫面縮到左上角、旁邊一片灰）。
  await page.screenshot({ path: path.join(outDir, 'final.png') }).catch(() => {});

  const video = page.video();
  // 影片在 context 關閉時結束，totalMs 在這裡量才接近影片長度
  const totalMs = Date.now() - t0;
  await context.close();

  let videoPath;
  if (video) {
    videoPath = path.join(outDir, 'demo.webm');
    await video.saveAs(videoPath);
  }
  await browser.close();

  // saveAs() 是複製，不是搬移 —— 清掉 Playwright 用 hash 命名的原始檔，只留 demo.webm。
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.webm') && f !== 'demo.webm') {
      fs.rmSync(path.join(outDir, f), { force: true });
    }
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  const manifestJson = { steps: manifest, totalMs, dryRun, viewport, videoScale };
  fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2));

  // 字幕直接從 manifest 推出來，不用再打一次 TTS——文字跟時間戳錄的時候就都有了。
  let srtPath;
  let vttPath;
  if (!dryRun && subtitleOpts.enabled !== false) {
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

  // mp4 從「最完整的那一支」轉：有旁白用帶聲音的版本，沒有就用無聲的。
  let mp4Path;
  if (videoPath && outputOpts.mp4 !== false) {
    mp4Path = path.join(outDir, 'demo.mp4');
    try {
      encodeMp4(narratedVideoPath ?? videoPath, mp4Path, evenSize(viewport));
      console.log('mp4:', mp4Path);
    } catch (err) {
      mp4Path = undefined;
      console.error('  ✗ 轉 mp4 失敗（webm 沒事）:', err.message.split('\n')[0]);
      console.error('    需要編了 libx264 的 ffmpeg：brew install ffmpeg');
    }
  }

  let zoomedPath;
  if (videoPath && usesZoom) {
    try {
      const r = renderZoomed(outDir, manifestJson, narratedVideoPath ?? videoPath);
      zoomedPath = r.zoomedPath;
      manifestJson.camera = r.camera;
      fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2));
      console.log('運鏡版:', zoomedPath);
    } catch (err) {
      console.error('  ✗ 輸出運鏡版失敗（其他影片沒事）:', err.message.split('\n').slice(-3).join(' | '));
    }
  }

  const failed = manifest.filter((m) => !m.ok);
  const skipped = steps.length - manifest.length;
  const ok = failed.length === 0 && skipped === 0;
  if (ok) console.log(dryRun ? 'dry-run 通過，全部步驟都對得到' : '完成，全部步驟成功');
  else console.log(`完成，但有 ${failed.length} 步失敗${skipped ? `、${skipped} 步因中止沒有執行` : ''}`);
  if (videoPath) console.log('影片:', videoPath);
  if (narratedVideoPath) console.log('帶旁白的影片:', narratedVideoPath);
  console.log('manifest:', manifestPath);

  return { ok, outDir, videoPath, narratedVideoPath, mp4Path, zoomedPath, manifestPath, manifest, srtPath, vttPath };
}

/**
 * --zoom-only：不重錄，只依 scenario 目前的 zoom 設定重新輸出 demo-zoomed.mp4。
 * 調倍率、決定哪幾步要推近，幾秒就能看結果。
 *
 * 前提是 scenario 的步驟跟錄影時一樣（數量與 type 一一對應）——步驟改了，
 * 時間軸就不一樣，只能重錄。
 */
export async function rezoomScenario(scenario) {
  if (!scenario.outDir) throw new Error('scenario.outDir 必填');
  const outDir = normalizeOutDir(scenario.outDir);
  const manifestPath = path.join(outDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`找不到 ${manifestPath}，要先正式錄一次`);
  const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (manifestJson.dryRun) throw new Error('這份 manifest 是 dry-run 產生的，沒有影片可以運鏡');
  if (!manifestJson.viewport) throw new Error('這支是舊版錄的（manifest 沒有 viewport／點擊位置），要重錄一次才能運鏡');

  const recorded = manifestJson.steps;
  const same = recorded.length === scenario.steps.length
    && recorded.every((m, i) => m.type === scenario.steps[i].type);
  if (!same) {
    throw new Error('scenario 的步驟跟錄影時不一樣（數量或 type 對不上）——改了步驟要重錄，--zoom-only 只能調 zoom');
  }

  recorded.forEach((m, i) => {
    const z = resolveZoom(scenario.steps[i], scenario);
    if (z == null) delete m.zoom;
    else m.zoom = z;
  });

  const zoomedPath = path.join(outDir, 'demo-zoomed.mp4');
  if (!recorded.some((m) => m.zoom)) {
    fs.rmSync(zoomedPath, { force: true });
    delete manifestJson.camera;
    fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2));
    console.log('scenario 沒有任何一步要放大，已移除 demo-zoomed.mp4');
    return { ok: true, zoomedPath: undefined };
  }

  if ((manifestJson.videoScale ?? 1) < 2) {
    console.warn('  ! 這支是用 1 倍像素錄的，放大後會糊。想要清楚的話正式重錄一次（有 zoom 會自動用 2 倍錄）');
  }
  const narrated = path.join(outDir, 'demo-narrated.webm');
  const source = fs.existsSync(narrated) ? narrated : path.join(outDir, 'demo.webm');
  const r = renderZoomed(outDir, manifestJson, source);
  manifestJson.camera = r.camera;
  fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2));
  console.log('運鏡版:', r.zoomedPath);
  return { ok: true, zoomedPath: r.zoomedPath };
}
