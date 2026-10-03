# 解說動畫（HyperFrames）

把一段腳本、系統流程或概念說明，做成「米白底、線性 icon、膠囊標籤、線條描繪」風格的解說動畫，成品是 MP4。全程只用 HyperFrames：專案、預覽、檢查、算圖都走 HyperFrames CLI，不另外做網頁或 artifact 版本。

這類動畫不交給 AI 影片模型生成（字會糊、icon 會變形、時間點對不上旁白），一律用程式產生。

## 何時使用

- 使用者要把流程、架構、概念講解做成動畫或短片
- 使用者提供腳本、旁白稿、流程圖，想要「像 YouTube 解說影片那種 icon 動畫」
- 使用者要求依 shot list 產出影片，或修改既有的解說動畫專案

## 環境需求

- Node.js 22 以上、FFmpeg
- 開工前先跑 `npx hyperframes doctor`，有缺就照輸出補齊；補不齊時告訴使用者缺什麼，不要改用其他工具
- 指令旗標以 `npx hyperframes <command> --help` 為準

## 流程

1. **收素材**：確認要講的內容、目標長度、是否要旁白、是否有品牌色。缺腳本時，先依使用者描述擬一份短旁白稿給他確認。
2. **建專案**：`npx hyperframes init <專案名>`。
3. **切 beats**：一個 beat 只講一個概念，3–5 秒。
4. **旁白與時間軸**（要旁白時）：用 `npx hyperframes tts` 產生旁白音檔，再用 `npx hyperframes transcribe` 取得逐字時間，把每個 beat 的起點對齊到對應句子的開始時間。沒有旁白時，以每秒約 4 個中文字估算。
5. **寫 shot list**：每個 beat 用「動作詞彙＋元素」逐行描述（格式見下）。超過 6 個 beat 時，先把 shot list 給使用者確認再動工。
6. **寫 composition**：依下方骨架寫 `index.html`，shot list 每一行對應一行 helper 呼叫。
7. **檢查**：`npx hyperframes lint` → `npx hyperframes check` → `npx hyperframes snapshot --at <每個 beat 結束前 0.2 秒>`，逐張看 snapshot，修正裁切、重疊、元素沒出現的問題後再跑一次。
8. **算圖**：`npx hyperframes render --output <專案名>.mp4`。
9. **交付**：把 MP4 傳給使用者，附一行說明長度與 beat 數；需要調整時，請使用者用 `npx hyperframes preview` 開 Studio 看，或直接說要改哪個 beat。

## Style guide（預設值，使用者或公司有品牌色時以其為準）

| 項目 | 規格 |
|---|---|
| 畫面 | 1920×1080、16:9 |
| 背景 | `#F2F0EB` 暖米白，無漸層、無材質 |
| 主色 | `#1F1F1F` 近黑，用於線條、icon、主文字 |
| 強調色 | 只用一個，預設 `#C96442`。只用在重點狀態：進度、放行、標章 |
| icon 填色 | `#E8E4D6` 淺米，只填主體形狀 |
| 輔助灰 | 說明文字 `#8A867C`、連接線 `#BDB8AC` |
| 字體 | Poppins（中文 Noto Sans TC）。主標籤 600 字重、小寫；icon 下說明 14px 大寫、letter-spacing 約 0.18em、灰色 |
| icon | Lucide 風格線性 icon（24 格、圓角線頭），以 inline SVG path 寫入，放大 3 倍使用，icon 單位線寬 1.35 |
| icon 容器 | 白色圓角方塊 120×120、圓角 26、極淡陰影（dy 5、blur 7、opacity 0.08） |
| 膠囊標籤 | 深色底白字或強調色底白字，全圓角 |
| 連接線 | 3px 灰線；分岔用三次貝茲曲線；被「放行」的路徑疊一條 4px 強調色線 |

（以上座標與尺寸以 SVG `viewBox="0 0 1600 900"` 為準，SVG 撐滿 1920×1080 舞台。）

## 版面座標

- 主流程沿 y=450 水平展開，左進右出；分岔向上下各 150。
- 元素之間保留至少 120 水平間距；畫面同時存在的主要元素不超過 6 個。
- 章節膠囊先出現在正中央，講完 ghost 到左上 (160, 80)。

## 動作詞彙

shot list 只能使用這些詞，每個詞對應一個 helper：

| 詞 | 效果 | 參數 |
|---|---|---|
| clear | 全部淡出 | 250ms |
| pop-in | scale 0.85→1 + 淡入 | 300ms，`back.out(1.7)` |
| fade-in | 上移 6px + 淡入（說明文字） | 300ms |
| stagger | 同組元素依序 pop-in | 間隔 100ms |
| draw-on | 線條從起點畫到終點（stroke-dashoffset） | 500ms，`power2.inOut` |
| travel | 元素沿連接線從 A 移到 B | 600ms，`power2.inOut` |
| swap | 舊元素淡出縮小，新元素在同位置 pop-in | 200ms + 300ms |
| tick | 勾號以 draw-on 畫出 | 350ms |
| fill | 進度條由左至右填滿 | 800ms |
| type | 逐字出現 | 每字 30ms |
| ghost | 縮到 55%、移到角落、opacity 0.3 | 500ms |

## Shot list 格式

```
Beat 2（3.0–6.0s）起點
旁白：「……」
- 膠囊 ghost 到左上
- 左側 pop-in app-window 方塊，說明 VIBE CODED APP
- 方塊右緣 draw-on 水平線到閘門
```

規則：
- 上一個概念講完預設 ghost 到背景，不要直接消失；換章節時才 clear。
- 每個 beat 最後至少停 0.8 秒讓觀眾讀。
- 畫面上的字只放名詞標籤（2–3 個英文字或 6 個中文字內），句子留給旁白。
- 不使用 emoji、真實品牌 logo 或知名角色；需要代表某產品時，用通用 icon 加文字標籤。

## Composition 骨架（index.html）

```html
<div id="stage" data-composition-id="explainer" data-start="0" data-duration="15"
     data-width="1920" data-height="1080">
  <style>
    @font-face{font-family:"Poppins";font-weight:600;src:url("assets/fonts/Poppins-SemiBold.woff2") format("woff2")}
    #stage{width:1920px;height:1080px;background:#F2F0EB}
    #scene{width:100%;height:100%;display:block}
    #scene text{font-family:"Poppins","Noto Sans TC",sans-serif}
  </style>

  <svg id="scene" viewBox="0 0 1600 900">
    <!-- 所有元素：id 命名、畫在最終位置（會移動的元素畫在起點） -->
  </svg>

  <!-- 有旁白時 -->
  <audio id="vo" data-start="0" data-duration="15" data-track-index="1" src="assets/vo.wav"></audio>

  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const TOTAL = 15;
    const $ = s => document.querySelector(s);
    const center = {transformOrigin:"50% 50%"};
    function prepDraw(el){ const L = el.getTotalLength(); gsap.set(el,{strokeDasharray:L, strokeDashoffset:L}); }

    const V = {
      popIn:(tl,el,at)=>tl.fromTo(el,{opacity:0,scale:.85,...center},{opacity:1,scale:1,duration:.3,ease:"back.out(1.7)",immediateRender:false},at),
      fadeIn:(tl,el,at)=>tl.fromTo(el,{opacity:0,y:6},{opacity:1,y:0,duration:.3,ease:"power2.out",immediateRender:false},at),
      stagger:(tl,els,at)=>els.forEach((el,i)=>V.popIn(tl,el,at+i*.1)),
      draw:(tl,el,at,dur=.5)=>tl.to(el,{strokeDashoffset:0,duration:dur,ease:"power2.inOut"},at),
      travel:(tl,el,x,at,dur=.6,y=0)=>tl.to(el,{x,y,duration:dur,ease:"power2.inOut"},at),
      swap:(tl,from,to,at)=>{ tl.to(from,{opacity:0,scale:.8,duration:.2,ease:"power1.in",...center},at); V.popIn(tl,to,at+.15); },
      ghost:(tl,el,at,x,y)=>tl.to(el,{x,y,scale:.55,opacity:.3,duration:.5,ease:"power2.inOut",...center},at),
      clear:(tl,els,at)=>tl.to(els,{opacity:0,duration:.25},at)
    };

    // 1. 初始狀態：出場元素 opacity 0，所有線條 prepDraw
    // 2. 一條 paused、有限長度的 timeline
    const tl = gsap.timeline({ paused: true });
    tl.set({}, {}, TOTAL);
    // 3. 逐 beat 把 shot list 翻成 V.* 呼叫，at 用絕對秒數

    // 4. 同步註冊，key 必須等於 data-composition-id
    window.__timelines = window.__timelines || {};
    window.__timelines.explainer = tl;
  </script>
</div>
```

## HyperFrames 規則（違反會算出錯誤畫面）

- timeline 一定要 `{ paused: true }`、長度有限，並在 script 裡同步註冊到 `window.__timelines`，key 與 `data-composition-id` 相同。
- root 的 `data-duration` 要等於 timeline 總長（`TOTAL`）。
- 不能用 `Date.now()`、`requestAnimationFrame`、`setTimeout`/`setInterval`、CSS animation/transition；所有動態都放進 GSAP timeline。
- 不能用未設種子的 `Math.random()`；需要亂數時用固定種子的 PRNG。
- 所有素材（字型、圖片、音檔）放在專案 `assets/` 內，第一格之前就載入完成；不在算圖途中 fetch。
- 出場元素先用 `gsap.set(..., {opacity:0})` 隱藏，tween 用 `.to` 或 `immediateRender:false` 的 `.fromTo`，這樣任意跳格時狀態才正確。
- 會移動的元素畫在起點位置，之後只動 `x`/`y`，不改 SVG 座標。

## 交付前檢查

- `lint`、`check` 沒有錯誤
- 每個 beat 結束前的 snapshot 都看過：元素都出現、文字沒被裁切、元素沒有重疊
- 每一行 shot list 都有對應的 helper 呼叫，秒數一致
- 有旁白時，beat 起點與旁白句子對齊，結尾沒有多出空白或被截斷
- 最後一格畫面完整，看得懂整個流程