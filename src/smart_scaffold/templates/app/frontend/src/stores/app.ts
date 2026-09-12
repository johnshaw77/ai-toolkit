import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const DARK_KEY = '{{name}}.dark_mode'
const COLLAPSED_KEY = '{{name}}.sidebar_collapsed'

function initialDark(): boolean {
  const saved = window.localStorage.getItem(DARK_KEY)
  if (saved !== null) return saved === '1'
  // 沒選過就跟隨系統，不要一律給亮色。
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export const useAppStore = defineStore('app', () => {
  const darkMode = ref(initialDark())
  const sidebarCollapsed = ref(window.localStorage.getItem(COLLAPSED_KEY) === '1')

  watch(
    darkMode,
    (value) => {
      // 自繪的外殼靠 data-theme 換 CSS 變數，antd 元件靠 darkAlgorithm。
      document.documentElement.dataset.theme = value ? 'dark' : 'light'
      window.localStorage.setItem(DARK_KEY, value ? '1' : '0')
    },
    { immediate: true },
  )

  watch(sidebarCollapsed, (value) => {
    window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
  })

  return { darkMode, sidebarCollapsed }
})
