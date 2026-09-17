// 注入到頁面裡的假游標 + 點擊漣漪。掛在 <html> 而不是 <body>，
// 避開框架 App 容器常見的 CSS transform 讓 position:fixed 失效的坑；
// 且用 requestAnimationFrame 重試到 documentElement 存在，因為
// addInitScript 在 document_start 執行時 documentElement 有時還是 null。
export const CURSOR_INIT_SCRIPT = `
(() => {
  function init() {
    if (!document.documentElement) {
      requestAnimationFrame(init);
      return;
    }
    const root = document.documentElement;

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
    ripple.style.cssText = 'position:fixed;top:0;left:0;width:40px;height:40px;margin-left:-20px;margin-top:-20px;border-radius:50%;background:rgba(255,100,50,0.55);pointer-events:none;z-index:2147483646;opacity:0;';

    function mount() {
      root.appendChild(style);
      root.appendChild(cursor);
      root.appendChild(ripple);
    }
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });

    window.addEventListener('mousemove', (e) => {
      cursor.style.transform = 'translate(' + (e.clientX - 2) + 'px,' + (e.clientY - 2) + 'px)';
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
