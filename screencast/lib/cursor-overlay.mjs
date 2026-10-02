// 注入到頁面裡的假游標 + 點擊漣漪。掛在 <html> 而不是 <body>，
// 避開框架 App 容器常見的 CSS transform 讓 position:fixed 失效的坑。
//
// addInitScript 在 document_start 執行時 documentElement 有時還是 null，
// 所以 DOM 等到 DOMContentLoaded 才掛；但 mousemove 監聽與 __pwClickRipple
// 一開始就要就位（window 一定在）。以前是用 requestAnimationFrame 重試到
// documentElement 出現才整段初始化，headless 在忙的時候 rAF 會拖到 load 之後，
// 這段期間的滑鼠移動全部漏接，游標就停在畫面外。
//
// 最後位置記在 sessionStorage：點連結換頁後 script 會在新頁面重新注入，
// 不記的話游標會停在畫面外，直到下一次 mousemove 才出現——
// 觀眾看到的就是「點完之後游標消失了」。

// 箭頭圖形畫在 24×24 的 viewBox 裡，尖端在 (4, 2)。定位時要把尖端對準滑鼠座標，
// 不是把 SVG 左上角對過去——放大之後差距會跟著放大。
const BASE_SIZE = 24;
const TIP_X = 4;
const TIP_Y = 2;
const BASE_RIPPLE = 40;

/**
 * 把 scenario.cursor 換算成實際尺寸。
 *   scale       游標與漣漪一起縮放，預設 1.5（24px 的原圖在 1080p 錄影裡太小）
 *   size        游標邊長（px），給了就蓋過 scale
 *   rippleSize  漣漪直徑（px），給了就蓋過 scale
 *   rippleColor 漣漪顏色
 */
export function cursorOptions({ scale = 1.5, size, rippleSize, rippleColor = 'rgba(255,100,50,0.55)' } = {}) {
  if (!(Number(scale) > 0)) throw new Error(`cursor.scale 要是正數，收到 ${scale}`);
  const cursorSize = Number(size ?? BASE_SIZE * scale);
  if (!(cursorSize > 0)) throw new Error(`cursor.size 要是正數，收到 ${size}`);
  const k = cursorSize / BASE_SIZE;
  return {
    size: cursorSize,
    tipX: TIP_X * k,
    tipY: TIP_Y * k,
    rippleSize: Number(rippleSize ?? BASE_RIPPLE * scale),
    rippleColor: String(rippleColor),
  };
}

export function cursorInitScript(options) {
  const o = cursorOptions(options);
  return `
(() => {
  const O = ${JSON.stringify(o)};
  function init() {
    const style = document.createElement('style');
    style.textContent = \`
      @keyframes __pw_ripple_anim {
        from { transform: scale(0.2); opacity: 0.65; }
        to   { transform: scale(1.7); opacity: 0; }
      }
      #__pw_fake_ripple.active { animation: __pw_ripple_anim 500ms ease-out; }
    \`;

    const cursor = document.createElement('div');
    cursor.id = '__pw_fake_cursor';
    cursor.innerHTML = '<svg width="' + O.size + '" height="' + O.size + '" viewBox="0 0 ${BASE_SIZE} ${BASE_SIZE}" style="display:block"><path d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z" fill="#ffffff" stroke="#111111" stroke-width="1.3"/></svg>';
    const ripple = document.createElement('div');
    ripple.id = '__pw_fake_ripple';
    cursor.style.cssText = 'position:fixed;top:0;left:0;width:' + O.size + 'px;height:' + O.size + 'px;pointer-events:none;z-index:2147483647;transform:translate(-4000px,-4000px);';
    const POS_KEY = '__pw_fake_cursor_pos';
    let lastX = -4000;
    let lastY = -4000;
    function place(x, y) {
      lastX = x;
      lastY = y;
      cursor.style.transform = 'translate(' + (x - O.tipX) + 'px,' + (y - O.tipY) + 'px)';
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null');
      if (saved) place(saved.x, saved.y);
    } catch (e) {
      // sessionStorage 在某些頁面（sandbox iframe、about:blank）不能用，沒記到就算了
    }
    const half = O.rippleSize / 2;
    ripple.style.cssText = 'position:fixed;top:0;left:0;width:' + O.rippleSize + 'px;height:' + O.rippleSize + 'px;margin-left:-' + half + 'px;margin-top:-' + half + 'px;border-radius:50%;background:' + O.rippleColor + ';pointer-events:none;z-index:2147483646;opacity:0;';

    // 按鍵標籤（press 步驟）：游標旁邊短暫顯示按了什麼鍵，觀眾才知道有這個快速鍵
    const keyLabel = document.createElement('div');
    keyLabel.id = '__pw_key_label';
    keyLabel.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;opacity:0;transition:opacity 150ms;' +
      'padding:' + Math.round(O.size * 0.25) + 'px ' + Math.round(O.size * 0.5) + 'px;border-radius:' + Math.round(O.size * 0.3) + 'px;' +
      'background:rgba(17,17,17,0.88);color:#fff;font:600 ' + Math.round(O.size * 0.75) + 'px/1.2 system-ui,sans-serif;white-space:nowrap;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.35);';
    let keyTimer;

    function mount() {
      const root = document.documentElement;
      root.appendChild(style);
      root.appendChild(cursor);
      root.appendChild(ripple);
      root.appendChild(keyLabel);
    }
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });

    window.addEventListener('mousemove', (e) => {
      place(e.clientX, e.clientY);
      try {
        sessionStorage.setItem(POS_KEY, JSON.stringify({ x: e.clientX, y: e.clientY }));
      } catch (err) {
        // 同上
      }
    }, true);

    window.__pwKeyLabel = (text, holdMs = 1100) => {
      // 標籤放在游標右下方；太靠近畫面邊緣時往內縮，避免被切掉
      const x = Math.min(Math.max(lastX, 0) + O.size, window.innerWidth - 200);
      const y = Math.min(Math.max(lastY, 0) + O.size * 0.8, window.innerHeight - 60);
      keyLabel.textContent = text;
      keyLabel.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      keyLabel.style.opacity = '1';
      clearTimeout(keyTimer);
      keyTimer = setTimeout(() => { keyLabel.style.opacity = '0'; }, holdMs);
    };

    window.__pwClickRipple = (x, y) => {
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.classList.remove('active');
      void ripple.offsetWidth;
      ripple.classList.add('active');
    };
  }
  init();
})();
`;
}

// 預設尺寸的版本，給不需要調整的呼叫端用。
export const CURSOR_INIT_SCRIPT = cursorInitScript();
