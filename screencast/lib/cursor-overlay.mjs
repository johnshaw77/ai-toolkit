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
export const CURSOR_INIT_SCRIPT = `
(() => {
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
    cursor.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z" fill="#ffffff" stroke="#111111" stroke-width="1.3"/></svg>';
    const ripple = document.createElement('div');
    ripple.id = '__pw_fake_ripple';
    cursor.style.cssText = 'position:fixed;top:0;left:0;width:24px;height:24px;pointer-events:none;z-index:2147483647;transform:translate(-4000px,-4000px);';
    const POS_KEY = '__pw_fake_cursor_pos';
    function place(x, y) {
      cursor.style.transform = 'translate(' + (x - 2) + 'px,' + (y - 2) + 'px)';
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null');
      if (saved) place(saved.x, saved.y);
    } catch (e) {
      // sessionStorage 在某些頁面（sandbox iframe、about:blank）不能用，沒記到就算了
    }
    ripple.style.cssText = 'position:fixed;top:0;left:0;width:40px;height:40px;margin-left:-20px;margin-top:-20px;border-radius:50%;background:rgba(255,100,50,0.55);pointer-events:none;z-index:2147483646;opacity:0;';

    function mount() {
      const root = document.documentElement;
      root.appendChild(style);
      root.appendChild(cursor);
      root.appendChild(ripple);
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
