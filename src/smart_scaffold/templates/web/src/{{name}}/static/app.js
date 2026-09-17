/*
 * 每一頁都會載入的共用工具：深色模式、toast、確認框、以及打 API 的包裝。
 *
 * 沒有框架、沒有建置步驟。改完存檔重新整理就看得到。
 */

/*
 * 深色模式的**初始值**是在 base.html 的 <head> 裡內嵌設定的，不在這裡——
 * 這支是 module，會被延後執行，等到它跑的時候畫面已經用亮色畫過一次了，
 * 使用者會看到閃一下。這裡只負責切換鈕。
 */
const THEME_KEY = 'theme'
const toggle = document.getElementById('theme-toggle')

toggle?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  localStorage.setItem(THEME_KEY, next)
})

/** 右上角的浮動訊息。`kind` 傳 'error' 會變成紅色。 */
let toastTimer = null
export function toast(message, kind = 'ok') {
  const element = document.getElementById('toast')
  if (!element) return
  element.textContent = message
  element.dataset.kind = kind
  element.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    element.hidden = true
  }, 2600)
}

/**
 * 頁面內的確認框。
 *
 * **刻意不用 window.confirm()**：那會擋住整個 JS 執行緒，而且自動化測試
 * 碰到它就沒轍了。
 */
export function confirmAction(message) {
  const dialog = document.getElementById('confirm-dialog')
  document.getElementById('confirm-text').textContent = message
  dialog.showModal()
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true })
  })
}

/**
 * 打 API。
 *
 * 後端的錯誤格式只在這裡解析一次，各頁不要自己再拆一遍。
 * 401 代表 session 過期，直接把人送回登入頁——留在原地看一個看不懂的錯更糟。
 */
export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (response.status === 401) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    throw new Error('未登入')
  }

  if (response.status === 204) return null

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(errorMessage(body, `請求失敗（${response.status}）`))
  }
  return body
}

/** 從後端的錯誤回應取出可以直接顯示給人看的一句話。 */
export function errorMessage(body, fallback = '操作失敗，請稍後再試') {
  if (!body) return fallback
  if (typeof body.message === 'string') return body.message
  // FastAPI 自己擋下來的驗證錯誤長這樣：{ detail: [{ loc, msg }] }
  if (Array.isArray(body.detail) && body.detail.length > 0) {
    const first = body.detail[0]
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null
    return field ? `${field}：${first.msg}` : first.msg
  }
  if (typeof body.detail === 'string') return body.detail
  return fallback
}

/** 把字串安全地放進 HTML。自己組 HTML 時一定要過這一關。 */
export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  )
}
