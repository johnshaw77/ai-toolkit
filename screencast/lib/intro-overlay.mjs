// 影片開頭的主旨卡：頁面載入的同時，在畫面最上層蓋一張卡片（章節、標題、說明），
// 停留一段時間後淡出，露出已經載入好的頁面。
//
// 卡片是畫在頁面上的（跟假游標同一套做法），不是事後接在影片前面的一段——
// 所以旁白、字幕、鏡頭的時間軸都不會被整個往後推。第一個 goto 會等卡片淡出才結束，
// 之後的步驟（和旁白）才開始。
//
// 狀態記在 sessionStorage（`__pw_intro`）：
//   - 'shown:<開始時間>'：卡片已經開始顯示。頁面換了（redirect、導覽）時，新頁面看到這個狀態，
//     會用剩下的時間把卡片接著蓋上去，不會每換一頁就重來，也不會停在半途。
//   - 'done'：已經淡出。之後的頁面不再顯示；引擎也是用它判斷「可以往下做了」。

import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = { holdMs: 2600, fadeMs: 900, accent: '#1677ff' };

/**
 * 驗證 scenario.intro。
 *   logo     logo 圖檔：檔案路徑（png／jpg／svg／webp，相對路徑以執行目錄為準）或 data: 網址；放在最上面
 *   logoHeight logo 的顯示高度（px），預設 56
 *   heading  大標題（最大的字，放在最上面；例如系統名稱）
 *   title    必填，主旨
 *   kicker   標題上方的小字（例如「操作教學・第 02 支」）
 *   subtitle 標題下方的說明
 *   holdMs   完整顯示多久（毫秒），預設 2600
 *   fadeMs   淡出多久（毫秒），預設 900
 *   accent   標題旁的色條顏色
 */
const LOGO_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

/** logo 一律轉成 data: 網址嵌進頁面——卡片不依賴被錄的網站有沒有提供這張圖 */
function logoDataUrl(logo) {
  if (!logo) return '';
  if (typeof logo !== 'string') throw new Error('intro.logo 要是檔案路徑或 data: 網址');
  if (logo.startsWith('data:')) return logo;
  const type = LOGO_TYPES[path.extname(logo).toLowerCase()];
  if (!type) throw new Error(`intro.logo 只支援 ${Object.keys(LOGO_TYPES).join('、')}，收到 ${logo}`);
  if (!fs.existsSync(logo)) throw new Error(`intro.logo 找不到檔案：${logo}`);
  return `data:${type};base64,${fs.readFileSync(logo).toString('base64')}`;
}

export function introOptions(intro) {
  if (intro == null || intro === false) return null;
  if (typeof intro !== 'object') throw new Error('intro 要是物件，例如 { title: "…" }');
  const { logo = '', logoHeight = 56, heading = '', title, kicker = '', subtitle = '', holdMs = DEFAULTS.holdMs, fadeMs = DEFAULTS.fadeMs, accent = DEFAULTS.accent } = intro;
  if (typeof title !== 'string' || title.trim() === '') throw new Error('intro.title 必填（影片的主旨）');
  for (const [k, v] of [['holdMs', holdMs], ['fadeMs', fadeMs]]) {
    if (!(Number(v) >= 0) || !Number.isFinite(Number(v))) throw new Error(`intro.${k} 要是 0 以上的數字，收到 ${v}`);
  }
  if (!(Number(logoHeight) > 0)) throw new Error(`intro.logoHeight 要是正數，收到 ${logoHeight}`);
  return { logo: logoDataUrl(logo), logoHeight: Number(logoHeight), heading: String(heading), title, kicker: String(kicker), subtitle: String(subtitle), holdMs: Number(holdMs), fadeMs: Number(fadeMs), accent: String(accent) };
}

export function introInitScript(intro) {
  const o = introOptions(intro);
  if (!o) return '';
  return `
(() => {
  const O = ${JSON.stringify(o)};
  const KEY = '__pw_intro';
  let state = null;
  try { state = sessionStorage.getItem(KEY); } catch (e) { return; }
  if (state === 'done') return;
  let startedAt = Date.now();
  if (state && state.startsWith('shown:')) startedAt = Number(state.slice(6)) || startedAt;
  else { try { sessionStorage.setItem(KEY, 'shown:' + startedAt); } catch (e) { return; } }

  function mount() {
    if (document.getElementById('__pw_intro')) return;
    const el = document.createElement('div');
    el.id = '__pw_intro';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f4f6f8;display:flex;align-items:center;justify-content:center;opacity:1;pointer-events:none;font-family:"Noto Sans CJK TC","Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;';
    const card = document.createElement('div');
    card.style.cssText = 'max-width:70vw;padding-left:32px;border-left:10px solid ' + O.accent + ';';
    const part = (text, css) => {
      if (!text) return;
      const d = document.createElement('div');
      d.textContent = text;
      d.style.cssText = css;
      card.appendChild(d);
    };
    if (O.logo) {
      const img = document.createElement('img');
      img.src = O.logo;
      img.style.cssText = 'display:block;height:' + O.logoHeight + 'px;width:auto;margin-bottom:32px;';
      card.appendChild(img);
    }
    // 有大標題時，大標題最大，主旨降一級，視覺上才分得出層次
    part(O.heading, 'font-size:76px;font-weight:800;letter-spacing:.04em;line-height:1.2;color:#1f2d3d;margin-bottom:44px;');
    part(O.kicker, 'font-size:26px;letter-spacing:.12em;color:#6b7a90;margin-bottom:16px;');
    part(O.title, 'font-size:' + (O.heading ? 52 : 64) + 'px;font-weight:700;line-height:1.25;color:' + (O.heading ? O.accent : '#1f2d3d') + ';');
    part(O.subtitle, 'font-size:28px;line-height:1.6;color:#4a5b70;margin-top:22px;');
    el.appendChild(card);
    (document.documentElement || document).appendChild(el);

    const fade = () => {
      el.style.transition = 'opacity ' + O.fadeMs + 'ms ease-out';
      el.style.opacity = '0';
      setTimeout(() => {
        el.remove();
        try { sessionStorage.setItem(KEY, 'done'); } catch (e) {}
      }, O.fadeMs + 30);
    };
    const remaining = Math.max(0, O.holdMs - (Date.now() - startedAt));
    setTimeout(fade, remaining);
  }

  // document_start 時 documentElement 有時還是 null：一出現就掛上去，避免第一格畫面閃一下底下的頁面
  if (document.documentElement) mount();
  else new MutationObserver((_, obs) => { if (document.documentElement) { obs.disconnect(); mount(); } }).observe(document, { childList: true });
})();
`;
}

/**
 * 引擎等卡片淡出用的條件（在頁面裡執行）。要傳真正的函式給 waitForFunction：
 * 傳字串會被當成運算式，函式物件本身就是真值，會立刻放行。
 */
export function introDone() {
  try { return sessionStorage.getItem('__pw_intro') === 'done'; } catch (e) { return true; }
}
