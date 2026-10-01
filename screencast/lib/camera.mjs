import { execFileSync } from 'node:child_process';

// 鏡頭運動（zoom／pan）：錄完之後依 manifest 裡每一步的點擊位置與時間，
// 用 ffmpeg 把畫面推近、平移、拉遠，輸出另一支影片。錄影本身不受影響。
//
// 座標一律用 CSS px（跟 viewport 同一套），時間用毫秒（相對影片開頭）；
// 轉成影片像素與秒數是 buildCameraFilter 的事。

export const DEFAULT_ZOOM = 2;
const TRANSITION_MS = 700;
// 元素要佔畫面多少以內；太大的元素（整個表格、長文字框）就少放大一點
const FIT_RATIO = 0.9;
// 放大倍率低於這個就不值得動鏡頭，維持全畫面
const MIN_ZOOM = 1.15;
// 下一個焦點還在目前鏡頭中央這個比例的範圍內，就不移動（避免一直小幅晃動）
const KEEP_RATIO = 0.7;

const ZOOMABLE = new Set(['click', 'dblclick', 'rightClick', 'fill']);
// waitFor 也可以指定倍率（鏡頭對準等到的那個元素，例如搜尋結果區）；wait / goto 只能用 zoom:false 拉回
const FOCUS_ON = new Set([...ZOOMABLE, 'waitFor']);
const RELEASE_ONLY = new Set(['wait', 'waitFor']);
// waitFor 自動拉回時，如果下一個推近動作很快就到（小於這個間隔），拉回再推近只會讓鏡頭來回晃，就不拉
// （不用「waitFor 等了多久」判斷：前一步有旁白時，等旁白講完結果早就出現了，waitFor 幾乎不用等）
const RELEASE_MIN_GAP_MS = 1500;

/**
 * 這一步的放大倍率。
 *   step.zoom === false → 不放大
 *   step.zoom 是數字    → 用這個倍率
 *   step.zoom === true  → 用預設倍率
 *   沒寫                → scenario.autoZoom 開著就用預設倍率，否則不放大
 * 會放大的 type：click / dblclick / rightClick / fill；waitFor 只有明確寫了倍率才放大
 * （不吃 autoZoom）。其他回傳 null（由 planCamera 決定維持或拉回）。
 */
export function resolveZoom(step, { autoZoom = false } = {}) {
  if (step.type === 'waitFor') {
    if (step.zoom === true) return typeof autoZoom === 'object' && autoZoom?.zoom ? autoZoom.zoom : DEFAULT_ZOOM;
    if (typeof step.zoom === 'number') {
      if (!(step.zoom >= 1)) throw new Error(`step "${step.label ?? step.type}" 的 zoom 要 >= 1，收到 ${step.zoom}`);
      return step.zoom;
    }
    return null;
  }
  if (step.type === 'wait' && step.zoom != null && step.zoom !== false) {
    throw new Error(`step "${step.label ?? step.type}"：wait 沒有對象可以放大，只能寫 zoom: false（拉回全畫面）`);
  }
  if (!ZOOMABLE.has(step.type)) return null;
  const auto = typeof autoZoom === 'object' && autoZoom !== null ? true : Boolean(autoZoom);
  const defaultZoom = typeof autoZoom === 'object' && autoZoom?.zoom ? autoZoom.zoom : DEFAULT_ZOOM;
  if (step.zoom === false) return null;
  if (typeof step.zoom === 'number') {
    if (!(step.zoom >= 1)) throw new Error(`step "${step.label ?? step.type}" 的 zoom 要 >= 1，收到 ${step.zoom}`);
    return step.zoom;
  }
  if (step.zoom === true) return defaultZoom;
  return auto ? defaultZoom : null;
}

/** wait / waitFor 寫了 zoom: false ＝ 明確要求在這裡把鏡頭拉回全畫面。 */
export function explicitRelease(step) {
  return RELEASE_ONLY.has(step.type) && step.zoom === false;
}

/**
 * waitFor 等到內容出現時，要不要自動把鏡頭拉回全畫面。autoZoom 開著就預設要
 * （觀眾這時要看的是結果，不是剛按下去的按鈕）；`autoZoom: { releaseOnWait: false }` 關掉。
 */
export function releaseOnWait({ autoZoom = false } = {}) {
  if (!autoZoom) return false;
  return !(typeof autoZoom === 'object' && autoZoom.releaseOnWait === false);
}

/** scenario 有沒有任何一步會放大（決定要不要用高解析度錄影）。 */
export function scenarioUsesZoom(scenario) {
  return scenario.steps.some((s) => resolveZoom(s, scenario) != null);
}

const full = (vp) => ({ x: 0, y: 0, w: vp.width, h: vp.height });
const sameRect = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.5);

/**
 * 把焦點元素（CSS px 的外框）換成鏡頭要框住的範圍：以元素中心為中心、
 * 長寬比跟畫面一樣、不超出畫面。元素太大就降低倍率讓它放得下；
 * 降到不值得放大就回傳全畫面。
 */
export function focusRect(focus, zoom, vp) {
  let z = zoom;
  if (focus.w > 0) z = Math.min(z, (FIT_RATIO * vp.width) / focus.w);
  if (focus.h > 0) z = Math.min(z, (FIT_RATIO * vp.height) / focus.h);
  if (!(z >= MIN_ZOOM)) return full(vp);
  const w = vp.width / z;
  const h = vp.height / z;
  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  return {
    x: Math.min(Math.max(cx - w / 2, 0), vp.width - w),
    y: Math.min(Math.max(cy - h / 2, 0), vp.height - h),
    w,
    h,
  };
}

function insideCore(focus, rect) {
  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  const mx = (rect.w * (1 - KEEP_RATIO)) / 2;
  const my = (rect.h * (1 - KEEP_RATIO)) / 2;
  return cx >= rect.x + mx && cx <= rect.x + rect.w - mx && cy >= rect.y + my && cy <= rect.y + rect.h - my;
}

/**
 * 從 manifest 的 steps 算出鏡頭關鍵格 [{ t, x, y, w, h }]（t 是毫秒，其餘 CSS px）。
 * 相鄰兩格之間由 buildCameraFilter 用 smoothstep 補間。
 *
 * 規則：
 * - click / fill 有 zoom：鏡頭在「點下去的那一刻」（actionMs）剛好到位，
 *   所以會跟游標一起移動，而不是點完才追過去。
 * - click / fill 沒有 zoom：拉回全畫面。
 * - goto：拉回全畫面（換頁了，舊的焦點沒有意義）。
 * - wait / waitFor / 失敗的步驟：維持目前的鏡頭，例外：
 *   · waitFor 寫了 zoom: 倍率 → 鏡頭對準等到的元素
 *   · waitFor 寫了 zoom: false，或 releaseOnWait 開著、鏡頭還停在舊目標且下一個推近動作不是馬上到 → 拉回全畫面
 *   · wait 寫了 zoom: false → 拉回全畫面
 * - 下一個焦點還在目前鏡頭的中央區域、倍率又一樣：不動，避免小幅晃動。
 * - 最後一步做完就拉回全畫面。
 */
export function planCamera(steps, { viewport, totalMs, transitionMs = TRANSITION_MS, releaseOnWait = false }) {
  const vp = viewport;
  let cur = full(vp);
  let curZoom = null;
  const kfs = [{ t: 0, ...cur }];
  const lastT = () => kfs[kfs.length - 1].t;

  const moveTo = (target, arriveAt) => {
    if (sameRect(target, cur)) return;
    const tEnd = Math.max(arriveAt, lastT() + 1);
    const tStart = Math.max(lastT(), tEnd - transitionMs);
    // 最後一格一定就是目前的鏡頭；轉場從那一刻開始的話不用再推一格重複的
    if (tStart > lastT()) kfs.push({ t: tStart, ...cur });
    kfs.push({ t: tEnd, ...target });
    cur = target;
  };

  const zoomTo = (s) => {
    const arrive = s.actionMs ?? s.tStartMs + transitionMs;
    if (s.zoom) {
      const keep = curZoom === s.zoom && insideCore(s.focus, cur);
      if (!keep) moveTo(focusRect(s.focus, s.zoom, vp), arrive);
      curZoom = sameRect(cur, full(vp)) ? null : s.zoom;
    } else {
      moveTo(full(vp), arrive);
      curZoom = null;
    }
  };

  // 這一步之後，下一個會動鏡頭的動作什麼時候到（沒有就是 Infinity）
  const nextCameraMoveMs = (from) => {
    for (let j = from + 1; j < steps.length; j++) {
      const n = steps[j];
      if (n.type === 'goto') return n.tStartMs;
      if (ZOOMABLE.has(n.type) && n.ok !== false && n.focus) return n.actionMs ?? n.tStartMs;
    }
    return Infinity;
  };

  for (const [i, s] of steps.entries()) {
    if (s.type === 'goto') {
      moveTo(full(vp), s.tStartMs + transitionMs);
      curZoom = null;
    } else if (FOCUS_ON.has(s.type) && s.ok !== false && s.zoom && s.focus) {
      zoomTo(s);
    } else if (ZOOMABLE.has(s.type) && s.ok !== false && s.focus) {
      zoomTo(s); // 沒有 zoom：拉回全畫面
    } else if (s.type === 'waitFor' && s.ok !== false) {
      // 等到內容出現 → 拉回全畫面。明確寫了 zoom:false 一定拉回；
      // 自動拉回只在「鏡頭還停在舊目標上」且下一個推近動作不是馬上到的時候
      const at = s.actionMs ?? s.tStartMs + transitionMs;
      const stale = curZoom != null;
      if (s.release || (releaseOnWait && stale && nextCameraMoveMs(i) - at >= RELEASE_MIN_GAP_MS)) {
        moveTo(full(vp), at);
        curZoom = null;
      }
    } else if (s.type === 'wait' && s.release) {
      moveTo(full(vp), s.tStartMs + transitionMs);
      curZoom = null;
    }
  }

  // 最後一步做完就拉回全畫面。用最後一步的結束時間，不用 totalMs 往回推：
  // totalMs 之後還有截圖、關瀏覽器的時間，跟影片實際結尾對不太準。
  if (!sameRect(cur, full(vp))) {
    const lastEnd = steps.length ? steps[steps.length - 1].tEndMs : lastT();
    let arrive = lastEnd + transitionMs;
    if (totalMs != null) arrive = Math.min(arrive, totalMs);
    moveTo(full(vp), arrive);
  }
  return kfs;
}

const num = (v) => String(Math.round(v * 1000) / 1000);

/**
 * 一個分量（x、y、w 或 h）隨時間變化的 ffmpeg 運算式：分段 smoothstep 補間。
 * T 是目前時間（秒）的運算式。
 *
 * 寫成「每段乘上 0/1 開關再全部加起來」的平的形式，不用一層包一層的 if()：
 * ffmpeg 的運算式解析器有巢狀深度上限，關鍵格一多（步驟多的教學影片）
 * 巢狀 if 會直接解析失敗。時間區間是 [t0, t1)，任何時刻只有一段的開關是 1。
 */
function piecewise(kfs, key, T) {
  const terms = [];
  const add = (value, gate) => {
    if (value === '0') return; // 值是 0 的段不用寫
    terms.push(`${value}*${gate}`);
  };
  add(num(kfs[0][key]), `lt(${T},${num(kfs[0].t / 1000)})`);
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    const t0 = a.t / 1000;
    const t1 = b.t / 1000;
    if (t1 <= t0) continue;
    let seg = num(a[key]);
    if (Math.abs(a[key] - b[key]) >= 1e-6) {
      const u = `((${T}-${num(t0)})/${num(t1 - t0)})`;
      seg = `(${num(a[key])}+(${num(b[key] - a[key])})*${u}*${u}*(3-2*${u}))`;
    }
    add(seg, `gte(${T},${num(t0)})*lt(${T},${num(t1)})`);
  }
  const last = kfs[kfs.length - 1];
  add(num(last[key]), `gte(${T},${num(last.t / 1000)})`);
  return terms.length ? terms.join('+') : '0';
}

/**
 * 把關鍵格變成 ffmpeg 濾鏡：先補成固定 fps，用 perspective 把鏡頭框住的範圍
 * 拉滿畫面，再縮到輸出尺寸。
 *
 * 不用 zoompan／crop：它們只能以整數像素移動，平移時畫面會一格一格地抖。
 * perspective 用小數座標取樣，運鏡才平滑。
 *
 * scale：影片像素／CSS px（高解析度錄影是 2）。
 */
export function buildCameraFilter(kfs, { scale = 1, fps = 25, output }) {
  const T = `(in/${fps})`;
  const px = kfs.map((k) => ({ t: k.t, x: k.x * scale, y: k.y * scale, w: k.w * scale, h: k.h * scale }));
  const x = piecewise(px, 'x', T);
  const y = piecewise(px, 'y', T);
  const w = piecewise(px, 'w', T);
  const h = piecewise(px, 'h', T);
  const x1 = `(${x})+(${w})`;
  const y1 = `(${y})+(${h})`;
  const persp = [
    `x0='${x}'`, `y0='${y}'`,
    `x1='${x1}'`, `y1='${y}'`,
    `x2='${x}'`, `y2='${y1}'`,
    `x3='${x1}'`, `y3='${y1}'`,
    'interpolation=cubic', 'eval=frame',
  ].join(':');
  return `fps=${fps},perspective=${persp},scale=${output.width}:${output.height}:flags=lanczos`;
}

/**
 * 依關鍵格輸出運鏡後的 mp4（H.264＋AAC，來源有音軌就帶著）。
 */
export function renderCamera(inputPath, outPath, kfs, { scale = 1, fps = 25, output }) {
  const filter = buildCameraFilter(kfs, { scale, fps, output });
  execFileSync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  return outPath;
}
